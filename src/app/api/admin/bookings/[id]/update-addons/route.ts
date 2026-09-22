import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { ADDONS, sessionById } from '@/lib/constants';
import { recalculateForAddOns } from '@/lib/pricing';

type Body = { addOns?: Record<string, number>; version?: number };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  if (!Number.isInteger(body.version) || !body.addOns || typeof body.addOns !== 'object') {
    return NextResponse.json({ error: 'Current booking version and add-ons are required.' }, { status: 400 });
  }

  try {
    const prisma = db as any;
    const current = await prisma.booking.findUniqueOrThrow({ where: { id } });
    if (current.balanceStatus === 'paid') throw new Error('The balance is already confirmed. Add-ons can no longer be changed.');
    if (current.status === 'cancelled') throw new Error('Cancelled bookings cannot be changed.');
    if (current.version !== body.version) throw new Error('This booking changed in another window. Refresh and try again.');

    const session = sessionById(current.sessionTypeId);
    if (!session) throw new Error('Unknown session type.');
    const cleaned = Object.fromEntries(Object.entries(body.addOns)
      .filter(([key, qty]) => session.addOns.includes(key) && ADDONS[key] && Number.isInteger(qty) && qty > 0 && qty <= 20));
    const invalid = Object.entries(body.addOns).some(([key, qty]) =>
      !session.addOns.includes(key) || !ADDONS[key] || !Number.isInteger(qty) || qty < 0 || qty > 20);
    if (invalid) throw new Error('One or more add-on quantities are invalid.');

    const oldAddOns = (current.addOns || {}) as Record<string, number>;
    const recalculated = recalculateForAddOns(current, cleaned);
    const changed = JSON.stringify(oldAddOns) !== JSON.stringify(cleaned);
    if (!changed) return NextResponse.json({ booking: current, invoiceNeedsRegeneration: current.invoiceStale });

    const result = await prisma.$transaction(async (tx: any) => {
      const update = await tx.booking.updateMany({
        where: { id, version: body.version, balanceStatus: { not: 'paid' }, status: { not: 'cancelled' } },
        data: {
          addOns: cleaned,
          subtotal: recalculated.subtotal,
          total: recalculated.total,
          balanceDue: recalculated.balanceDue,
          invoiceStale: Boolean(current.invoiceRef),
          version: { increment: 1 },
        },
      });
      if (update.count !== 1) throw new Error('This booking changed in another window. Refresh and try again.');
      const updated = await tx.booking.findUniqueOrThrow({ where: { id } });
      await tx.bookingAuditLog.create({ data: {
        bookingId: id, action: 'ADD_ONS_UPDATED',
        before: { addOns: oldAddOns, subtotal: current.subtotal, total: current.total, balanceDue: current.balanceDue },
        after: { addOns: cleaned, subtotal: updated.subtotal, total: updated.total, balanceDue: updated.balanceDue },
      }});
      return updated;
    });
    return NextResponse.json({ booking: result, invoiceNeedsRegeneration: result.invoiceStale });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }
}
