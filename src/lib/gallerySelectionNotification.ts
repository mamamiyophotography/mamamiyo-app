import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { brandedFromAddress } from './email';
import { sendWhatsApp } from './whatsapp';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export async function notifyGallerySelection(
  db: any,
  booking: { id:string; ref:string; clientName:string; sessionLabel:string },
  entry: { galleryId:string; version:number; items:unknown; submitted:boolean; deliveredAt:Date|null; emailKey:string|null; whatsappKey:string|null },
  adminUrl: string,
) {
  if (!entry.submitted || entry.deliveredAt) return { emailSent:false, whatsappSent:false };
  const items = entry.items as {filename:string;note:string}[];
  const fingerprint = JSON.stringify({items, deliveredAt:entry.deliveredAt});
  const eventKey = createHash('sha256').update(fingerprint).digest('hex');
  const heading = 'Client selection submitted';
  let emailSent = entry.emailKey === eventKey;
  let whatsappSent = entry.whatsappKey === eventKey;

  if (!emailSent) {
    if (!process.env.PHOTOGRAPHER_EMAIL || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      throw new Error('Photographer email is not configured; selection is saved.');
    }
    const lines = items.map(i => `${i.filename}: ${i.note || 'No special requests'}`).join('\n');
    const body = `${heading}\n${booking.clientName} · ${booking.ref}\nSelection version ${entry.version} · ${items.length} photos\n\n${lines}\n\nView booking and selection: ${adminUrl}`;
    const html = `<!doctype html><meta charset="utf-8"><h1>${escape(heading)}</h1><p>${escape(booking.clientName)} · ${escape(booking.ref)}</p><p>Version ${entry.version} · ${items.length} photos</p><table><tr><th>Photo</th><th>Retouch notes</th></tr>${items.map(i=>`<tr><td>${escape(i.filename)}</td><td style="white-space:pre-wrap">${escape(i.note || 'No special requests')}</td></tr>`).join('')}</table><p><a href="${escape(adminUrl)}">View booking and selection</a></p>`;
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: brandedFromAddress(process.env.RESEND_FROM_EMAIL),
      to: process.env.PHOTOGRAPHER_EMAIL,
      subject: `${heading} — ${booking.ref}`,
      text: body,
      html,
      attachments: [{filename:`${booking.ref}-retouch-notes.html`,content:Buffer.from(html).toString('base64')}],
    }, {idempotencyKey:`gallery-owner-selection-${entry.galleryId}-${eventKey}`});
    if (result.error) throw new Error(`Selection email failed: ${result.error.message}`);
    await db.galleryInbox.update({where:{galleryId:entry.galleryId},data:{emailKey:eventKey,emailSentAt:new Date()}});
    emailSent = true;
  }

  if (!whatsappSent) {
    if (!process.env.PHOTOGRAPHER_PHONE) throw new Error('Photographer WhatsApp number is not configured; selection is saved.');
    const noted = items.filter(item => item.note?.trim()).length;
    await sendWhatsApp(process.env.PHOTOGRAPHER_PHONE, [
      '📸 Client photo selection submitted',
      `${booking.clientName} — ${booking.sessionLabel}`,
      `${items.length} photos selected for Further Retouch${noted ? ` · ${noted} with notes` : ''}`,
      `Ref: ${booking.ref}`,
      `Open Booking App: ${adminUrl}`,
    ].join('\n'));
    await db.galleryInbox.update({where:{galleryId:entry.galleryId},data:{whatsappKey:eventKey,whatsappSentAt:new Date()}});
    whatsappSent = true;
  }
  return { emailSent, whatsappSent };
}
