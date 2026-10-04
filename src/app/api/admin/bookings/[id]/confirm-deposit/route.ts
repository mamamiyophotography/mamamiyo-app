import { after, NextRequest, NextResponse } from 'next/server';
import { deliverOutbox } from '@/lib/analytics/server';
import { db } from '@/lib/db/client';
import { confirmDepositAndNotify } from '@/lib/db/bookingService';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const booking = await confirmDepositAndNotify(db, id);
    after(async () => { try { await deliverOutbox(db); } catch { console.error('Analytics delivery unavailable'); } });
    return NextResponse.json({ booking });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
