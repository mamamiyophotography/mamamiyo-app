import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { buildEmailHtml, sendEmail } from '@/lib/email';
import { sendWhatsAppImage } from '@/lib/whatsapp';
import { hasBookedPhysicalProduct } from '@/lib/constants';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { kind } = await req.json();
    if (!['basic','further'].includes(kind)) throw new Error('Invalid notification type.');
    const booking = await db.booking.findUniqueOrThrow({ where: { id } });
    const gallery = await db.galleryInbox.findFirst({ where: { bookingId:id, clientUrl:{not:null} }, orderBy:{version:'desc'} });
    if (!gallery?.clientUrl) throw new Error('Create and connect the client Gallery first.');
    if (!booking.clientEmail || !booking.clientPhone) throw new Error('Client email and phone are required.');
    const firstName = booking.clientName.trim().split(/\s+/)[0] || booking.clientName;
    const isBasic = kind === 'basic';
    const subject = isBasic ? `Your Basic Retouch Gallery is ready — ${booking.sessionLabel}` : `Your Further Retouch photos are ready — ${booking.sessionLabel}`;
    const body = isBasic
      ? `Hi ${firstName}!\n\nYour Basic Retouch Gallery is ready. Please open your private Gallery to view the photos and submit your selection for Further Retouch.\n\n${gallery.clientUrl}\n\nMamamiyo Photography`
      : `Hi ${firstName}!\n\nYour Further Retouch photos are ready. Please open your private Gallery to view and download your completed photos.\n\n${gallery.clientUrl}\n\nMamamiyo Photography`;
    const whatsappBody = isBasic
      ? `Hi ${firstName}! Your photos with Basic Retouch are ready 😊\n\nView, select and download them here:\n${gallery.clientUrl}\n\nMamamiyo Photography`
      : `Hi ${firstName}! Your photos with Further Retouch are ready 😊\n\nView and download them here:\n${gallery.clientUrl}\n\nMamamiyo Photography`;
    await sendEmail(booking.clientEmail, subject, body, undefined, buildEmailHtml({title:subject,paragraphs:body.split('\n\n'),businessName:'Mamamiyo Photography'}));
    if (!process.env.WHAPI_TOKEN) throw new Error('Email sent, but WHAPI_TOKEN is missing, so WhatsApp was not sent.');
    const mascotUrl = `${req.nextUrl.origin}/mascots/${isBasic ? 'basic-retouch-ready.png' : 'further-retouch-ready.png'}`;
    await sendWhatsAppImage(booking.clientPhone, mascotUrl, whatsappBody);

    let nextStatus = booking.status;
    if (isBasic) nextStatus = 'basic_retouch';
    else {
      const additionalProductCount = await db.additionalOrder.count({where:{bookingId:id,status:{in:['pending','paid']}}});
      nextStatus = hasBookedPhysicalProduct(booking.addOns) || additionalProductCount > 0 ? 'order_product' : 'completed';
    }
    await db.$transaction([
      db.booking.update({where:{id},data:{status:nextStatus,version:{increment:1}}}),
      db.bookingAuditLog.create({data:{bookingId:id,action:`${kind}_retouch_progress`,before:{},after:{step:'notification',completed:true}}}),
    ]);
    return NextResponse.json({ok:true,status:nextStatus});
  } catch (error) {
    return NextResponse.json({error:(error as Error).message},{status:400});
  }
}
