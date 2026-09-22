import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { Resend } from 'resend';

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
  const b = await prisma.booking.findUnique({where:{ref}, select:{ref:true, clientName:true, date:true, status:true}});
  return b ? NextResponse.json(b) : NextResponse.json({error:'Booking reference not found'}, {status:404});
}
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({error:'Unauthorized'}, {status:401});
  const raw = await req.text();
  if (raw.length > 150000) return NextResponse.json({error:'Too large'}, {status:413});
  let p: any;
  try { p = JSON.parse(raw); } catch { return NextResponse.json({error:'Invalid JSON'}, {status:400}); }
  if (!/^[a-f0-9]{32}$/.test(p.galleryId || '') || typeof p.bookingRef !== 'string' || p.bookingRef.length > 100 ||
      !Number.isSafeInteger(p.version) || p.version < 0 || typeof p.submitted !== 'boolean' || typeof p.locked !== 'boolean' ||
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
      create:{galleryId:p.galleryId, bookingId:booking.id, version:p.version, items:p.items, submitted:p.submitted, locked:p.locked, deliveredAt},
      update:{version:p.version, items:p.items, submitted:p.submitted, locked:p.locked, deliveredAt}});
    if (deliveredAt && ['basic_retouch','pending_balance','further_retouch'].includes(booking.status)) {
      await tx.booking.update({where:{id:booking.id},data:{status:'completed'}});
    } else if (p.locked && p.submitted && ['basic_retouch','pending_balance'].includes(booking.status)) {
      await tx.booking.update({where:{id:booking.id},data:{status:'further_retouch'}});
    }
    return result;
  });
  if (!entry.submitted) return NextResponse.json({ok:true});
  // A lock-only change does not create another selection email.
  const fingerprint = JSON.stringify({items:entry.items, deliveredAt:entry.deliveredAt});
  const {createHash} = await import('node:crypto');
  const eventKey = createHash('sha256').update(fingerprint).digest('hex');
  if (entry.emailKey === eventKey) return NextResponse.json({ok:true});
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
  return NextResponse.json({ok:true});
}
