import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { addExtraLineItem } from '@/lib/db/bookingService';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { description?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.description || typeof body.amount !== 'number') {
    return NextResponse.json({ error: 'description and amount are required' }, { status: 400 });
  }
  try {
    const booking = await addExtraLineItem(db, id, body.description, body.amount);
    return NextResponse.json({ booking });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
