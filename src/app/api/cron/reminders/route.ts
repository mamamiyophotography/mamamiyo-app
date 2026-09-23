import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { checkAndSendGalleryReminders, checkAndSendReminders } from '@/lib/db/bookingService';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const sent = await checkAndSendReminders(db);
    const galleryReminders = await checkAndSendGalleryReminders(db);
    return NextResponse.json({ ok: true, remindersSent: sent, galleryReminders });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
