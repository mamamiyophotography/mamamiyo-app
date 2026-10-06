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
        { status: { in: ['pending', 'confirmed', 'pending_balance', 'pending_basic_retouch', 'basic_retouch', 'further_retouch', 'order_product', 'soft_copy_delivered'] } },
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
  const [inbox,orders,progressLogs,downloadLogs] = await Promise.all([
    db.galleryInbox.findMany({
      where:{bookingId:{in:bookingIds}},
      select:{galleryId:true,bookingId:true,clientUrl:true,version:true,submitted:true,locked:true,deliveredAt:true,emailSentAt:true},
    }),
    // Cancelled/reset orders must disappear from the Booking App immediately.
    // Keep paid orders as history and pending orders as actionable items.
    db.additionalOrder.findMany({where:{bookingId:{in:bookingIds},status:{in:['pending','paid']}},orderBy:{createdAt:'desc'}}),
    db.bookingAuditLog.findMany({where:{bookingId:{in:bookingIds},action:{in:['basic_retouch_progress','further_retouch_progress']}},orderBy:{createdAt:'asc'},select:{bookingId:true,action:true,after:true}}),
    db.bookingAuditLog.findMany({where:{bookingId:{in:bookingIds},action:'gallery_download'},orderBy:{createdAt:'asc'},select:{bookingId:true,after:true,createdAt:true}}),
  ]);
  const basicProgressByBooking = new Map<string,Record<string,boolean>>();
  const furtherProgressByBooking = new Map<string,Record<string,boolean>>();
  for (const log of progressLogs as any[]) {
    const value = log.after as {step?:string;completed?:boolean};
    if (!value?.step || typeof value.completed !== 'boolean') continue;
    const target = log.action === 'further_retouch_progress' ? furtherProgressByBooking : basicProgressByBooking;
    target.set(log.bookingId,{...(target.get(log.bookingId)||{}),[value.step]:value.completed});
  }
  const downloadsByBooking = new Map<string,{downloadType:string;downloadedAt:string;galleryId:string}[]>();
  for (const log of downloadLogs as any[]) {
    const value = log.after as {downloadType?:string;downloadedAt?:string;galleryId?:string};
    if (!value.downloadType || !value.galleryId) continue;
    downloadsByBooking.set(log.bookingId,[...(downloadsByBooking.get(log.bookingId)||[]),{downloadType:value.downloadType,downloadedAt:value.downloadedAt||log.createdAt.toISOString(),galleryId:value.galleryId}]);
  }
  const slim = (bookings as any[]).map((b) => ({ ...b, referencePhotoUrls: [], gallerySelections: inbox.filter(g=>g.bookingId===b.id), additionalOrders:orders.filter(o=>o.bookingId===b.id), basicRetouchProgress:basicProgressByBooking.get(b.id)||{}, furtherRetouchProgress:furtherProgressByBooking.get(b.id)||{}, downloadFeedback:downloadsByBooking.get(b.id)||[] }));
  return NextResponse.json({ bookings: slim });
}
