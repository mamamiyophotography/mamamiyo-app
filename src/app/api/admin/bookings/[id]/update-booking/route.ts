import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { updateBookingAndNotify, UpdateBookingInput } from '@/lib/db/bookingService';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const input = await req.json() as UpdateBookingInput;
    const booking = await updateBookingAndNotify(db, id, input);
    return NextResponse.json({ booking, emailSent: true });
  } catch (err) {
    const message = (err as Error).message;
    const status = message === 'SLOT_NOT_AVAILABLE' ? 409 : 400;
    return NextResponse.json({
      error: message === 'SLOT_NOT_AVAILABLE'
        ? 'That time is no longer available. Please choose another slot.'
        : message,
    }, { status });
  }
}
