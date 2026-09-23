import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSettings } from '@/lib/db/bookingService';
import { balancePaymentReference, buildPayNowPayload } from '@/lib/paynow';
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await req.json().catch(() => ({})) as { sendEmail?: boolean };
    const shouldSendEmail = body.sendEmail !== false;
    const { id } = await params;
    const settings = await getSettings(db);
    const booking = await db.booking.findUniqueOrThrow({ where: { id } });
    const items = (booking.extraLineItems as { description: string; amount: number }[]) || [];
    const due = currentBalanceDue({ balanceDue: booking.balanceDue, extraLineItems: items });
    const invoiceRef = balancePaymentReference(booking.clientName, booking.date);

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
      sessionLabel: booking.sessionLabel,
      date: booking.date,
      startTime: booking.startTime,
      location: booking.location,
      address: booking.address || '',
      isWeekend: booking.isWeekend,
      weekendSurcharge: settings.weekendSurcharge,
      addOns: Object.entries(addOnsRecord)
        .filter(([, q]) => q > 0)
        .map(([id, qty]) => ({ name: ADDONS[id]?.name || id, qty, price: ADDONS[id]?.price || 0 })),
      discountCode: (booking.discountCode as string | null) || null,
      discountAmount: (booking.discountAmount as number) || 0,
      extraLineItems: items,
      // For bundle invoices: total = pure session balance ($330/$330/$328)
      // receiptRows adds weekendFee and addOns on top separately
      total: String(booking.sessionTypeId) === 'bundle'
        ? (booking.balanceDue as number) - weekendFee - addOnsTotal
        : (booking.total as number),
      depositAmount: booking.depositAmount,
      balanceDue: due,
      isBundle: String(booking.sessionTypeId) === 'bundle',
      bundleSessionNumber: booking.bundleSessionNumber as number | null,
      isInvoice: true,
    };

    if (shouldSendEmail) try {
      const pair = invoiceNotification(
        {
          ref: booking.ref, sessionTypeId: booking.sessionTypeId, sessionLabel: booking.sessionLabel,
          location: booking.location, date: booking.date, startTime: booking.startTime,
          clientName: booking.clientName, bundleSessionNumber: booking.bundleSessionNumber,
          clientEmail: booking.clientEmail,
        },
        due, invoiceRef, items
      );
      const photographer = photographerContacts();
      await dispatchNotification(
        pair, booking.clientEmail, booking.clientPhone, photographer.email, photographer.phone,
        undefined, invoiceReceipt, payNowQr, undefined, undefined,
        { date: booking.date, clientName: booking.clientName, sessionLabel: booking.sessionLabel }
      );
    } catch (notifyErr) {
      throw new Error(`Invoice was not sent: ${(notifyErr as Error).message}`);
    }

    const updated = await db.booking.update({
      where: { id },
      data: { invoiceRef, invoiceGeneratedAt: new Date(), invoiceStale: false, balanceStatus: due > 0 ? 'pending' : 'n/a' },
    });

    return NextResponse.json({ booking: { ...updated, referencePhotoUrls: [] }, payNowPayload, due, emailed: shouldSendEmail });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
