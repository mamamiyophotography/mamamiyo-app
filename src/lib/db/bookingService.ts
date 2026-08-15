// The complete booking lifecycle, ported from the prototype's stateful
// functions (createPendingBooking, confirmDeposit, markCompleted,
// generateInvoice, confirmBalance, cancelBooking, redeemBundleSession,
// activateBundle, checkReminders) onto a real database via Prisma.
//
// One genuine improvement over the prototype here: createBooking runs
// inside a DB transaction with a slot-clash check, so two people can no
// longer grab the same slot in the same instant — the prototype flagged
// this as a known limitation it couldn't fully solve client-side.
//
// Client-facing routes (Phase 2) use: getAvailableSlots, createBooking,
// lookupByPhone, cancelBookingAndNotify, redeemBundleSessionAndNotify.
// Admin routes (Phase 3) will wrap the rest — they're built now so the
// whole lifecycle lives in one tested module instead of being split
// awkwardly across phases.

import { Db, Settings } from './types';
import { sessionById, BUNDLE_SESSION_BALANCES } from '../constants';
import { computeBookingPricing, currentBalanceDue } from '../pricing';
import { generateCandidateSlots, CandidateSlot } from '../availability';
import {
  bookingConfirmedNotification,
  bundleSessionConfirmedNotification,
  balanceReceivedNotification,
  bundleContextAfterBalance,
  reminderNotification,
  REMINDER_THRESHOLDS,
  bundleActivatedNotification,
  invoiceNotification,
  NotifyBooking,
} from '../notifications';
import { dispatchNotification } from '../notify';

const PHOTOGRAPHER_EMAIL_ENV = 'PHOTOGRAPHER_EMAIL';
const PHOTOGRAPHER_PHONE_ENV = 'PHOTOGRAPHER_PHONE';

function photographerContacts(): { email: string; phone: string } {
  const email = process.env[PHOTOGRAPHER_EMAIL_ENV];
  const phone = process.env[PHOTOGRAPHER_PHONE_ENV];
  if (!email || !phone) {
    throw new Error(`Set ${PHOTOGRAPHER_EMAIL_ENV} and ${PHOTOGRAPHER_PHONE_ENV} in .env`);
  }
  return { email, phone };
}

