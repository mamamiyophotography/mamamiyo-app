import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/db/bookingService';
import { db } from '@/lib/db/client';
import { buildPayNowPayload } from '@/lib/paynow';

export async function GET() {
  const results: Record<string, string> = {};
  try {
    results.db = 'ok';
    const settings = await getSettings(db);
    results.settings = JSON.stringify({ businessName: settings.businessName, paynowMobile: settings.paynowMobile });
    const mobile = (settings.paynowMobile || '').replace(/\D/g, '').slice(-8);
    results.mobile = mobile;
    results.mobileLength = String(mobile.length);
    if (mobile.length === 8) {
      const payload = buildPayNowPayload({ mobile8: mobile, amount: 100, refNumber: 'TEST', merchantName: settings.businessName });
      results.paynow = 'ok length=' + payload.length;
    } else {
      results.paynow = 'skipped — mobile not 8 digits';
    }
  } catch (err) {
    results.error = (err as Error).message;
    results.stack = (err as Error).stack?.slice(0, 500) || '';
  }
  return NextResponse.json(results);
}
