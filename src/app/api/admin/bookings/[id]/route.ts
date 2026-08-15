import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const booking = await db.booking.findUniqueOrThrow({ where: { id } });
    return NextResponse.json({ booking });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
