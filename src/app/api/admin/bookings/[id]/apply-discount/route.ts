import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({})) as { code?: string };
    const code = body.code?.trim().toUpperCase();
    if (!code) return NextResponse.json({ error: 'Enter a promotion code.' }, { status: 400 });

    const [booking, promotion] = await Promise.all([
      db.booking.findUniqueOrThrow({ where: { id } }),
      db.discountCode.findUnique({ where: { code } }),
    ]);
    if (!promotion) return NextResponse.json({ error: 'Promotion code not found.' }, { status: 404 });
    if (booking.status === 'cancelled') return NextResponse.json({ error: 'Cancelled bookings cannot be changed.' }, { status: 400 });
    if (booking.balanceStatus === 'paid') return NextResponse.json({ error: 'The balance is already paid. The final bill can no longer be discounted.' }, { status: 400 });

    const discountAmount = Math.min(promotion.amount, booking.subtotal);
    const total = Math.max(0, booking.subtotal - discountAmount);
    const balanceDue = Math.max(0, total - booking.depositAmount);
    const updated = await db.booking.update({
      where: { id },
      data: {
        discountCode: promotion.code,
        discountAmount,
        total,
        balanceDue,
        balanceStatus: balanceDue > 0 ? 'pending' : 'n/a',
        invoiceStale: Boolean(booking.invoiceRef),
        version: { increment: 1 },
      },
    });
    return NextResponse.json({ booking: updated });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
