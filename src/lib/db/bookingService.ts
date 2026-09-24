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
import { sessionById, BUNDLE_SESSION_BALANCES, STATUS_ORDER } from '../constants';
import { computeAddOnsTotal, computeBookingPricing, currentBalanceDue } from '../pricing';
import { generateCandidateSlots, CandidateSlot } from '../availability';
import {
  bookingConfirmedNotification,
  bookingUpdatedNotification,
  bundleSessionConfirmedNotification,
  balanceReceivedNotification,
  bundleContextAfterBalance,
  reminderNotification,
  REMINDER_THRESHOLDS,
  bundleActivatedNotification,
  invoiceNotification,
  NotifyBooking,
} from '../notifications';
import { dispatchNotification, Receipt, ClientDetails } from '../notify';
import { buildEmailHtml, sendEmail } from '../email';
import { generateIcs, icsToBase64 } from '../ics';
import { fmtDatePretty } from '../format';
import { balancePaymentReference } from '../paynow';

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

export async function getSettings(db: any): Promise<Settings> {
  let s = await db.settings.findUnique({ where: { id: 1 } });
  if (!s) s = await db.settings.create({ data: { id: 1 } });
  return s;
}

export async function getAvailableSlots(db: any, sessionTypeId: string, excludeBookingId?: string): Promise<CandidateSlot[]> {
  const st = sessionById(sessionTypeId);
  if (!st) throw new Error(`Unknown session type: ${sessionTypeId}`);
  const settings = await getSettings(db);
  const [blocks, bookings, holidays] = await Promise.all([
    // No location filter — one set of availability blocks covers all session
    // types. The photographer manages one calendar, not one per location.
    db.availabilityBlock.findMany(),
    db.booking.findMany({
      where: { status: { not: 'cancelled' } },
      select: { id: true, date: true, startTime: true, endTime: true, status: true, holdExpiresAt: true },
    }),
    db.publicHoliday.findMany(),
  ]);
  const blockingBookings = excludeBookingId
    ? bookings.filter((booking: { id: string }) => booking.id !== excludeBookingId)
    : bookings;
  return generateCandidateSlots(st, settings, blocks, blockingBookings, holidays);
}

export type CreateBookingInput = {
  sessionTypeId: string;
  date: string;
  startTime: string;
  endTime: string;
  isWeekend: boolean;
  addOns: Record<string, number>;
  notes: string;
  babyGender?: string;  // 'boy' | 'girl' | 'prefer_not_to_say' | ''
  siblingJoining?: string; // 'yes' | 'no' | ''
  siblingCount?: number;
  setupSelectionCount?: number;
  setupSelections?: { slot: number; referencePhotoUrls: string[]; note?: string; outfitSource?: 'mamamiyo'|'own'|null }[];
  inspirationReferencePhotoUrls?: string[];
  referencePhotoUrls: string[];
  address: string;
  discountCode?: string | null;
  clientName: string;
  clientEmail: string;
  countryCode: string;
  phone: string;
};

