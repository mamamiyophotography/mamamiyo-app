import { after, NextRequest, NextResponse } from 'next/server';
import { deliverOutbox } from '@/lib/analytics/server';
import { db } from '@/lib/db/client';
import { confirmDepositAndNotify } from '@/lib/db/bookingService';
import {finishNotification,reserveNotification} from '@/lib/notificationCooldown';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let reservation:any=null;
  try {
    reservation=await reserveNotification(db,id,'deposit_confirmation');
    const booking = await confirmDepositAndNotify(db, id);
    await finishNotification(db,reservation.id,'sent','Deposit confirmation sent');
    after(async () => { try { await deliverOutbox(db); } catch { console.error('Analytics delivery unavailable'); } });
    return NextResponse.json({ booking });
  } catch (err) {
    if(reservation)await finishNotification(db,reservation.id,'failed',(err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
