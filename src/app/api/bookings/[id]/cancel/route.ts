import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { cancelBooking } from '@/lib/db/bookingService';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  // Ownership check: only someone who can supply the phone number the
  // booking was made under can cancel it here — this is the public,
  // unauthenticated route. Admins cancel via the separate, session-
  // protected /api/admin/bookings/[id]/cancel instead, which skips this.
  if (!body.phone) {
    return NextResponse.json({ error: 'phone is required to cancel a booking' }, { status: 400 });
  }
  try {
    const booking = await cancelBooking(db, id, body.phone);
    return NextResponse.json({ booking });
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'PHONE_MISMATCH') {
      return NextResponse.json({ error: "That phone number doesn't match this booking." }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
