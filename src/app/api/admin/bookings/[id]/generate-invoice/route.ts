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
    const payNowPayload = buildPayNowPayload({
      mobile8: settings.paynowMobile,
      amount: due,
      refNumber: booking.invoiceRef || booking.ref,
      merchantName: settings.businessName,
    });
    return NextResponse.json({ booking, payNowPayload, due });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