export async function createBooking(db: any, input: CreateBookingInput) {
  const st = sessionById(input.sessionTypeId);
  if (!st) throw new Error(`Unknown session type: ${input.sessionTypeId}`);
  if (st.location === 'home' && !input.address.trim()) throw new Error('Home address is required for this package.');
  if(input.siblingJoining==='yes'&&input.siblingCount!==undefined&&(!Number.isSafeInteger(input.siblingCount)||Number(input.siblingCount)<1))throw new Error('Enter how many siblings will be joining.');
  const setupSelectionCount = Number(input.setupSelectionCount ?? 0);
  if (!Number.isSafeInteger(setupSelectionCount) || setupSelectionCount < 0 || setupSelectionCount > 3) throw new Error('Number of setup selections must be between 0 and 3.');
  const setupSelections = Array.isArray(input.setupSelections) ? input.setupSelections : [];
  if (setupSelections.length > 3 || setupSelections.some(group => !Number.isSafeInteger(group?.slot) || group.slot < 1 || group.slot > 3 || !Array.isArray(group.referencePhotoUrls) || group.referencePhotoUrls.length > 3 || group.referencePhotoUrls.some(url => typeof url !== 'string' || url.length > 2000) || (group.note !== undefined && (typeof group.note !== 'string' || group.note.length > 300)) || ![undefined,null,'mamamiyo','own'].includes(group.outfitSource))) throw new Error('Each Setup may contain up to 3 valid reference photos, an outfit source and a short note.');
  const inspirationReferencePhotoUrls=Array.isArray(input.inspirationReferencePhotoUrls)?input.inspirationReferencePhotoUrls:[];
  if(inspirationReferencePhotoUrls.length>10||inspirationReferencePhotoUrls.some(url=>typeof url!=='string'||url.length>2000))throw new Error('Up to 10 valid Inspirational Reference photos are allowed.');

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
        notes: [
          input.siblingJoining ? `Sibling joining: ${input.siblingJoining}` : '',
          input.siblingJoining==='yes'&&input.siblingCount ? `Number of siblings: ${input.siblingCount}` : '',
          input.babyGender ? `Baby gender: ${input.babyGender}` : '',
          input.notes,
        ].filter(Boolean).join('\n'),
        setupSelectionCount,
        setupSelections,
        inspirationReferencePhotoUrls,
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

export async function confirmDepositAndNotify(db: any, bookingId: string) {
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
  const studioAddress = 'K-Lodge, 32 Lorong K Telok Kurau #01-01, Singapore 425641';
  const calendarEvent = {
    uid: booking.ref,
    summary: `${booking.clientName} ${booking.sessionLabel} Mamamiyo Photography`,
    description: `Your ${booking.sessionLabel} is confirmed.\n\nRef: ${booking.ref}\nBalance due after session: $${booking.balanceDue}\n\nQuestions? Reply to this email.`,
    location: booking.location === 'home' ? booking.address || 'Your home (address on file)' : studioAddress,
    dateISO: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    organizerName: settings.businessName,
    organizerEmail: process.env.RESEND_FROM_EMAIL || 'hello@mamamiyo-photography.com',
  };
  const addOnsRecord = (booking.addOns || {}) as Record<string, number>;
  const { ADDONS } = await import('../constants');
  const receipt: Receipt = {
    sessionLabel: booking.sessionLabel,
    date: booking.date,
    startTime: booking.startTime,
    location: booking.location,
    address: booking.address,
    isWeekend: booking.isWeekend,
    weekendSurcharge: settings.weekendSurcharge,
    addOns: Object.entries(addOnsRecord)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ name: ADDONS[id]?.name || id, qty, price: ADDONS[id]?.price || 0 })),
    discountCode: booking.discountCode,
    discountAmount: booking.discountAmount,
    total: booking.total,
    depositAmount: booking.depositAmount,
    balanceDue: booking.balanceDue,
    isBundle: booking.sessionTypeId === 'bundle',
    bundleSessionNumber: booking.bundleSessionNumber,
  };
  await dispatchNotification(
    pair, booking.clientEmail, booking.clientPhone, photographer.email, photographer.phone,
    calendarEvent, receipt, undefined, (booking.referencePhotoUrls as string[]) || [],
    { name: booking.clientName, email: booking.clientEmail, phone: booking.clientPhone, address: booking.address, notes: booking.notes },
    { date: booking.date, clientName: booking.clientName, sessionLabel: booking.sessionLabel }
  );
  return booking;
}

export type UpdateBookingInput = {
  sessionTypeId: string;
  date: string;
  startTime: string;
  endTime: string;
  addOns: Record<string, number>;
  address?: string;
  notes?: string;
};

/** Admin-only edit flow for pre-shoot bookings. Revalidates availability,
 * recalculates pricing, resets reminders, and sends an updated confirmation. */
