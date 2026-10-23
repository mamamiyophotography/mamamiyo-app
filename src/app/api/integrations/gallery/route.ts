import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { Resend } from 'resend';
import { buildPayNowPayload } from '@/lib/paynow';
import QRCode from 'qrcode';
import { brandedFromAddress, buildEmailHtml } from '@/lib/email';
import { socialMediaUploadReminder } from '@/lib/notifications';
import { sendWhatsApp } from '@/lib/whatsapp';
import { notifyGallerySelection } from '@/lib/gallerySelectionNotification';

const prisma = new PrismaClient();
function authorized(req: NextRequest) {
  const secret = process.env.GALLERY_SYNC_SECRET;
  const supplied = req.headers.get('authorization') || '';
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({error:'Unauthorized'}, {status:401});
  const ref = req.nextUrl.searchParams.get('ref') || '';
  const b = await prisma.booking.findUnique({where:{ref}, select:{ref:true, clientName:true, date:true, status:true, sessionTypeId:true, bundleSessionNumber:true, addOns:true}});
  if (!b) return NextResponse.json({error:'Booking reference not found'}, {status:404});
  const quantities = (b.addOns && typeof b.addOns === 'object' && !Array.isArray(b.addOns)) ? b.addOns as Record<string, unknown> : {};
  const qty = (id:string) => Math.max(0, Number(quantities[id]) || 0);
  const bookedProductBonus = 20 * (qty('album8x8') + qty('album10x10') + qty('album12x12'))
    + 5 * (qty('canvas11x14') + qty('canvas16x24'))
    + 2 * (qty('plaque5x7') + qty('plaque6x8'));
  const bundleSession = b.sessionTypeId === 'bundle' ? (b.bundleSessionNumber || 1) : null;
  const packageComplimentary = bundleSession === null ? 10 : bundleSession < 3 ? 0 : 30;
  const selectionEnabled = bundleSession === null || bundleSession >= 3;
  return NextResponse.json({...b, packageComplimentary, selectionEnabled, setupBonus:5 * qty('extraSetup'), bookedProductBonus});
}
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({error:'Unauthorized'}, {status:401});
  const raw = await req.text();
  if (raw.length > 150000) return NextResponse.json({error:'Too large'}, {status:413});
  let p: any;
  try { p = JSON.parse(raw); } catch { return NextResponse.json({error:'Invalid JSON'}, {status:400}); }
  if (p.kind === 'download') {
    const downloadTypes = ['basic', 'further', 'all'] as const;
    if (!/^[a-f0-9]{32}$/.test(p.galleryId || '') || typeof p.bookingRef !== 'string' || p.bookingRef.length > 100 ||
        !downloadTypes.includes(p.downloadType) || typeof p.downloadedAt !== 'string' || !Number.isFinite(Date.parse(p.downloadedAt))) {
      return NextResponse.json({error:'Invalid download event'}, {status:400});
    }
    const booking = await prisma.booking.findUnique({where:{ref:p.bookingRef}});
    if (!booking || booking.status === 'cancelled') return NextResponse.json({error:'Booking not available'}, {status:409});
    const gallery = await prisma.galleryInbox.findUnique({where:{galleryId:p.galleryId}});
    if (!gallery || gallery.bookingId !== booking.id) return NextResponse.json({error:'Gallery is not linked to this booking'}, {status:409});
    const previous = await prisma.bookingAuditLog.findMany({
      where:{bookingId:booking.id,action:'gallery_download'},
      select:{after:true},
    });
    const firstForType = !previous.some(log => {
      const value = log.after as {galleryId?:string;downloadType?:string};
      return value.galleryId === p.galleryId && value.downloadType === p.downloadType;
    });
    const downloadedAt = new Date(p.downloadedAt);
    await prisma.bookingAuditLog.create({data:{
      bookingId:booking.id,
      action:'gallery_download',
      before:{},
      after:{galleryId:p.galleryId,downloadType:p.downloadType,downloadedAt:downloadedAt.toISOString()},
    }});
    if (firstForType && process.env.PHOTOGRAPHER_PHONE) {
      const label = p.downloadType === 'basic' ? 'Basic Retouch photos' : p.downloadType === 'further' ? 'Further Retouch photos' : 'all Gallery photos';
      await sendWhatsApp(process.env.PHOTOGRAPHER_PHONE, `${booking.clientName} downloaded ${label}.\n${booking.sessionLabel} · ${booking.ref}`);
    }
    return NextResponse.json({ok:true,firstForType});
  }
  if (p.kind === 'client_link') {
    if (!/^[a-f0-9]{32}$/.test(p.galleryId || '') || typeof p.bookingRef !== 'string' || p.bookingRef.length > 100 || typeof p.clientUrl !== 'string' || p.clientUrl.length > 2000) {
      return NextResponse.json({error:'Invalid client Gallery link'}, {status:400});
    }
    const publicBase = (process.env.GALLERY_PUBLIC_URL || 'https://mamamiyo-gallery.mamamiyo-gallery.workers.dev').replace(/\/$/, '');
    let parsed: URL;
    try { parsed = new URL(p.clientUrl); } catch { return NextResponse.json({error:'Invalid client Gallery link'}, {status:400}); }
    if (`${parsed.origin}${parsed.pathname}` !== `${publicBase}/g/${p.galleryId}` || !/^#token=[A-Za-z0-9_-]{43}$/.test(parsed.hash)) {
      return NextResponse.json({error:'Client Gallery link does not match this Gallery'}, {status:400});
    }
    const booking = await prisma.booking.findUnique({where:{ref:p.bookingRef}});
    if (!booking || booking.status === 'cancelled') return NextResponse.json({error:'Booking not available'}, {status:409});
    const existing = await prisma.galleryInbox.findUnique({where:{galleryId:p.galleryId}});
    if (existing && existing.bookingId !== booking.id) return NextResponse.json({error:'Gallery already linked to another booking'}, {status:409});
    await prisma.galleryInbox.upsert({where:{galleryId:p.galleryId},
      create:{galleryId:p.galleryId,bookingId:booking.id,clientUrl:p.clientUrl,version:0,items:[],submitted:false,locked:false},
      update:{bookingId:booking.id,clientUrl:p.clientUrl}});
    // Linking the Gallery completes upload, but the booking only moves to
    // Awaiting Client Selection after the photographer sends the client notice.
    return NextResponse.json({ok:true});
  }
  if (p.kind === 'additional_order_reset') {
    if (!/^[a-f0-9]{32}$/.test(p.galleryId || '') || typeof p.bookingRef !== 'string') {
      return NextResponse.json({error:'Invalid order reset'}, {status:400});
    }
    const booking = await prisma.booking.findUnique({where:{ref:p.bookingRef}});
    if (!booking || booking.status === 'cancelled') return NextResponse.json({error:'Booking not available'}, {status:409});
    const paid = await prisma.additionalOrder.findFirst({where:{galleryId:p.galleryId,status:'paid'}});
    if (paid) return NextResponse.json({error:'This order is already paid. Please contact Mamamiyo.'}, {status:409});
    await prisma.additionalOrder.updateMany({where:{galleryId:p.galleryId,status:'pending'},data:{status:'cancelled'}});
    return NextResponse.json({ok:true});
  }  if (p.kind === 'additional_order') {
    const catalog: Record<string, {name:string;price:number;bonus:number}> = {
      album8x8:{name:'Layflat Photo Album · 8in × 8in · 20 pages · +20 Bonus Further Retouch',price:108,bonus:20},
      album10x10:{name:'Layflat Photo Album · 10in × 10in · 20 pages · +20 Bonus Further Retouch',price:138,bonus:20},
      album12x12:{name:'Layflat Photo Album · 12in × 12in · 20 pages · +20 Bonus Further Retouch',price:158,bonus:20},
      canvas11x14:{name:'Canvas · 11in × 14in · +5 Bonus Further Retouch',price:88,bonus:5},
      canvas16x24:{name:'Canvas · 16in × 24in · +5 Bonus Further Retouch',price:128,bonus:5},
      plaque5x7:{name:'Wooden / Crystal Plaque · 5in × 7in · +2 Bonus Further Retouch',price:58,bonus:2},
      plaque6x8:{name:'Wooden / Crystal Plaque · 6in × 8in · +2 Bonus Further Retouch',price:68,bonus:2},
      extraRetouch:{name:'Additional Further Retouch',price:5,bonus:0},
    };
    if (!/^[a-f0-9]{32}$/.test(p.galleryId || '') || typeof p.bookingRef !== 'string' ||
        !Number.isSafeInteger(p.version) || p.version < 1 || !Array.isArray(p.items) || !p.items.length || p.items.length > 20) {
      return NextResponse.json({error:'Invalid order'}, {status:400});
    }
    const booking = await prisma.booking.findUnique({where:{ref:p.bookingRef}});
    if (!booking || booking.status === 'cancelled') return NextResponse.json({error:'Booking not available'}, {status:409});
    const items = p.items.map((item:any) => {
      const product = catalog[item?.id]; const quantity = Number(item?.quantity);
      if (!product || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('Invalid product quantity');
      return {id:item.id,name:product.name,quantity,unitPrice:product.price,amount:product.price*quantity,bonusRetouches:product.bonus*quantity};
    });
    const total = items.reduce((sum:number,item:any)=>sum+item.amount,0);
    const bonusRetouches = items.reduce((sum:number,item:any)=>sum+item.bonusRetouches,0);
    const invoiceRef = `ADD-${p.galleryId.slice(0,6).toUpperCase()}-${p.version}`;
    await prisma.additionalOrder.updateMany({where:{galleryId:p.galleryId,status:'pending',version:{lt:p.version}},data:{status:'superseded'}});
    const order = await prisma.additionalOrder.upsert({
      where:{galleryId_version:{galleryId:p.galleryId,version:p.version}},
      create:{bookingId:booking.id,galleryId:p.galleryId,version:p.version,items,total,bonusRetouches,invoiceRef},
      update:{items,total,bonusRetouches},
    });
    const settings = await prisma.settings.findUnique({where:{id:1}});
    const mobile = (settings?.paynowMobile || '').replace(/\D/g,'').slice(-8);
    if (mobile.length !== 8) return NextResponse.json({error:'PayNow is not configured; order saved',order}, {status:503});
    const payNowPayload = buildPayNowPayload({mobile8:mobile,amount:total,refNumber:invoiceRef,merchantName:settings?.businessName || 'Mamamiyo Photography'});
    const qrDataUrl = await QRCode.toDataURL(payNowPayload,{margin:1,width:420});
    return NextResponse.json({ok:true,order:{id:order.id,status:order.status,items,total,bonusRetouches,invoiceRef},payNowPayload,qrDataUrl});
  }
  if (!/^[a-f0-9]{32}$/.test(p.galleryId || '') || typeof p.bookingRef !== 'string' || p.bookingRef.length > 100 ||
      !Number.isSafeInteger(p.version) || p.version < 0 || typeof p.submitted !== 'boolean' || typeof p.locked !== 'boolean' ||
      typeof p.selectionEnabled !== 'boolean' || (p.expiresAt !== null && (typeof p.expiresAt !== 'string' || !Number.isFinite(Date.parse(p.expiresAt)))) ||
      !Array.isArray(p.items) || p.items.length > 60 || p.items.some((i:any) => typeof i.filename !== 'string' || i.filename.length > 255 || typeof i.note !== 'string' || i.note.length > 1000) ||
      (p.deliveredAt !== null && (typeof p.deliveredAt !== 'string' || !Number.isFinite(Date.parse(p.deliveredAt))))) {
    return NextResponse.json({error:'Invalid payload'}, {status:400});
  }
  const booking = await prisma.booking.findUnique({where:{ref:p.bookingRef}});
  if (!booking || booking.status === 'cancelled') return NextResponse.json({error:'Booking not available'}, {status:409});
  // Durable inbox: status is saved before email is attempted. Retry never loses it.
  const entry = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${p.galleryId}))`;
    const previous = await tx.galleryInbox.findUnique({where:{galleryId:p.galleryId}});
    if (previous && previous.bookingId !== booking.id) throw new Error('Gallery already linked to another booking');
    if (previous && (previous.version > p.version || (previous.deliveredAt && (!p.deliveredAt || previous.deliveredAt > new Date(p.deliveredAt))))) return previous;
    const deliveredAt = p.deliveredAt ? new Date(p.deliveredAt) : null;
    const result = await tx.galleryInbox.upsert({where:{galleryId:p.galleryId},
      create:{galleryId:p.galleryId, bookingId:booking.id, version:p.version, items:p.items, submitted:p.submitted, locked:p.locked, deliveredAt,expiresAt:p.expiresAt ? new Date(p.expiresAt) : null,selectionEnabled:p.selectionEnabled},
      update:{version:p.version, items:p.items, submitted:p.submitted, locked:p.locked, deliveredAt,expiresAt:p.expiresAt ? new Date(p.expiresAt) : null,selectionEnabled:p.selectionEnabled}});
    // Bundle sessions 1 and 2 are view/download-only. Their Gallery must
    // never push the booking into the client-selection workflow, even if an
    // older Gallery client sends stale submitted/locked flags.
    const clientSelectionApplies = p.selectionEnabled
      && !(booking.sessionTypeId === 'bundle' && (booking.bundleSessionNumber || 1) < 3);
    // Submission creates an actionable Step 6 immediately. Locking the
    // reviewed selection advances it to Step 7 Further Retouch.
    if (clientSelectionApplies && p.submitted && booking.status === 'basic_retouch') {
      await tx.booking.update({where:{id:booking.id},data:{status:p.locked ? 'further_retouch' : 'selection_received'}});
    } else if (clientSelectionApplies && p.submitted && p.locked && booking.status === 'selection_received') {
      await tx.booking.update({where:{id:booking.id},data:{status:'further_retouch'}});
    } else if (clientSelectionApplies && p.submitted && !p.locked && booking.status === 'further_retouch') {
      await tx.booking.update({where:{id:booking.id},data:{status:'selection_received'}});
    }
    return result;
  });
  let bundleRetention: {galleryIds:string[]; expiresAt:string} | null = null;
  if (p.deliveredAt && booking.bundleParentId && booking.bundleSessionNumber === 3) {
    const bundleBookings = await prisma.booking.findMany({where:{bundleParentId:booking.bundleParentId},select:{id:true}});
    const bundleGalleries = await prisma.galleryInbox.findMany({
      where:{bookingId:{in:bundleBookings.map(item=>item.id)}},
      select:{galleryId:true},
    });
    const expiresAt = new Date(Date.parse(p.deliveredAt) + 90 * 24 * 60 * 60 * 1000).toISOString();
    bundleRetention = {galleryIds:bundleGalleries.map(item=>item.galleryId),expiresAt};
  }
  if (!entry.submitted) return NextResponse.json({ok:true,bundleRetention});
  const adminUrl = `${req.nextUrl.origin}/admin/bookings`;
  if (!entry.deliveredAt) {
    try {
      const notification = await notifyGallerySelection(prisma, booking, entry, adminUrl);
      return NextResponse.json({ok:true,bundleRetention,notification});
    } catch (error) {
      return NextResponse.json({error:(error as Error).message,selectionSaved:true}, {status:503});
    }
  }
  // A lock-only change does not create another selection email.
  const fingerprint = JSON.stringify({items:entry.items, deliveredAt:entry.deliveredAt});
  const {createHash} = await import('node:crypto');
  const eventKey = createHash('sha256').update(fingerprint).digest('hex');
  if (entry.emailKey === eventKey) return NextResponse.json({ok:true,bundleRetention});
  if (!booking.clientEmail || !entry.clientUrl || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return NextResponse.json({error:'Client email or Gallery link is missing; delivery is saved'}, {status:503});
  }
  const firstName = booking.clientName.trim().split(/\s+/)[0] || booking.clientName;
  const subject = `Your Further Retouch Gallery is ready — ${booking.sessionLabel}`;
  const body = `Hi ${firstName},\n\nYour Further Retouch photos are ready. We have completed the requested edits, and your finished photos are now available in your private Gallery.\n\nView and download your photos:\n${entry.clientUrl}\n\nWe hope you love the finished photos. If you have any questions, please contact us via WhatsApp.\n\nWarmly,\nMamamiyo Photography`;
  const html = buildEmailHtml({
    title:'Your Further Retouch Gallery is ready',
    paragraphs:[
      `Hi ${escape(firstName)},`,
      'Your Further Retouch photos are ready. We have completed the requested edits, and your finished photos are now available in your private Gallery.',
      `<a href="${escape(entry.clientUrl)}" style="display:inline-block;background:#b08d57;color:#fff;text-decoration:none;font-weight:700;font-family:sans-serif;padding:12px 22px;border-radius:10px;">View and download your photos</a>`,
      'We hope you love the finished photos. If you have any questions, please contact us via WhatsApp.',
      'Warmly,<br>Mamamiyo Photography',
    ],
    businessName:'Mamamiyo Photography',
  });
  const photographerEmail = process.env.PHOTOGRAPHER_EMAIL?.trim();
  const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from:brandedFromAddress(process.env.RESEND_FROM_EMAIL),
    to:booking.clientEmail,
    bcc:photographerEmail && photographerEmail.toLowerCase() !== booking.clientEmail.toLowerCase() ? photographerEmail : undefined,
    subject,
    text:body,
    html,
  }, {idempotencyKey:`gallery-client-delivery-${entry.galleryId}-${eventKey}`});
  if (result.error) return NextResponse.json({error:'Client email pending retry; delivery is saved'}, {status:503});
  if (entry.deliveredAt && process.env.PHOTOGRAPHER_PHONE) {
    await sendWhatsApp(process.env.PHOTOGRAPHER_PHONE, socialMediaUploadReminder(booking));
  }
  await prisma.$transaction([
    prisma.galleryInbox.updateMany({where:{galleryId:entry.galleryId,version:entry.version},data:{emailKey:eventKey,emailSentAt:new Date()}}),
    prisma.notificationLog.create({data:{bookingId:booking.id,channel:'retouch_further_email',message:'Further Retouch Gallery ready email sent automatically after upload',status:'sent'}}),
    prisma.bookingAuditLog.create({data:{bookingId:booking.id,action:'further_retouch_progress',before:{},after:{step:'notification_email',completed:true}}}),
  ]);
  return NextResponse.json({ok:true,bundleRetention});
}
