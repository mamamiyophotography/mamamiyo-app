import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/db/bookingService';
import { db } from '@/lib/db/client';
import { buildPayNowPayload } from '@/lib/paynow';
import { sendEmail } from '@/lib/email';

export async function GET() {
  const results: Record<string, string> = {};
  try {
    results.db = 'ok';
    const settings = await getSettings(db);
    results.paynowMobile = settings.paynowMobile;

    // Test PayNow
    const mobile = (settings.paynowMobile || '').replace(/\D/g, '').slice(-8);
    const payload = buildPayNowPayload({ mobile8: mobile, amount: 100, refNumber: 'TEST', merchantName: settings.businessName });
    results.paynow = 'ok length=' + payload.length;

    // Test email imports
    results.sendEmail = typeof sendEmail === 'function' ? 'ok' : 'missing';

    // Test notify import
    const { dispatchNotification } = await import('@/lib/notify');
    results.dispatchNotification = typeof dispatchNotification === 'function' ? 'ok' : 'missing';

    // Test new booking notification import
    const { newBookingRequestNotification } = await import('@/lib/notifications');
    results.newBookingRequestNotification = typeof newBookingRequestNotification === 'function' ? 'ok' : 'missing';

    // Test photographer env vars
    results.PHOTOGRAPHER_EMAIL = process.env.PHOTOGRAPHER_EMAIL ? 'set' : 'MISSING';
    results.PHOTOGRAPHER_PHONE = process.env.PHOTOGRAPHER_PHONE ? 'set' : 'MISSING';
    results.RESEND_API_KEY = process.env.RESEND_API_KEY ? 'set' : 'MISSING';

  } catch (err) {
    results.error = (err as Error).message;
    results.stack = (err as Error).stack?.slice(0, 800) || '';
  }
  return NextResponse.json(results);
}
