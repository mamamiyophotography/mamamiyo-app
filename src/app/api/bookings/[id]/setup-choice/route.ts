import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { updateClientSetupChoicesAndNotify } from '@/lib/db/bookingService';
import { withoutPrivateAnalytics } from '@/lib/analytics/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    if (!body.email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    const booking = await updateClientSetupChoicesAndNotify(db, id, body.email, body.setupSelections, body.inspirationReferencePhotoUrls);
    return NextResponse.json(withoutPrivateAnalytics({ booking, emailSent: true }));
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json({ error: message === 'EMAIL_MISMATCH' ? "That email address doesn't match this booking." : message }, { status: message === 'EMAIL_MISMATCH' ? 403 : 400 });
  }
}
