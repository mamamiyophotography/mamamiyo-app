import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSettings } from '@/lib/db/bookingService';

export async function GET() {
  const settings = await getSettings(db);
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  await getSettings(db); // ensure a row exists first
  const settings = await db.settings.update({ where: { id: 1 }, data: body });
  return NextResponse.json({ settings });
}
