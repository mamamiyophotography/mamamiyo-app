import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { lookupByPhone } from '@/lib/db/bookingService';

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone');
  if (!phone) {
    return NextResponse.json({ error: 'phone query param is required' }, { status: 400 });
  }
  const results = await lookupByPhone(db, phone);
  return NextResponse.json(results);
}
