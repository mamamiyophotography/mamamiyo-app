import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSettings } from '@/lib/db/bookingService';
import { buildPayNowPayload } from '@/lib/paynow';
import { currentBalanceDue } from '@/lib/pricing';
import { invoiceNotification } from '@/lib/notifications';
import { dispatchNotification } from '@/lib/notify';

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

    // Send notification — don't let this crash the whole route
    try {
      const pair = invoiceNotification(
        {
          ref: updated.ref, sessionTypeId: updated.sessionTypeId, sessionLabel: updated.sessionLabel,
          location: updated.location, date: updated.date, startTime: updated.startTime,
          clientName: updated.clientName, bundleSessionNumber: updated.bundleSessionNumber,
        },
        due, invoiceRef, items
      );
      const photographer = photographerContacts();
      await dispatchNotification(pair, updated.clientEmail, updated.clientPhone, photographer.email, photographer.phone);
    } catch (notifyErr) {
      console.error('Invoice notification failed:', (notifyErr as Error).message);
    }

    // Build PayNow QR — don't crash if mobile not set yet
    let payNowPayload: string | null = null;
    try {
      const mobile = (settings.paynowMobile || '').replace(/\D/g, '').slice(-8);
      if (mobile.length === 8) {
        payNowPayload = buildPayNowPayload({
          mobile8: mobile,
          amount: due,
          refNumber: invoiceRef,
          merchantName: settings.businessName,
        });
      }
    } catch (qrErr) {
      console.error('PayNow QR generation failed:', (qrErr as Error).message);
    }

    return NextResponse.json({ booking: updated, payNowPayload, due });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
