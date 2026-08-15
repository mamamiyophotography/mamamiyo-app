import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // Slots are automatically freed when the booking is deleted — the
    // availability system re-checks for clashing bookings on every request,
    // so no explicit slot-release step is needed. Just deleting the row is enough.
    // If the booking belonged to a bundle and was the only session, also clean
    // up the bundle row so it doesn't leave orphaned bundle records.
    const booking = await db.booking.findUniqueOrThrow({ where: { id } });
    await db.booking.delete({ where: { id } });

    if (booking.bundleParentId) {
      const remainingSessions = await db.booking.count({
        where: { bundleParentId: booking.bundleParentId },
      });
      if (remainingSessions === 0) {
        await db.bundle.delete({ where: { id: booking.bundleParentId } });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
