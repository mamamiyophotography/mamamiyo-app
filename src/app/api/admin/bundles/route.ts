import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { Bundle } from '@/lib/db/types';

export async function GET() {
  const bundles = await db.bundle.findMany();
  const withCounts = await Promise.all(
    bundles.map(async (bd: Bundle) => {
      const redeemed = await db.booking.count({ where: { bundleParentId: bd.id, status: { not: 'cancelled' } } });
      return { ...bd, redeemedCount: redeemed };
    })
  );
  return NextResponse.json({ bundles: withCounts });
}
