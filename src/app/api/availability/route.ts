import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getAvailableSlots } from '@/lib/db/bookingService';

export async function GET(req: NextRequest) {
  const sessionTypeId = req.nextUrl.searchParams.get('sessionType');
  const excludeBookingId = req.nextUrl.searchParams.get('excludeBookingId') || undefined;
  if (!sessionTypeId) {
    return NextResponse.json({ error: 'sessionType query param is required' }, { status: 400 });
  }
  try {
    const slots = await getAvailableSlots(db, sessionTypeId, excludeBookingId);
    return NextResponse.json({ slots });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
