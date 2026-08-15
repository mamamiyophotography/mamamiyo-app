import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { createBooking, CreateBookingInput } from '@/lib/db/bookingService';
import { buildPayNowPayload } from '@/lib/paynow';
import { getSettings } from '@/lib/db/bookingService';

export async function POST(req: NextRequest) {
  let input: CreateBookingInput;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const booking = await createBooking(db, input);
    const settings = await getSettings(db);
    const payNowPayload = buildPayNowPayload({
      mobile8: settings.paynowMobile,
      amount: booking.depositAmount,
      refNumber: booking.ref,
      merchantName: settings.businessName,
    });
    return NextResponse.json({ booking, payNowPayload }, { status: 201 });
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'SLOT_TAKEN') {
      return NextResponse.json({ error: 'That slot was just taken — please pick another.' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
