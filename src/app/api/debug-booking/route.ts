import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, string> = {};
  try {
    // Test 1: Can we import the booking route's exact imports?
    results.step1 = 'importing createBooking...';
    const { createBooking } = await import('@/lib/db/bookingService');
    results.step1 = 'ok';

    // Test 2: Can we import the upload route?
    results.step2 = 'importing storage...';
    const storage = await import('@/lib/storage');
    results.step2 = typeof storage.uploadReferencePhoto === 'function' ? 'ok' : 'missing uploadReferencePhoto';

    // Test 3: What does the actual booking POST route import?
    results.step3 = 'checking bookings route imports...';
    const { buildPayNowPayload } = await import('@/lib/paynow');
    results.step3 = 'ok';

    // Test 4: Check if NEXT_PUBLIC_SUPABASE_URL is set (needed by storage.ts)
    results.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'MISSING';
    results.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING';
    results.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'set' : 'MISSING';

    // Test 5: Try instantiating Supabase client
    results.step5 = 'testing supabase client...';
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      results.step5 = `MISSING: url=${!!url} key=${!!key}`;
    } else {
      createClient(url, key);
      results.step5 = 'ok';
    }

  } catch (err) {
    results.error = (err as Error).message;
    results.stack = (err as Error).stack?.slice(0, 1000) || '';
  }
  return NextResponse.json(results);
}