export async function updateBookingAndNotify(db: any, bookingId: string, input: UpdateBookingInput) {
  const existing = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (!['pending', 'confirmed'].includes(existing.status)) {
    throw new Error('Only pending or confirmed bookings can be edited.');
  }

  const sessionType = sessionById(input.sessionTypeId);
  if (!sessionType) throw new Error('Unknown session type.');
  if (existing.bundleSessionNumber && existing.bundleSessionNumber > 1 && input.sessionTypeId !== 'bundle') {
    throw new Error('Bundle sessions 2 and 3 cannot be changed to another package.');
  }
  if (sessionType.location === 'home' && !input.address?.trim()) {
    throw new Error('A home address is required for the Newborn package.');
  }

  const sameSlot = existing.sessionTypeId === input.sessionTypeId
    && existing.date === input.date
    && existing.startTime === input.startTime
    && existing.endTime === input.endTime;
  let selectedSlot: CandidateSlot | undefined;
  if (!sameSlot) {
    const slots = await getAvailableSlots(db, input.sessionTypeId, bookingId);
    selectedSlot = slots.find((slot) => slot.date === input.date
      && slot.startTime === input.startTime
      && slot.endTime === input.endTime);
    if (!selectedSlot) throw new Error('SLOT_NOT_AVAILABLE');
  }

  if (existing.bundleParentId && existing.bundleSessionNumber === 1 && input.sessionTypeId !== 'bundle') {
    const linkedSessions = await db.booking.count({
      where: { bundleParentId: existing.bundleParentId, status: { not: 'cancelled' } },
    });
    if (linkedSessions > 1) {
      throw new Error('This bundle already has later sessions and cannot be changed to another package.');
    }
  }

  const settings = await getSettings(db);
  const isWeekend = sameSlot ? existing.isWeekend : selectedSlot!.isWeekend;
  const cleanedAddOns = Object.fromEntries(
    Object.entries(input.addOns || {})
      .filter(([id, qty]) => sessionType.addOns.includes(id) && Number.isFinite(qty) && qty > 0)
      .map(([id, qty]) => [id, Math.floor(qty)]),
  );

  let subtotal: number;
  let total: number;
  let balanceDue: number;
  let discountAmount = existing.discountAmount;
  if (input.sessionTypeId === 'bundle' && existing.bundleSessionNumber && existing.bundleSessionNumber > 1) {
    const baseBalance = BUNDLE_SESSION_BALANCES[existing.bundleSessionNumber - 1] || 0;
    balanceDue = baseBalance + computeAddOnsTotal(cleanedAddOns) + (isWeekend ? settings.weekendSurcharge : 0);
    subtotal = balanceDue;
    total = balanceDue;
    discountAmount = 0;
  } else {
    let discount: { code: string; amount: number } | null = null;
    if (existing.discountCode) {
      const savedDiscount = await db.discountCode.findUnique({ where: { code: existing.discountCode } });
      discount = savedDiscount
        ? { code: savedDiscount.code, amount: savedDiscount.amount }
        : { code: existing.discountCode, amount: existing.discountAmount };
    }
    const pricing = computeBookingPricing({
      sessionType,
      addOns: cleanedAddOns,
      isWeekend,
      weekendSurchargeAmount: settings.weekendSurcharge,
      depositAmount: existing.depositAmount,
      discount,
    });
    subtotal = pricing.subtotal;
    total = pricing.total;
    balanceDue = pricing.balanceDue;
    discountAmount = pricing.discountAmount;
  }

  const sessionNumber = input.sessionTypeId === 'bundle' ? (existing.bundleSessionNumber || 1) : null;
  const sessionLabel = sessionNumber
    ? `First Year Bundle — session ${sessionNumber} of 3`
    : sessionType.name;
  const previous = {
    date: existing.date,
    startTime: existing.startTime,
    sessionTypeId: existing.sessionTypeId,
    addOns: (existing.addOns || {}) as Record<string, number>,
    address: existing.address,
    notes: existing.notes,
  };

  const updated = await db.$transaction(async (tx: any) => {
    if (!sameSlot) {
      const now = new Date();
      const clash = await tx.booking.findFirst({
        where: {
          id: { not: bookingId },
          date: input.date,
          startTime: { lt: input.endTime },
          endTime: { gt: input.startTime },
          status: { not: 'cancelled' },
          OR: [{ status: { not: 'pending' } }, { holdExpiresAt: { gt: now } }],
        },
      });
      if (clash) throw new Error('SLOT_NOT_AVAILABLE');
    }

    let bundleParentId = existing.bundleParentId;
    if (input.sessionTypeId === 'bundle' && !bundleParentId) {
      const bundle = await tx.bundle.create({
        data: {
          ref: refCode('MMYB'),
          clientName: existing.clientName,
          clientEmail: existing.clientEmail,
          clientPhone: existing.clientPhone,
          depositAmount: existing.depositAmount,
          depositStatus: existing.depositStatus,
        },
      });
      bundleParentId = bundle.id;
    }

    const booking = await tx.booking.update({
      where: { id: bookingId },
      data: {
        sessionTypeId: input.sessionTypeId,
        sessionLabel,
        location: sessionType.location,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        isWeekend,
        addOns: cleanedAddOns,
        notes: input.notes?.trim() || '',
        address: sessionType.location === 'home' ? input.address!.trim() : '',
        subtotal,
        total,
        balanceDue,
        discountAmount,
        balanceStatus: balanceDue > 0 ? 'pending' : 'n/a',
        bundleParentId: input.sessionTypeId === 'bundle' ? bundleParentId : null,
        bundleSessionNumber: sessionNumber,
        remindersSent: [],
      },
    });

    if (existing.bundleParentId && input.sessionTypeId !== 'bundle') {
      await tx.bundle.delete({ where: { id: existing.bundleParentId } });
    }
    return booking;
  });

  const changedFields: string[] = [];
  if (previous.sessionTypeId !== updated.sessionTypeId) changedFields.push('package');
  if (previous.date !== updated.date || previous.startTime !== updated.startTime) changedFields.push('date and time');
  if (JSON.stringify(previous.addOns) !== JSON.stringify(cleanedAddOns)) changedFields.push('add-ons');
  if (previous.address !== updated.address) changedFields.push('address');
  if (previous.notes !== updated.notes) changedFields.push('notes');

  const pair = bookingUpdatedNotification(
    toNotifyBooking(updated),
    { date: previous.date, startTime: previous.startTime },
    changedFields,
    settings.businessName,
  );
  const photographer = photographerContacts();
  const calendarEvent = {
    uid: updated.ref,
    summary: `${updated.clientName} ${updated.sessionLabel} Mamamiyo Photography`,
    description: `Your updated ${updated.sessionLabel} booking is confirmed.\n\nRef: ${updated.ref}\nBalance due after session: $${updated.balanceDue}`,
    location: updated.location === 'home'
      ? updated.address || 'Your home (address on file)'
      : 'K-Lodge, 32 Lorong K Telok Kurau #01-01, Singapore 425641',
    dateISO: updated.date,
    startTime: updated.startTime,
    endTime: updated.endTime,
    organizerName: settings.businessName,
    organizerEmail: process.env.RESEND_FROM_EMAIL || 'hello@mamamiyo-photography.com',
  };
  const { ADDONS } = await import('../constants');
  const receipt: Receipt = {
    sessionLabel: updated.sessionLabel,
    date: updated.date,
    startTime: updated.startTime,
    location: updated.location,
    address: updated.address,
    isWeekend: updated.isWeekend,
    weekendSurcharge: settings.weekendSurcharge,
    addOns: Object.entries(cleanedAddOns).map(([id, qty]) => ({
      name: ADDONS[id]?.name || id,
      qty,
      price: ADDONS[id]?.price || 0,
    })),
    discountCode: updated.discountCode,
    discountAmount: updated.discountAmount,
    total: updated.total,
    depositAmount: updated.depositAmount,
    balanceDue: updated.balanceDue,
    isBundle: updated.sessionTypeId === 'bundle',
    bundleSessionNumber: updated.bundleSessionNumber,
  };

  try {
    await dispatchNotification(
      pair, updated.clientEmail, updated.clientPhone, photographer.email, photographer.phone,
      calendarEvent, receipt, undefined, (updated.referencePhotoUrls as string[]) || [],
      { name: updated.clientName, email: updated.clientEmail, phone: updated.clientPhone, address: updated.address, notes: updated.notes },
      { date: updated.date, clientName: updated.clientName, sessionLabel: updated.sessionLabel },
    );
  } catch (err) {
    throw new Error(`Booking was updated, but the confirmation email failed: ${(err as Error).message}`);
  }
  return updated;
}

