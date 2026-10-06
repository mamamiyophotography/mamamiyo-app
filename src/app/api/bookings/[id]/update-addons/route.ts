import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { updateClientAddOnsAndNotify } from '@/lib/db/bookingService';
import { withoutPrivateAnalytics } from '@/lib/analytics/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { email?: string; addOns?: Record<string, number> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!body.email || !body.addOns || typeof body.addOns !== 'object') {
    return NextResponse.json({ error: 'Email and add-ons are required.' }, { status: 400 });
  }
  try {
    const booking = await updateClientAddOnsAndNotify(db, id, body.email, body.addOns);
    return NextResponse.json(withoutPrivateAnalytics({ booking, emailSent: true }));
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json(
      { error: message === 'EMAIL_MISMATCH' ? "That email address doesn't match this booking." : message },
      { status: message === 'EMAIL_MISMATCH' ? 403 : 400 },
    );
  }
}
