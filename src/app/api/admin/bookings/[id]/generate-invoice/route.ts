import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { generateInvoiceAndNotify, getSettings } from '@/lib/db/bookingService';
import { buildPayNowPayload } from '@/lib/paynow';
import { currentBalanceDue } from '@/lib/pricing';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const booking = await generateInvoiceAndNotify(db, id);
    const settings = await getSettings(db);
    const due = currentBalanceDue({ balanceDue: booking.balanceDue, extraLineItems: booking.extraLineItems });

    // paynowMobile may not be set yet — return the invoice without a QR
    // rather than crashing, so the admin can still mark the booking done.
    let payNowPayload: string | null = null;
    if (settings.paynowMobile && settings.paynowMobile.trim().length >= 8) {
      try {
        payNowPayload = buildPayNowPayload({
          mobile8: settings.paynowMobile.replace(/\D/g, '').slice(-8),
          amount: due,
          refNumber: booking.invoiceRef || booking.ref,
          merchantName: settings.businessName,
        });
      } catch {
        // PayNow generation failed — return without QR, admin can share manually
      }
    }

    return NextResponse.json({ booking, payNowPayload, due });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
