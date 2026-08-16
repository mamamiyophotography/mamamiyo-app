import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSettings } from '@/lib/db/bookingService';
import { buildPayNowPayload } from '@/lib/paynow';
import { currentBalanceDue } from '@/lib/pricing';
import { invoiceNotification } from '@/lib/notifications';
import { dispatchNotification, PayNowQr, Receipt } from '@/lib/notify';
import { ADDONS } from '@/lib/constants';

function photographerContacts() {
  return {
    email: process.env.PHOTOGRAPHER_EMAIL || '',
    phone: process.env.PHOTOGRAPHER_PHONE || '',
  };
}

function refCode(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const settings = await getSettings(db);
    const booking = await db.booking.findUniqueOrThrow({ where: { id } });
    const items = (booking.extraLineItems as { description: string; amount: number }[]) || [];
    const due = currentBalanceDue({ balanceDue: booking.balanceDue, extraLineItems: items });
    const invoiceRef = refCode('BAL');

    const updated = await db.booking.update({
      where: { id },
      data: { invoiceRef, invoiceGeneratedAt: new Date(), balanceStatus: due > 0 ? 'pending' : 'n/a' },
    });

    // Build PayNow QR
    let payNowPayload: string | null = null;
    let payNowQr: PayNowQr | undefined;
    try {
      const mobile = (settings.paynowMobile || '').replace(/\D/g, '').slice(-8);
      if (mobile.length === 8) {
        payNowPayload = buildPayNowPayload({
          mobile8: mobile,
          amount: due,
          refNumber: invoiceRef,
          merchantName: settings.businessName,
        });
        payNowQr = { payload: payNowPayload, amount: due, ref: invoiceRef };
      }
    } catch (qrErr) {
      console.error('PayNow QR generation failed:', (qrErr as Error).message);
    }

    // Build accurate invoice receipt — includes original add-ons and extra charges
    const addOnsRecord = (booking.addOns as Record<string, number>) || {};
    const weekendFee = booking.isWeekend ? settings.weekendSurcharge : 0;
    const addOnsTotal = Object.entries(addOnsRecord)
      .filter(([, q]) => q > 0)
      .reduce((s, [id, q]) => s + (ADDONS[id]?.price || 0) * q, 0);
    const basePrice = booking.total - addOnsTotal - weekendFee + ((booking.discountAmount as number) || 0);

    const invoiceReceipt: Receipt = {
      sessionLabel: updated.sessionLabel,
      date: updated.date,
      startTime: updated.startTime,
      location: updated.location,
      address: updated.address || '',
      isWeekend: updated.isWeekend,
      weekendSurcharge: settings.weekendSurcharge,
      addOns: Object.entries(addOnsRecord)
        .filter(([, q]) => q > 0)
        .map(([id, qty]) => ({ name: ADDONS[id]?.name || id, qty, price: ADDONS[id]?.price || 0 })),
      discountCode: (updated.discountCode as string | null) || null,
      discountAmount: (updated.discountAmount as number) || 0,
      extraLineItems: items,
      // For bundle invoices: total = session balance (e.g. $330), not the full booking total ($430)
      // For non-bundle: total = original session price
      total: String(updated.sessionTypeId) === 'bundle'
        ? (updated.balanceDue as number)   // session balance only
        : (booking.total as number),
      depositAmount: updated.depositAmount,
      balanceDue: due,
      isBundle: String(updated.sessionTypeId) === 'bundle',
      bundleSessionNumber: updated.bundleSessionNumber as number | null,
      isInvoice: true,
    };

    try {
      const pair = invoiceNotification(
        {
          ref: updated.ref, sessionTypeId: updated.sessionTypeId, sessionLabel: updated.sessionLabel,
          location: updated.location, date: updated.date, startTime: updated.startTime,
          clientName: updated.clientName, bundleSessionNumber: updated.bundleSessionNumber,
          clientEmail: updated.clientEmail,
        },
        due, invoiceRef, items
      );
      const photographer = photographerContacts();
      await dispatchNotification(
        pair, updated.clientEmail, updated.clientPhone, photographer.email, photographer.phone,
        undefined, invoiceReceipt, payNowQr, undefined, undefined,
        { date: updated.date, clientName: updated.clientName, sessionLabel: updated.sessionLabel }
      );
    } catch (notifyErr) {
      console.error('Invoice notification failed:', (notifyErr as Error).message);
    }

    return NextResponse.json({ booking: { ...updated, referencePhotoUrls: [] }, payNowPayload, due });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