export async function markCompleted(db: any, bookingId: string) {
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const due = currentBalanceDue({ balanceDue: booking.balanceDue, extraLineItems: booking.extraLineItems as { description: string; amount: number }[] });
  return db.booking.update({
    where: { id: bookingId },
    data: { status: 'pending_basic_retouch', balanceStatus: due > 0 ? 'pending' : 'n/a' },
  });
}

export async function addExtraLineItem(db: any, bookingId: string, description: string, amount: number) {
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.balanceStatus === 'paid') throw new Error('The balance is already confirmed. Charges can no longer be changed.');
  if (booking.status === 'cancelled') throw new Error('Cancelled bookings cannot be changed.');
  const items = (booking.extraLineItems as { description: string; amount: number }[]) || [];
  items.push({ description, amount });
  const due = currentBalanceDue({ balanceDue: booking.balanceDue, extraLineItems: items });
  return db.booking.update({
    where: { id: bookingId },
    data: {
      extraLineItems: items,
      balanceStatus: booking.balanceStatus === 'n/a' && due > 0 ? 'pending' : booking.balanceStatus,
      invoiceStale: Boolean(booking.invoiceRef),
      version: { increment: 1 },
    },
  });
}

export async function generateInvoiceAndNotify(db: any, bookingId: string) {
  const settings = await getSettings(db);
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const items = (booking.extraLineItems as { description: string; amount: number }[]) || [];
  const due = currentBalanceDue({ balanceDue: booking.balanceDue, extraLineItems: items });
  const invoiceRef = balancePaymentReference(booking.clientName, booking.date);

  const updated = await db.booking.update({
    where: { id: bookingId },
    data: { invoiceRef, invoiceGeneratedAt: new Date(), balanceStatus: due > 0 ? 'pending' : 'n/a' },
  });

  const pair = invoiceNotification(toNotifyBooking(updated), due, invoiceRef, items);
  const photographer = photographerContacts();
  // Build PayNow QR for email attachment
  let payNowQr: { payload: string; amount: number; ref: string } | undefined;
  try {
    const mobile = (settings.paynowMobile || '').replace(/\D/g, '').slice(-8);
    if (mobile.length === 8) {
      const { buildPayNowPayload } = await import('../paynow');
      const payload = buildPayNowPayload({ mobile8: mobile, amount: due, refNumber: invoiceRef, merchantName: settings.businessName });
      payNowQr = { payload, amount: due, ref: '' };
    }
  } catch { /* QR failed silently */ }
  // A failed send must remain retryable. Previously the invoice was marked as
  // generated before delivery and the cron silently swallowed email failures,
  // so bundle invoices could never be attempted again.
  try {
    await dispatchNotification(pair, updated.clientEmail, updated.clientPhone, photographer.email, photographer.phone, undefined, undefined, payNowQr);
  } catch (err) {
    await db.booking.update({where:{id:bookingId},data:{invoiceRef:null,invoiceGeneratedAt:null}});
    throw err;
  }
  return updated;
}

