import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { activateBundleManuallyAndNotify } from '@/lib/db/bookingService';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const bundle = await activateBundleManuallyAndNotify(db, id);
    return NextResponse.json({ bundle });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
