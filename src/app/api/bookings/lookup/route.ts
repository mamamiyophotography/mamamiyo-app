import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { lookupByEmail } from '@/lib/db/bookingService';

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'email query param is required' }, { status: 400 });
  }
  const results = await lookupByEmail(db, email);
  return NextResponse.json(results);
}