export async function confirmBalanceAndNotify(db: any, bookingId: string) {
  const settings = await getSettings(db);
  const current = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (current.balanceStatus === 'paid') throw new Error('The balance has already been confirmed.');
  const result = await db.booking.updateMany({
    where: { id: bookingId, version: current.version, balanceStatus: { not: 'paid' } },
    data: {
      balanceStatus: 'paid',
      balancePaidAt: new Date(),
      furtherRetouchReminderSentAt: null,
      version: { increment: 1 },
      // Convert old records to the photographer's pending Basic Retouch stage.
      status: current.status === 'pending_balance' ? 'pending_basic_retouch' : current.status,
    },
  });
  if (result.count !== 1) {
    throw new Error('This booking changed in another window. Refresh it before confirming the balance.');
  }
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });

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

/** Corrects an accidentally confirmed balance without changing the editing
 * stage or sending a customer notification. */
export async function reopenBalance(db: any, bookingId: string) {
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const due = currentBalanceDue({
    balanceDue: booking.balanceDue,
    extraLineItems: booking.extraLineItems as { description: string; amount: number }[],
  });
  if (due <= 0) throw new Error('This booking has no balance to reopen.');
  if (booking.balanceStatus !== 'paid') throw new Error('This balance is not marked as paid.');
  return db.booking.update({
    where: { id: bookingId },
    data: {
      balanceStatus: 'pending',
      balancePaidAt: null,
      furtherRetouchReminderSentAt: null,
    },
  });
}

/** requesterPhone is required on the public client-facing route (so a
 *  client can only cancel their own booking) and omitted on the admin
 *  route (already trusted via the session middleware — see
 *  /api/admin/bookings/[id]/cancel). */
export async function cancelBooking(db: any, bookingId: string, requesterPhone?: string, requesterEmail?: string) {
  if (requesterEmail !== undefined) {
    const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (booking.clientEmail.trim().toLowerCase() !== requesterEmail.trim().toLowerCase()) {
      throw new Error('EMAIL_MISMATCH');
    }
  } else if (requesterPhone !== undefined) {
    const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (!phonesMatch(booking.clientPhone, requesterPhone)) {
      throw new Error('PHONE_MISMATCH');
    }
  }
  return db.booking.update({ where: { id: bookingId }, data: { status: 'cancelled' } });
}

/** Manual fallback only — activation normally happens automatically inside
 *  confirmBalanceAndNotify when session 1's balance is confirmed. */