function refCode(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${s}`;
}

function fullPhone(countryCode: string, phone: string): string {
  return [countryCode.trim(), phone.trim()].filter(Boolean).join(' ');
}

export async function getSettings(db: Db): Promise<Settings> {
  let s = await db.settings.findUnique({ where: { id: 1 } });
  if (!s) s = await db.settings.create({ data: { id: 1 } });
  return s;
}

export async function getAvailableSlots(db: Db, sessionTypeId: string): Promise<CandidateSlot[]> {
  const st = sessionById(sessionTypeId);
  if (!st) throw new Error(`Unknown session type: ${sessionTypeId}`);
  const settings = await getSettings(db);
  const [blocks, bookings, holidays] = await Promise.all([
    db.availabilityBlock.findMany({ where: { location: st.location } }),
    db.booking.findMany({
      where: { status: { not: 'cancelled' } },
      select: { date: true, startTime: true, endTime: true, status: true, holdExpiresAt: true },
    }),
    db.publicHoliday.findMany(),
  ]);
  return generateCandidateSlots(st, settings, blocks, bookings, holidays);
}

export type CreateBookingInput = {
  sessionTypeId: string;
  date: string;
  startTime: string;
  endTime: string;
  isWeekend: boolean;
  addOns: Record<string, number>;
  notes: string;
  referencePhotoUrls: string[];
  address: string;
  discountCode?: string | null;
  clientName: string;
  clientEmail: string;
  countryCode: string;
  phone: string;
};

export async function createBooking(db: Db, input: CreateBookingInput) {
  const st = sessionById(input.sessionTypeId);
  if (!st) throw new Error(`Unknown session type: ${input.sessionTypeId}`);
  if (!input.referencePhotoUrls.length) throw new Error('At least one reference photo is required.');
  if (st.location === 'home' && !input.address.trim()) throw new Error('Home address is required for this package.');

  const settings = await getSettings(db);

  let discount: { code: string; amount: number } | null = null;
  if (input.discountCode) {
    const found = await db.discountCode.findUnique({ where: { code: input.discountCode.toUpperCase() } });
    if (found) discount = { code: found.code, amount: found.amount };
  }

  const pricing = computeBookingPricing({
    sessionType: st,
    addOns: input.addOns,
    isWeekend: input.isWeekend,
    weekendSurchargeAmount: settings.weekendSurcharge,
    depositAmount: settings.depositAmount,
    discount,
  });

  const clientPhone = fullPhone(input.countryCode, input.phone);
  const ref = refCode('MMY');
  const holdExpiresAt = new Date(Date.now() + settings.holdWindowMinutes * 60000);

  return db.$transaction(async (tx) => {
    // Re-check the slot is still free *inside* the transaction — this is
    // what actually prevents two people booking the same slot at once,
    // something the browser-only prototype flagged as a known gap.
    const now = new Date();
    const clash = await tx.booking.findFirst({
      where: {
        date: input.date,
        startTime: { lt: input.endTime },
        endTime: { gt: input.startTime },
        NOT: { status: 'cancelled' },
        OR: [{ status: { not: 'pending' } }, { holdExpiresAt: { gt: now } }],
      },
    });
    if (clash) throw new Error('SLOT_TAKEN');

    let bundleId: string | null = null;
    if (st.isBundle) {
      const bundle = await tx.bundle.create({
        data: {
          ref: refCode('MMYB'),
          clientName: input.clientName,
          clientEmail: input.clientEmail,
          clientPhone,
          depositAmount: settings.depositAmount,
        },
      });
      bundleId = bundle.id;
    }

    const booking = await tx.booking.create({
      data: {
        ref,
        sessionTypeId: st.id,
        sessionLabel: st.isBundle ? 'First Year Bundle — session 1 of 3' : st.name,
        location: st.location,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        isWeekend: input.isWeekend,
        addOns: input.addOns,
        notes: input.notes,
        referencePhotoUrls: input.referencePhotoUrls,
        address: st.location === 'home' ? input.address : '',
        discountCode: discount?.code,
        discountAmount: pricing.discountAmount,
        clientName: input.clientName,
        clientEmail: input.clientEmail,
        clientPhone,
        subtotal: pricing.subtotal,
        total: pricing.total,
        depositAmount: pricing.depositAmount,
        balanceDue: pricing.balanceDue,
        status: 'pending',
        holdExpiresAt,
        depositRef: ref,
        depositStatus: 'pending',
        balanceStatus: pricing.balanceDue > 0 ? 'pending' : 'n/a',
        bundleParentId: bundleId,
        bundleSessionNumber: st.isBundle ? 1 : null,
      },
    });

    return booking;
  });
}

function toNotifyBooking(b: { ref: string; sessionTypeId: string; sessionLabel: string; location: string; date: string; startTime: string; clientName: string; bundleSessionNumber: number | null }): NotifyBooking {
  return { ...b };
}

export async function confirmDepositAndNotify(db: Db, bookingId: string) {
  const settings = await getSettings(db);
  const booking = await db.booking.update({
    where: { id: bookingId },
    data: { status: 'confirmed', depositStatus: 'paid' },
  });

  if (booking.bundleParentId) {
    const bundle = await db.bundle.findUnique({ where: { id: booking.bundleParentId } });
    if (bundle && bundle.depositStatus !== 'paid') {
      await db.bundle.update({ where: { id: bundle.id }, data: { depositStatus: 'paid' } });
    }
  }

  const pair = bookingConfirmedNotification(toNotifyBooking(booking), settings.businessName);
  const photographer = photographerContacts();
  await dispatchNotification(pair, booking.clientEmail, booking.clientPhone, photographer.email, photographer.phone);
  return booking;
}

export async function markCompleted(db: Db, bookingId: string) {
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const due = currentBalanceDue({ balanceDue: booking.balanceDue, extraLineItems: booking.extraLineItems as { description: string; amount: number }[] });
  if (due <= 0) {
    return db.booking.update({ where: { id: bookingId }, data: { status: 'completed', balanceStatus: 'n/a' } });
  }
  return db.booking.update({ where: { id: bookingId }, data: { status: 'pending_balance' } });
}

export async function addExtraLineItem(db: Db, bookingId: string, description: string, amount: number) {
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const items = (booking.extraLineItems as { description: string; amount: number }[]) || [];
  items.push({ description, amount });
  const due = currentBalanceDue({ balanceDue: booking.balanceDue, extraLineItems: items });
  return db.booking.update({
    where: { id: bookingId },
    data: {
      extraLineItems: items,
      balanceStatus: booking.balanceStatus === 'n/a' && due > 0 ? 'pending' : booking.balanceStatus,
    },
  });
}

export async function generateInvoiceAndNotify(db: Db, bookingId: string) {
  const settings = await getSettings(db);
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const items = (booking.extraLineItems as { description: string; amount: number }[]) || [];
  const due = currentBalanceDue({ balanceDue: booking.balanceDue, extraLineItems: items });
  const invoiceRef = refCode('BAL');

  const updated = await db.booking.update({
    where: { id: bookingId },
    data: { invoiceRef, invoiceGeneratedAt: new Date(), balanceStatus: due > 0 ? 'pending' : 'n/a' },
  });

  const pair = invoiceNotification(toNotifyBooking(updated), due, invoiceRef, items);
  const photographer = photographerContacts();
  await dispatchNotification(pair, updated.clientEmail, updated.clientPhone, photographer.email, photographer.phone);
  return updated;
}

export async function confirmBalanceAndNotify(db: Db, bookingId: string) {
  const settings = await getSettings(db);
  const booking = await db.booking.update({
    where: { id: bookingId },
    data: { balanceStatus: 'paid', status: 'completed' },
  });

  const bundleContext = bundleContextAfterBalance(booking.bundleSessionNumber);
  if (booking.bundleParentId && bundleContext && 'nextSessionNumber' in bundleContext) {
    const bundle = await db.bundle.findUnique({ where: { id: booking.bundleParentId } });
    if (bundle && !bundle.activated) {
      await db.bundle.update({ where: { id: bundle.id }, data: { activated: true, activatedAt: new Date() } });
    }
  }

  const pair = balanceReceivedNotification(toNotifyBooking(booking), settings.businessName, bundleContext);
  const photographer = photographerContacts();
  await dispatchNotification(pair, booking.clientEmail, booking.clientPhone, photographer.email, photographer.phone);
  return booking;
}

/** requesterPhone is required on the public client-facing route (so a
 *  client can only cancel their own booking) and omitted on the admin
 *  route (already trusted via the session middleware — see
 *  /api/admin/bookings/[id]/cancel). */
export async function cancelBooking(db: Db, bookingId: string, requesterPhone?: string) {
  if (requesterPhone !== undefined) {
    const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (!phonesMatch(booking.clientPhone, requesterPhone)) {
      throw new Error('PHONE_MISMATCH');
    }
  }
  return db.booking.update({ where: { id: bookingId }, data: { status: 'cancelled' } });
}

/** Manual fallback only — activation normally happens automatically inside
 *  confirmBalanceAndNotify when session 1's balance is confirmed. */
export async function activateBundleManuallyAndNotify(db: Db, bundleId: string) {
  const settings = await getSettings(db);
  const bundle = await db.bundle.findUniqueOrThrow({ where: { id: bundleId } });
  if (bundle.depositStatus !== 'paid' || bundle.activated) return bundle;
  const updated = await db.bundle.update({ where: { id: bundleId }, data: { activated: true, activatedAt: new Date() } });
  const pair = bundleActivatedNotification(updated.ref, updated.clientName, settings.businessName);
  const photographer = photographerContacts();
  await dispatchNotification(pair, updated.clientEmail, updated.clientPhone, photographer.email, photographer.phone);
  return updated;
}

export async function redeemBundleSessionAndNotify(
  db: Db,
  bundleId: string,
  slot: { date: string; startTime: string; endTime: string; isWeekend: boolean },
  addOns: Record<string, number>
) {
  const settings = await getSettings(db);
  const bundle = await db.bundle.findUniqueOrThrow({ where: { id: bundleId } });
  if (!bundle.activated) throw new Error('BUNDLE_NOT_ACTIVATED');

  const redeemed = await db.booking.count({ where: { bundleParentId: bundleId, status: { not: 'cancelled' } } });
  const sessionIndex = redeemed; // 0-based: 0 = session 2, 1 = session 3
  const baseBalance = BUNDLE_SESSION_BALANCES[sessionIndex] || 0;
  const { computeAddOnsTotal } = await import('../pricing');
  const addOnsTotal = computeAddOnsTotal(addOns);
  const weekendFee = slot.isWeekend ? settings.weekendSurcharge : 0;
  const balanceDue = baseBalance + addOnsTotal + weekendFee;

  const booking = await db.booking.create({
    data: {
      ref: refCode('MMY'),
      sessionTypeId: 'bundle',
      sessionLabel: `First Year Bundle — session ${sessionIndex + 1} of 3`,
      location: 'studio',
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      isWeekend: slot.isWeekend,
      addOns: addOns,
      referencePhotoUrls: [],
      clientName: bundle.clientName,
      clientEmail: bundle.clientEmail,
      clientPhone: bundle.clientPhone,
      subtotal: balanceDue,
      total: balanceDue,
      depositAmount: 0,
      balanceDue,
      status: 'confirmed',
      depositStatus: 'n/a',
      balanceStatus: balanceDue > 0 ? 'pending' : 'n/a',
      bundleParentId: bundle.id,
      bundleSessionNumber: sessionIndex + 1,
    },
  });

  const pair = bundleSessionConfirmedNotification(toNotifyBooking(booking), sessionIndex, balanceDue, settings.businessName);
  const photographer = photographerContacts();
  await dispatchNotification(pair, booking.clientEmail, booking.clientPhone, photographer.email, photographer.phone);
  return booking;
}

/** Loose phone matching, tolerant of country-code prefixes/formatting
 *  differences — shared between lookup and the ownership check below. */
function phonesMatch(a: string, b: string): boolean {
  const na = a.replace(/\D/g, '');
  const nb = b.replace(/\D/g, '');
  return na.length > 0 && nb.length > 0 && (na.endsWith(nb) || nb.endsWith(na));
}

export async function lookupByPhone(db: Db, rawPhone: string) {
  const norm = rawPhone.replace(/\D/g, '');
  if (!norm) return { bookings: [], bundles: [] };
  const [bookings, bundles] = await Promise.all([
    db.booking.findMany({ orderBy: { date: 'desc' } }),
    db.bundle.findMany({ where: { depositStatus: 'paid' } }),
  ]);
  return {
    bookings: bookings.filter((b) => phonesMatch(b.clientPhone, rawPhone)),
    bundles: bundles.filter((b) => phonesMatch(b.clientPhone, rawPhone)),
  };
}

export async function purgeExpiredHolds(db: Db) {
  const now = new Date();
  const { count } = await db.booking.updateMany({
    where: { status: 'pending', holdExpiresAt: { lt: now } },
    data: { status: 'cancelled', depositStatus: 'pending' },
  });
  return count;
}

export async function checkAndSendReminders(db: Db) {
  const settings = await getSettings(db);
  const now = new Date();
  const upcoming = await db.booking.findMany({ where: { status: 'confirmed' } });
  const photographer = photographerContacts();
  let sent = 0;

  for (const booking of upcoming) {
    const sessionStart = new Date(`${booking.date}T${booking.startTime}:00`);
    const hoursUntil = (sessionStart.getTime() - now.getTime()) / 3600000;
    if (hoursUntil <= 0) continue;
    const already = (booking.remindersSent as string[]) || [];
    for (const threshold of REMINDER_THRESHOLDS) {
      if (hoursUntil <= threshold.hours && !already.includes(threshold.key)) {
        const pair = reminderNotification(toNotifyBooking(booking), threshold, settings.businessName);
        await dispatchNotification(pair, booking.clientEmail, booking.clientPhone, photographer.email, photographer.phone);
        already.push(threshold.key);
        await db.booking.update({ where: { id: booking.id }, data: { remindersSent: already } });
        sent++;
      }
    }
  }
  return sent;
}
