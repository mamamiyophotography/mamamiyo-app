import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { redeemBundleSessionAndNotify } from '@/lib/db/bookingService';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: {
    slot: { date: string; startTime: string; endTime: string; isWeekend: boolean };
    addOns?: Record<string, number>;
    referencePhotoUrls?: string[];
    notes?: string;
    babyGender?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.referencePhotoUrls?.length) {
    return NextResponse.json({ error: 'At least one reference photo is required.' }, { status: 400 });
  }
  try {
    const booking = await redeemBundleSessionAndNotify(
      db, id, body.slot, body.addOns || {},
      body.referencePhotoUrls || [], body.notes || '', body.babyGender || ''
    );
    return NextResponse.json({ booking }, { status: 201 });
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'BUNDLE_NOT_ACTIVATED') {
      return NextResponse.json({ error: 'This bundle is not activated yet.' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