export async function activateBundleManuallyAndNotify(db: any, bundleId: string) {
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
  addOns: Record<string, number>,
  referencePhotoUrls: string[] = [],
  setupSelectionCount: number = 0,
  setupSelections: {slot:number;referencePhotoUrls:string[];note?:string;outfitSource?:'mamamiyo'|'own'|null}[] = [],
  inspirationReferencePhotoUrls: string[] = [],
  notes: string = '',
  babyGender: string = '',
  siblingJoining: string = '',
) {
  if (!Number.isSafeInteger(setupSelectionCount) || setupSelectionCount < 0 || setupSelectionCount > 3) throw new Error('Number of setup selections must be between 0 and 3.');
  if (!Array.isArray(setupSelections) || setupSelections.length > 3 || setupSelections.some(group=>!Number.isSafeInteger(group?.slot)||group.slot<1||group.slot>3||!Array.isArray(group.referencePhotoUrls)||group.referencePhotoUrls.length>3||(group.note!==undefined&&(typeof group.note!=='string'||group.note.length>300))||![undefined,null,'mamamiyo','own'].includes(group.outfitSource))) throw new Error('Each Setup may contain up to 3 reference photos, an outfit source and a short note.');
  if(!Array.isArray(inspirationReferencePhotoUrls)||inspirationReferencePhotoUrls.length>10)throw new Error('Up to 10 Inspirational Reference photos are allowed.');
  const settings = await getSettings(db);
  const bundle = await db.bundle.findUniqueOrThrow({ where: { id: bundleId } });
  if (!bundle.activated) throw new Error('BUNDLE_NOT_ACTIVATED');

  const redeemed = await db.booking.count({ where: { bundleParentId: bundleId, status: { not: 'cancelled' } } });
  const sessionIndex = redeemed; // 0-based count of existing sessions
  const sessionNumber = sessionIndex + 1; // session 2 when redeemed=1, session 3 when redeemed=2
  const baseBalance = BUNDLE_SESSION_BALANCES[sessionIndex] || 0;
  const { computeAddOnsTotal } = await import('../pricing');
  const addOnsTotal = computeAddOnsTotal(addOns);
  const weekendFee = slot.isWeekend ? settings.weekendSurcharge : 0;
  const balanceDue = baseBalance + addOnsTotal + weekendFee;

  const combinedNotes = [
    siblingJoining ? `Sibling joining: ${siblingJoining}` : '',
    babyGender ? `Baby gender: ${babyGender}` : '',
    notes,
  ].filter(Boolean).join('\n');

  const sessionLabel = `First Year Bundle — session ${sessionNumber} of 3`;

  const booking = await db.booking.create({
    data: {
      ref: refCode('MMY'),
      sessionTypeId: 'bundle',
      sessionLabel,
      location: 'studio',
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      isWeekend: slot.isWeekend,
      addOns: addOns,
      notes: combinedNotes,
      setupSelectionCount,
      setupSelections,
      inspirationReferencePhotoUrls,
      referencePhotoUrls,
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
      bundleSessionNumber: sessionNumber,
    },
  });

  const pair = bundleSessionConfirmedNotification(toNotifyBooking(booking), sessionNumber - 2, balanceDue, settings.businessName);
  const photographer = photographerContacts();
  const calendarEvent = {
    uid: booking.ref,
    summary: `${bundle.clientName} ${sessionLabel} Mamamiyo Photography`,
    description: `Your ${sessionLabel} is confirmed.\n\nRef: ${booking.ref}\nBalance due after session: $${balanceDue}\n\nQuestions? Reply to this email.`,
    location: 'Home Studio @ K-Lodge, 32 Lorong K Telok Kurau #01-01, Singapore 425641',
    dateISO: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    organizerName: settings.businessName,
    organizerEmail: process.env.RESEND_FROM_EMAIL || 'hello@mamamiyo-photography.com',
  };
  await dispatchNotification(
    pair, booking.clientEmail, booking.clientPhone, photographer.email, photographer.phone,
    calendarEvent, undefined, undefined, referencePhotoUrls,
    { name: bundle.clientName, email: bundle.clientEmail, phone: bundle.clientPhone, notes: combinedNotes },
    { date: slot.date, clientName: bundle.clientName, sessionLabel }
  );
  return booking;
}

export async function lookupByEmail(db: any, email: string) {
  const norm = email.trim().toLowerCase();
  if (!norm) return { bookings: [], bundles: [] };
  const [bookings, bundles] = await Promise.all([
    db.booking.findMany({ orderBy: { date: 'desc' } }),
    db.bundle.findMany({ where: { depositStatus: 'paid' } }),
  ]);
  return {
    bookings: bookings.filter((b: any) => b.clientEmail.trim().toLowerCase() === norm),
    bundles: bundles.filter((b: any) => b.clientEmail.trim().toLowerCase() === norm),
  };
}

/** @deprecated Use lookupByEmail instead — kept for phone-based ownership check in cancelBooking */
function phonesMatch(a: string, b: string): boolean {
  const na = a.replace(/\D/g, '');
  const nb = b.replace(/\D/g, '');
  return na.length > 0 && nb.length > 0 && (na.endsWith(nb) || nb.endsWith(na));
}

