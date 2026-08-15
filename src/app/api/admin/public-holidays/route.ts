import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { PublicHoliday } from '@/lib/db/types';

export async function GET() {
  const holidays = await db.publicHoliday.findMany();
  return NextResponse.json({ holidays: holidays.sort((a: PublicHoliday, b: PublicHoliday) => a.date.localeCompare(b.date)) });
}

export async function POST(req: NextRequest) {
  let body: { date?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 });
  }
  const holiday = await db.publicHoliday.create({ data: { date: body.date, label: body.label || 'Public holiday' } });
  return NextResponse.json({ holiday }, { status: 201 });
}
