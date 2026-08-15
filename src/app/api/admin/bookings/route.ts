import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status');
  const bookings = await db.booking.findMany({
    where: status ? { status } : undefined,
    orderBy: { date: 'asc' },
  });
  // Strip referencePhotoUrls from the list — they are large Supabase URLs that
  // can push the response over Vercel's 4.5MB serverless response limit when
  // multiple bookings are returned. Photos are shown in the expanded detail view
  // which fetches a single booking. Runtime type is any so we don't fight Prisma.
  const slim = (bookings as any[]).map((b) => ({ ...b, referencePhotoUrls: [] }));
  return NextResponse.json({ bookings: slim });
}