export async function lookupByPhone(db: any, rawPhone: string) {
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

export async function purgeExpiredHolds(db: any) {
  const now = new Date();
  const { count } = await db.booking.updateMany({
    where: { status: 'pending', holdExpiresAt: { lt: now } },
    data: { status: 'cancelled', depositStatus: 'pending' },
  });
  return count;
}

/** Editing pipeline only — moving a booking from 'basic_retouch' to
 *  'further_retouch' to final 'completed'. Earlier stages have
 *  their own dedicated transitions (confirmDepositAndNotify, markCompleted,
 *  confirmBalanceAndNotify) and are intentionally not reachable here. */
const ADVANCEABLE_STATUSES = ['pending_balance', 'pending_basic_retouch', 'basic_retouch', 'further_retouch'];
const REVERSIBLE_POST_PROCESSING_STATUSES: Record<string, string> = {
  pending_basic_retouch: 'confirmed',
  basic_retouch: 'pending_basic_retouch',
  further_retouch: 'basic_retouch',
  completed: 'further_retouch',
};

export async function advanceStage(db: any, bookingId: string) {
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (!ADVANCEABLE_STATUSES.includes(booking.status)) {
    throw new Error(`Cannot advance stage from status "${booking.status}".`);
  }
  const isEarlyBundleSession = booking.sessionTypeId === 'bundle'
    && booking.bundleSessionNumber !== null
    && booking.bundleSessionNumber < 3;
  const nextStatus = booking.status === 'pending_basic_retouch' && isEarlyBundleSession
    ? 'completed'
    : booking.status === 'pending_balance'
    ? 'basic_retouch'
    : STATUS_ORDER[STATUS_ORDER.indexOf(booking.status as (typeof STATUS_ORDER)[number]) + 1];
  return db.booking.update({ where: { id: bookingId }, data: { status: nextStatus } });
}

/** Rolls back one workflow stage without changing payment records or
 * sending customer notifications. */
export async function revertStage(db: any, bookingId: string) {
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const previousStatus = booking.status === 'completed'
    && booking.sessionTypeId === 'bundle'
    && booking.bundleSessionNumber !== null
    && booking.bundleSessionNumber < 3
    ? 'pending_basic_retouch'
    : REVERSIBLE_POST_PROCESSING_STATUSES[booking.status];
  if (!previousStatus) {
    throw new Error(`Cannot go back from status "${booking.status}".`);
  }
  return db.booking.update({ where: { id: bookingId }, data: { status: previousStatus } });
}

/** Completes post-processing directly from basic retouch when the client does
 * not require a further-retouch round. */
export async function skipFurtherRetouch(db: any, bookingId: string) {
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.status !== 'basic_retouch' && booking.status !== 'pending_balance') {
    throw new Error(`Cannot skip further retouch from status "${booking.status}".`);
  }
  return db.booking.update({ where: { id: bookingId }, data: { status: 'completed' } });
}

function oneCalendarMonthAfter(value: Date): Date {
  const source = new Date(value);
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    year,
    month,
    Math.min(source.getUTCDate(), lastDay),
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds(),
  ));
}

/** Sends Gallery reminders from the Gallery creation date: after seven days,
 * after one calendar month, then monthly until the client submits. */
export async function checkAndSendGalleryReminders(db: any, now = new Date()) {
  const settings = await getSettings(db);
  const galleries = await db.galleryInbox.findMany();
  let selectionSent = 0;
  let expirySent = 0;
  for (const gallery of galleries) {
    const booking = await db.booking.findUnique({where:{id:gallery.bookingId}});
    if (!booking || booking.status === 'cancelled') continue;
    const firstName = booking.clientName.split(' ')[0] || booking.clientName;
    const createdAt=new Date(gallery.createdAt);
    const firstWeekDue=new Date(createdAt.getTime()+7*24*60*60*1000);
    const firstMonthDue=oneCalendarMonthAfter(createdAt);
    const lastSelectionReminder=gallery.selectionReminderSentAt?new Date(gallery.selectionReminderSentAt):null;
    let selectionReminderLabel:string|null=null;
    if(!lastSelectionReminder){
      if(firstMonthDue<=now)selectionReminderLabel='one month';
      else if(firstWeekDue<=now)selectionReminderLabel='one week';
    }else{
      const nextDue=lastSelectionReminder<firstMonthDue?firstMonthDue:oneCalendarMonthAfter(lastSelectionReminder);
      if(nextDue<=now)selectionReminderLabel=lastSelectionReminder<firstMonthDue?'one month':'another month';
    }
    if (gallery.selectionEnabled && !gallery.submitted && selectionReminderLabel) {
      const timing=selectionReminderLabel==='one week'?'one week':selectionReminderLabel==='one month'?'one month':'another month';
      const body = [`Hi ${firstName}!`,`Your Basic Retouch Gallery has been ready for ${timing}. Please open your private Gallery link to choose and submit the photographs you would like us to Further Retouch.`,`If you need help or no longer require Further Retouch, please contact us.`,settings.businessName].join('\n\n');
      const html = buildEmailHtml({title:'Photo Selection Reminder',paragraphs:body.split('\n\n'),details:[{label:'Session',value:booking.sessionLabel},{label:'Photoshoot date',value:fmtDatePretty(booking.date)}],businessName:settings.businessName});
      await sendEmail(booking.clientEmail,`Reminder: Select your Further Retouch photos — ${booking.sessionLabel}`,body,undefined,html);
      await db.galleryInbox.updateMany({where:{galleryId:gallery.galleryId,selectionReminderSentAt:gallery.selectionReminderSentAt??null},data:{selectionReminderSentAt:now}});
      selectionSent++;
    }
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    if (gallery.expiresAt && !gallery.expiryReminderSentAt && gallery.expiresAt > now && gallery.expiresAt <= threeDaysFromNow) {
      const deadline = fmtDatePretty(gallery.expiresAt.toISOString().slice(0,10));
      const body = [`Hi ${firstName}!`,`Your private Gallery will expire on ${deadline}. Please open your original private Gallery link and download your photographs before the deadline.`,`Please contact us before the deadline if you need help.`,settings.businessName].join('\n\n');
      const html = buildEmailHtml({title:'Gallery Download Deadline',paragraphs:body.split('\n\n'),details:[{label:'Session',value:booking.sessionLabel},{label:'Deadline',value:deadline}],businessName:settings.businessName});
      await sendEmail(booking.clientEmail,`Your Gallery expires in 3 days — ${booking.sessionLabel}`,body,undefined,html);
      await db.galleryInbox.updateMany({where:{galleryId:gallery.galleryId,expiryReminderSentAt:null},data:{expiryReminderSentAt:now}});
      expirySent++;
    }
  }
  return {selectionSent,expirySent};
}

