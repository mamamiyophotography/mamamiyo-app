import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status');
  const statuses = req.nextUrl.searchParams.get('statuses'); // comma-separated
  const active = req.nextUrl.searchParams.get('active');

  let where: unknown;
  if (active === '1') {
    where = {
      OR: [
        { status: { in: ['pending', 'confirmed', 'pending_balance', 'pending_basic_retouch', 'basic_retouch', 'further_retouch'] } },
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

  const bookingIds = (bookings as any[]).map(b=>b.id);
  const [inbox,orders] = await Promise.all([
    db.galleryInbox.findMany({
      where:{bookingId:{in:bookingIds}},
      select:{galleryId:true,bookingId:true,clientUrl:true,version:true,submitted:true,locked:true,deliveredAt:true,emailSentAt:true},
    }),
    db.additionalOrder.findMany({where:{bookingId:{in:bookingIds},status:{not:'superseded'}},orderBy:{createdAt:'desc'}}),
  ]);
  const slim = (bookings as any[]).map((b) => ({ ...b, referencePhotoUrls: [], gallerySelections: inbox.filter(g=>g.bookingId===b.id), additionalOrders:orders.filter(o=>o.bookingId===b.id) }));
  return NextResponse.json({ bookings: slim });
}
