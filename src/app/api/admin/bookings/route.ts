import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status');
  const bookings = await db.booking.findMany({
    where: status ? { status } : undefined,
    orderBy: { date: 'asc' },
  });
  return NextResponse.json({ bookings });
}