/** Backward-compatible entry point used by existing operational checks. */
export async function checkAndSendFurtherRetouchReminders(db: any, now = new Date()) {
  if (db.galleryInbox) return (await checkAndSendGalleryReminders(db, now)).selectionSent;
  const awaitingSelection = await db.booking.findMany({where:{status:'basic_retouch',balanceStatus:'paid'}});
  let sent = 0;
  for (const booking of awaitingSelection) {
    if (!booking.balancePaidAt) continue;
    const anchor = booking.furtherRetouchReminderSentAt || booking.balancePaidAt;
    if (oneCalendarMonthAfter(new Date(anchor)) > now) continue;
    await db.booking.update({where:{id:booking.id},data:{furtherRetouchReminderSentAt:now}});
    sent++;
  }
  return sent;
}

function singaporeDateString(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Sends the balance invoice at 6pm SGT on the photoshoot date. The cron
 * route controls the time; this function protects against duplicates. */
export async function sendShootDayBalanceInvoices(db: any, now = new Date()) {
  const commonWhere = {
      status: { in: ['confirmed', 'pending_balance', 'pending_basic_retouch', 'basic_retouch', 'further_retouch', 'completed'] },
      balanceStatus: 'pending',
      invoiceGeneratedAt: null,
  };
  const [todayBookings,missedBundleBookings] = await Promise.all([db.booking.findMany({
    where: {
      ...commonWhere,date: singaporeDateString(now),
    },
  }),db.booking.findMany({where:{...commonWhere,date:{lt:singaporeDateString(now)},bundleParentId:{not:null}}})]);
  const bookings=[...todayBookings,...missedBundleBookings.filter((item:any)=>!todayBookings.some((today:any)=>today.id===item.id))];
  let sent = 0;
  for (const booking of bookings) {
    try {
      await generateInvoiceAndNotify(db, booking.id);
      sent++;
    } catch (error) {
      console.error(`Automatic invoice failed for ${booking.ref}:`,(error as Error).message);
    }
  }
  return sent;
}

export async function checkAndSendReminders(db: any) {
  const settings = await getSettings(db);
  const now = new Date();
  const upcoming = await db.booking.findMany({ where: { status: 'confirmed' } });
  const photographer = photographerContacts();
  let sent = 0;

  for (const booking of upcoming) {
    const sessionStart = new Date(`${booking.date}T${booking.startTime}:00+08:00`);
    const hoursUntil = (sessionStart.getTime() - now.getTime()) / 3600000;
    if (hoursUntil <= 0) continue;
    const already = (booking.remindersSent as string[]) || [];
    for (const threshold of REMINDER_THRESHOLDS) {
      if (hoursUntil <= threshold.hours && !already.includes(threshold.key)) {
        const pair = reminderNotification(toNotifyBooking(booking), threshold, settings.businessName);
        if(threshold.key==='3day'){
          const setupSelections=Array.isArray(booking.setupSelections)?booking.setupSelections:[];
          const inspiration=Array.isArray(booking.inspirationReferencePhotoUrls)?booking.inspirationReferencePhotoUrls:[];
          const hasSetupChoice=setupSelections.some((group:any)=>group?.outfitSource||group?.note?.trim()||(Array.isArray(group?.referencePhotoUrls)&&group.referencePhotoUrls.length>0))||inspiration.length>0;
          if(!hasSetupChoice){
            pair.client.emailSubject=`Action needed: Confirm your Setup — ${booking.sessionLabel}`;
            pair.client.emailBody+=`\n\nYour Setup choice is still blank. Please confirm your preferred Setup before the photoshoot by replying to this email or contacting us on WhatsApp. You may send screenshots from the MamaMiyo Photography Portfolio.`;
          }
        }
        await dispatchNotification(pair, booking.clientEmail, booking.clientPhone, photographer.email, photographer.phone);
        already.push(threshold.key);
        await db.booking.update({ where: { id: booking.id }, data: { remindersSent: already } });
        sent++;
      }
    }
  }
  return sent;
}
