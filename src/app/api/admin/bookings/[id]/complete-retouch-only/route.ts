import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { completeRetouchOnlyBooking } from '@/lib/db/bookingService';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const booking = await completeRetouchOnlyBooking(db, id);
    return NextResponse.json({ booking });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
