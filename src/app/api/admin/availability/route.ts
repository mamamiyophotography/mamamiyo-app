import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET() {
  const blocks = await db.availabilityBlock.findMany();
  return NextResponse.json({ blocks });
}

export async function POST(req: NextRequest) {
  let body: { date?: string; startTime?: string; endTime?: string; location?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.date || !body.startTime || !body.endTime || !body.location) {
    return NextResponse.json({ error: 'date, startTime, endTime, and location are required' }, { status: 400 });
  }
  const block = await db.availabilityBlock.create({
    data: { date: body.date, startTime: body.startTime, endTime: body.endTime, location: body.location },
  });
  return NextResponse.json({ block }, { status: 201 });
}
