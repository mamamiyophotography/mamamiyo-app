import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { addExtraLineItem } from '@/lib/db/bookingService';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { description?: string; amount?: number; replace?: { description: string; amount: number }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const current = await db.booking.findUniqueOrThrow({ where: { id } });
    if (current.balanceStatus === 'paid') throw new Error('The balance is already confirmed. Charges can no longer be changed.');
    if (current.status === 'cancelled') throw new Error('Cancelled bookings cannot be changed.');
    // Full replacement — used for edit and delete operations
    if (body.replace !== undefined) {
      const booking = await db.booking.update({
        where: { id },
        data: { extraLineItems: body.replace as never, invoiceStale: Boolean(current.invoiceRef), version: { increment: 1 } as never },
      });
      return NextResponse.json({ booking });
    }

    // Append a new line item
    if (!body.description || typeof body.amount !== 'number') {
      return NextResponse.json({ error: 'description and amount are required' }, { status: 400 });
    }
    const booking = await addExtraLineItem(db, id, body.description, body.amount);
    return NextResponse.json({ booking });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
