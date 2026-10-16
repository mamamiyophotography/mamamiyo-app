import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { notifyGallerySelection } from '@/lib/gallerySelectionNotification';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const booking = await db.booking.findUnique({ where: { id } });
    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    const entry = await db.galleryInbox.findFirst({
      where: { bookingId:id, submitted:true, deliveredAt:null },
      orderBy: { updatedAt:'desc' },
    });
    if (!entry) return NextResponse.json({ error: 'No submitted client selection was found.' }, { status: 404 });
    const adminUrl = `${req.nextUrl.origin}/admin/bookings`;
    const notification = await notifyGallerySelection(db, booking, entry, adminUrl);
    return NextResponse.json({ ok:true, notification });
  } catch (error) {
    return NextResponse.json({ error:(error as Error).message }, { status:400 });
  }
}
