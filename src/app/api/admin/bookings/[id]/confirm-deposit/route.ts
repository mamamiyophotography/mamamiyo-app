import { after, NextRequest, NextResponse } from 'next/server';
import { deliverOutbox } from '@/lib/analytics/server';
import { db } from '@/lib/db/client';
import { confirmDeposit, notifyDepositConfirmation } from '@/lib/db/bookingService';
import { completeDepositConfirmation } from '@/lib/confirmDeposit';
import {finishNotification,reserveNotification} from '@/lib/notificationCooldown';
import { syncBookingToGoogleCalendar } from '@/lib/googleCalendar';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let reservation:any=null;
  try {
    reservation=await reserveNotification(db,id,'deposit_confirmation');
    const result = await completeDepositConfirmation({
      confirm: () => confirmDeposit(db, id),
      syncCalendar: booking => syncBookingToGoogleCalendar(db, booking),
      notify: booking => notifyDepositConfirmation(db, booking),
    });
    await finishNotification(db, reservation.id,
      result.notification.sent ? 'sent' : 'failed',
      result.notification.sent ? 'Deposit confirmation sent' : result.notification.message || 'Notification delivery failed');
    after(async () => { try { await deliverOutbox(db); } catch { console.error('Analytics delivery unavailable'); } });
    return NextResponse.json(result);
  } catch (err) {
    if(reservation)await finishNotification(db,reservation.id,'failed',(err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
