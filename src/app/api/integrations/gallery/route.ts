import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { Resend } from 'resend';
import { buildPayNowPayload } from '@/lib/paynow';
import QRCode from 'qrcode';

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
  const b = await prisma.booking.findUnique({where:{ref}, select:{ref:true, clientName:true, date:true, status:true, sessionTypeId:true, bundleSessionNumber:true}});
  return b ? NextResponse.json(b) : NextResponse.json({error:'Booking reference not found'}, {status:404});
}
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({error:'Unauthorized'}, {status:401});
  const raw = await req.text();
  if (raw.length > 150000) return NextResponse.json({error:'Too large'}, {status:413});
  let p: any;
  try { p = JSON.parse(raw); } catch { return NextResponse.json({error:'Invalid JSON'}, {status:400}); }
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
    return NextResponse.json({ok:true});
  }
  if (p.kind === 'additional_order') {
    const catalog: Record<string, {name:string;price:number;bonus:number}> = {
      album8x8:{name:'Photo Album · 8in × 8in · 20 pages',price:108,bonus:20},
      album10x10:{name:'Photo Album · 10in × 10in · 20 pages',price:138,bonus:20},
      album12x12:{name:'Photo Album · 12in × 12in · 20 pages',price:158,bonus:20},
      canvas11x14:{name:'Canvas · 11in × 14in',price:88,bonus:1},
      canvas16x24:{name:'Canvas · 16in × 24in',price:128,bonus:1},
      plaque5x7:{name:'Wooden / Crystal Plaque · 5in × 7in',price:58,bonus:1},
      plaque6x8:{name:'Wooden / Crystal Plaque · 6in × 8in',price:68,bonus:1},
      extraRetouch:{name:'Additional Further Retouch',price:5,bonus:1},
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
    if (deliveredAt && ['basic_retouch','pending_balance','further_retouch'].includes(booking.status)) {
      await tx.booking.update({where:{id:booking.id},data:{status:'completed'}});
    } else if (p.locked && p.submitted && ['basic_retouch','pending_balance'].includes(booking.status)) {
      await tx.booking.update({where:{id:booking.id},data:{status:'further_retouch'}});
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
  // A lock-only change does not create another selection email.
  const fingerprint = JSON.stringify({items:entry.items, deliveredAt:entry.deliveredAt});
  const {createHash} = await import('node:crypto');
  const eventKey = createHash('sha256').update(fingerprint).digest('hex');
  if (entry.emailKey === eventKey) return NextResponse.json({ok:true,bundleRetention});
  if (!process.env.PHOTOGRAPHER_EMAIL || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return NextResponse.json({error:'Photographer email is not configured; selection is saved'}, {status:503});
  }
  const items = entry.items as {filename:string;note:string}[];
  const heading = entry.deliveredAt ? 'Further retouch is finished' : 'Client selection submitted';
  const lines = items.map(i => `${i.filename}: ${i.note || 'No special requests'}`).join('\n');
  const adminUrl = `${req.nextUrl.origin}/admin/bookings`;
  const body = `${heading}\n${booking.clientName} · ${booking.ref}\nSelection version ${entry.version} · ${items.length} photos\n\n${lines}\n\nView booking and selection: ${adminUrl}`;
  const html = `<!doctype html><meta charset="utf-8"><h1>${escape(heading)}</h1><p>${escape(booking.clientName)} · ${escape(booking.ref)}</p><p>Version ${entry.version} · ${items.length} photos</p><table><tr><th>Photo</th><th>Retouch notes</th></tr>${items.map(i=>`<tr><td>${escape(i.filename)}</td><td style="white-space:pre-wrap">${escape(i.note || 'No special requests')}</td></tr>`).join('')}</table><p><a href="${escape(adminUrl)}">View booking and selection</a></p>`;
  const result = await new Resend(process.env.RESEND_API_KEY).emails.send({from:process.env.RESEND_FROM_EMAIL,
    to:process.env.PHOTOGRAPHER_EMAIL, subject:`${heading} — ${booking.ref}`, text:body, html,
    attachments:[{filename:`${booking.ref}-retouch-notes.html`,content:Buffer.from(html).toString('base64')}]},
    {idempotencyKey:`gallery-${entry.galleryId}-${eventKey}`});
  if (result.error) return NextResponse.json({error:'Email pending retry; selection is saved'}, {status:503});
  await prisma.galleryInbox.updateMany({where:{galleryId:entry.galleryId,version:entry.version},data:{emailKey:eventKey,emailSentAt:new Date()}});
  return NextResponse.json({ok:true,bundleRetention});
}
