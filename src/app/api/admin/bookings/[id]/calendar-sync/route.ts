import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { syncBookingToGoogleCalendar } from '@/lib/googleCalendar';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const booking = await db.booking.findUnique({ where: { id } });
    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    if (booking.depositStatus !== 'paid') {
      return NextResponse.json({ error: 'Confirm the booking fee before adding this booking to Google Calendar.' }, { status: 400 });
    }
    const calendar = await syncBookingToGoogleCalendar(db, booking);
    if (!calendar.synced) return NextResponse.json({ error: calendar.message }, { status: 400 });
    return NextResponse.json({ booking: calendar.booking, calendar });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
