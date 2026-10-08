import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { updateBookingAndNotify } from '@/lib/db/bookingService';
import { withoutPrivateAnalytics } from '@/lib/analytics/server';

type RescheduleBody = { email?: string; date?: string; startTime?: string; endTime?: string };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: RescheduleBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!body.email || !body.date || !body.startTime || !body.endTime) {
    return NextResponse.json({ error: 'Email and a new date and time are required.' }, { status: 400 });
  }

  try {
    const existing = await db.booking.findUniqueOrThrow({ where: { id } });
    if (existing.clientEmail.trim().toLowerCase() !== body.email.trim().toLowerCase()) {
      return NextResponse.json({ error: "That email address doesn't match this booking." }, { status: 403 });
    }
    if (!['pending', 'confirmed'].includes(existing.status)) {
      return NextResponse.json({ error: 'This booking can no longer be rescheduled online.' }, { status: 400 });
    }
    const booking = await updateBookingAndNotify(db, id, {
      sessionTypeId: existing.sessionTypeId,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      addOns: (existing.addOns || {}) as Record<string, number>,
      address: existing.address,
      location: existing.location,
      notes: existing.notes,
      discountCode: existing.discountCode,
    });
    return NextResponse.json(withoutPrivateAnalytics({ booking, emailSent: true }));
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json(
      { error: message === 'SLOT_NOT_AVAILABLE' ? 'That time has just been taken. Please choose another available time.' : message },
      { status: message === 'SLOT_NOT_AVAILABLE' ? 409 : 400 },
    );
  }
}
