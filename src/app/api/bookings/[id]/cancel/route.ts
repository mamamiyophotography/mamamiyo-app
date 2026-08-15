import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { cancelBooking } from '@/lib/db/bookingService';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.email) {
    return NextResponse.json({ error: 'email is required to cancel a booking' }, { status: 400 });
  }
  try {
    const booking = await cancelBooking(db, id, undefined, body.email);
    return NextResponse.json({ booking });
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'EMAIL_MISMATCH') {
      return NextResponse.json({ error: "That email address doesn't match this booking." }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
