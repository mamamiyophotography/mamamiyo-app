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

    // Build PayNow QR safely — don't crash if mobile not configured yet
    let payNowPayload: string | null = null;
    try {
      const mobile = (settings.paynowMobile || '').replace(/\D/g, '').slice(-8);
      if (mobile.length === 8) {
        payNowPayload = buildPayNowPayload({
          mobile8: mobile,
          amount: booking.depositAmount,
          refNumber: booking.ref,
          merchantName: settings.businessName,
        });
      }
    } catch {
      // QR generation failed — client still gets the booking confirmation
    }

    // Exclude referencePhotoUrls from response — large URLs aren't needed
    // by the client at this point and can push past Vercel's 4.5MB limit
    const { referencePhotoUrls: _photos, ...bookingSlim } = booking as any;
    return NextResponse.json({ booking: bookingSlim, payNowPayload }, { status: 201 });
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'SLOT_TAKEN') {
      return NextResponse.json({ error: 'That slot was just taken — please pick another.' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
