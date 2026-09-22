import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { db } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status');
  const statuses = req.nextUrl.searchParams.get('statuses'); // comma-separated
  const active = req.nextUrl.searchParams.get('active');

  let where: unknown;
  if (active === '1') {
    where = {
      OR: [
        { status: { in: ['pending', 'confirmed', 'pending_balance', 'basic_retouch', 'further_retouch'] } },
        { status: 'completed', balanceStatus: 'pending' },
      ],
    };
  } else if (statuses) {
    where = { status: { in: statuses.split(',') } };
  } else if (status) {
    where = { status };
  }

  const bookings = await db.booking.findMany({
    where,
    orderBy: { date: 'asc' }, // always sorted by photoshoot date
  });

  const inbox = await new PrismaClient().galleryInbox.findMany({where:{bookingId:{in:(bookings as any[]).map(b=>b.id)}}});
  const slim = (bookings as any[]).map((b) => ({ ...b, referencePhotoUrls: [], gallerySelections: inbox.filter(g=>g.bookingId===b.id) }));
  return NextResponse.json({ bookings: slim });
}
