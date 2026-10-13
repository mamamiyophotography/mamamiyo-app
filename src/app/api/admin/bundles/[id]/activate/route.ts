import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { activateBundleManuallyAndNotify } from '@/lib/db/bookingService';
import {finishNotification,reserveNotification} from '@/lib/notificationCooldown';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let reservation:any=null;
  try {
    reservation=await reserveNotification(db,id,'bundle_activation','bundle');
    const bundle = await activateBundleManuallyAndNotify(db, id);
    await finishNotification(db,reservation.id,'sent','Bundle activation sent');
    return NextResponse.json({ bundle });
  } catch (err) {
    if(reservation)await finishNotification(db,reservation.id,'failed',(err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
