import { sendEmail } from './email';
import { sendWhatsApp } from './whatsapp';
import { NotificationPair } from './notifications';
import { generateIcs, icsToBase64, IcsEvent } from './ics';
import { STUDIO_INFO } from './constants';

export type Receipt = {
  sessionLabel: string;
  date: string;
  startTime: string;
  location: string;
  address?: string;
  isWeekend: boolean;
  weekendSurcharge: number;
  addOns: { name: string; qty: number; price: number }[];
  discountCode?: string | null;
  discountAmount: number;
  total: number;
  depositAmount: number;
  balanceDue: number;
};

export type PayNowQr = {
  payload: string;
  amount: number;
  ref: string;
};

// Inline HTML builder — self-contained, no external imports needed
function buildHtml(
  subject: string,  // may contain \n to split into two lines
  paragraphs: string[],
  details?: { label: string; value: string }[],
  calendarUrl?: string,   // if set, renders button after first mention of calendar in text
  payNowNote?: string,    // extra PayNow paragraph
): string {
  const gold = '#b08d57';
  const ink = '#2e2a22';
  const soft = '#6b6152';
  const cream = '#fbf6ec';
  const line = '#e6decb';

  // Split subject into up to two lines
  const [titleLine1, titleLine2] = subject.split('\n');
  const titleHtml = titleLine2
    ? `<div style="color:${cream};font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">${titleLine1}</div><div style="color:${gold};font-size:17px;font-family:Georgia,serif;">${titleLine2}</div>`
    : `<div style="color:${gold};font-size:18px;font-family:Georgia,serif;">${titleLine1}</div>`;

  const calBtn = calendarUrl
    ? `<div style="margin:16px 0;"><a href="${calendarUrl}" target="_blank" style="display:inline-block;background:${gold};color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:10px 20px;border-radius:8px;font-family:sans-serif;">📅 Add to Google Calendar</a></div>`
    : '';

  const rows = (details || []).map(d =>
    `<tr><td style="padding:5px 0;color:${soft};font-size:13px;width:160px;vertical-align:top;">${d.label}</td>` +
    `<td style="padding:5px 0;color:${ink};font-size:13px;font-weight:600;vertical-align:top;">${d.value.replace(/\n/g, '<br>')}</td></tr>`
  ).join('');
  const table = rows
    ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;background:${cream};border-radius:8px;padding:12px;" cellpadding="0" cellspacing="0"><tbody>${rows}</tbody></table>`
    : '';

  // Build body — insert calendar button after the paragraph that mentions calendar
  let bodyHtml = '';
  for (const p of paragraphs) {
    const mentionsCalendar = /calendar|invite|ics/i.test(p);
    bodyHtml += `<p style="margin:0 0 14px;color:${ink};font-size:15px;line-height:1.6;">${p.replace(/\n/g, '<br>')}</p>`;
    if (mentionsCalendar && calBtn) {
      bodyHtml += calBtn;
    }
  }
  // If no paragraph mentioned calendar but we have a button, append it
  if (calBtn && !bodyHtml.includes(calBtn)) {
    bodyHtml += calBtn;
  }

  if (payNowNote) {
    bodyHtml += `<p style="margin:0 0 14px;color:${ink};font-size:15px;line-height:1.6;">${payNowNote.replace(/\n/g, '<br>')}</p>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;"><tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid ${line};">
<tr><td style="background:${ink};padding:24px 32px;text-align:center;">
  <div style="color:${cream};font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-bottom:6px;">Mamamiyo Photography</div>
  ${titleHtml}
</td></tr>
<tr><td style="padding:28px 32px;">${bodyHtml}${table}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid ${line};text-align:center;">
  <div style="color:${soft};font-size:11px;font-family:sans-serif;">Mamamiyo Photography &nbsp;·&nbsp; <a href="https://www.mamamiyo-photography.com" style="color:${gold};text-decoration:none;">mamamiyo-photography.com</a></div>
</td></tr>
</table></td></tr></table></body></html>`;
}

function receiptDetails(r: Receipt): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [
    { label: 'Session', value: r.sessionLabel },
    { label: 'Location', value: r.location === 'home'
      ? `Your home\n${r.address || 'address on file'}`
      : `${STUDIO_INFO.name}\n${STUDIO_INFO.addressLines.join('\n')}\n${STUDIO_INFO.access}\n${STUDIO_INFO.parkingOk}` },
    { label: r.isWeekend ? 'Weekend surcharge' : 'Surcharge', value: r.isWeekend ? `+$${r.weekendSurcharge}` : '$0' },
  ];
  r.addOns.filter(a => a.qty > 0).forEach(a =>
    rows.push({ label: `${a.name} ×${a.qty}`, value: `+$${a.price * a.qty}` })
  );
  if (r.discountCode && r.discountAmount > 0)
    rows.push({ label: `Discount (${r.discountCode})`, value: `-$${r.discountAmount}` });
  rows.push({ label: 'Total', value: `$${r.total}` });
  rows.push({ label: 'Deposit paid', value: `$${r.depositAmount}` });
  rows.push({ label: 'Balance due after session', value: `$${r.balanceDue}` });
  return rows;
}

export async function dispatchNotification(
  pair: NotificationPair,
  clientEmail: string,
  clientPhoneE164: string,
  photographerEmail: string,
  photographerPhoneE164: string,
  calendarEvent?: IcsEvent,
  receipt?: Receipt,
  payNowQr?: PayNowQr,
  referencePhotoUrls?: string[],  // attach photos to both emails
): Promise<void> {
  if (!clientEmail || !photographerEmail) {
    console.warn('dispatchNotification: missing email address, skipping');
    return;
  }

  // Build ICS attachment
  let icsAttachment: { filename: string; content: string } | undefined;
  let gcalUrl = '';
  if (calendarEvent) {
    try {
      icsAttachment = { filename: 'booking.ics', content: icsToBase64(generateIcs(calendarEvent)) };
      const gcalDate = calendarEvent.dateISO.replace(/-/g, '');
      const startT = calendarEvent.startTime.replace(':', '') + '00';
      const endT = calendarEvent.endTime.replace(':', '') + '00';
      gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calendarEvent.summary)}&dates=${gcalDate}T${startT}/${gcalDate}T${endT}&location=${encodeURIComponent(calendarEvent.location)}&details=${encodeURIComponent(calendarEvent.description)}`;
    } catch { /* silent */ }
  }

  // Build PayNow QR attachment
  let qrAttachment: { filename: string; content: string } | undefined;
  let payNowNote = '';
  if (payNowQr) {
    try {
      const QRCode = (await import('qrcode')).default;
      const qrDataUrl = await QRCode.toDataURL(payNowQr.payload, { margin: 1, width: 280 });
      qrAttachment = { filename: 'paynow-qr.png', content: qrDataUrl.replace(/^data:image\/png;base64,/, '') };
      payNowNote = `Balance due: $${payNowQr.amount} (ref: ${payNowQr.ref})\nA PayNow QR code is attached — scan it with your banking app to pay.`;
    } catch { /* silent */ }
  }

  const attachments = [
    ...(icsAttachment ? [icsAttachment] : []),
    ...(qrAttachment ? [qrAttachment] : []),
  ];

  // Build client email — calendar button injected inline after calendar mention
  const clientParagraphs = pair.client.emailBody.split('\n\n').filter(Boolean);
  const clientDetails = receipt ? receiptDetails(receipt) : undefined;
  const clientHtml = buildHtml(
    pair.client.emailSubject,
    clientParagraphs,
    clientDetails,
    gcalUrl || undefined,
    payNowNote || undefined,
  );

  // Build photographer email
  const photographerParagraphs = pair.photographer.emailBody.split('\n\n').filter(Boolean);
  // Add reference photo links for photographer
  if (referencePhotoUrls?.length) {
    photographerParagraphs.push(
      `Reference photos (${referencePhotoUrls.length}):\n` +
      referencePhotoUrls.map((url, i) => `Photo ${i + 1}: ${url}`).join('\n')
    );
  }
  const photographerDetails = receipt ? receiptDetails(receipt) : undefined;
  const photographerHtml = buildHtml(
    pair.photographer.emailSubject,
    photographerParagraphs,
    photographerDetails,
    gcalUrl || undefined,
    payNowNote || undefined,
  );

  const att = attachments.length ? attachments : undefined;

  const sends: Promise<void>[] = [];
  if (pair.client.emailSubject && clientEmail) {
    sends.push(sendEmail(clientEmail, pair.client.emailSubject.replace('\n', ' — '), pair.client.emailBody, att, clientHtml));
  }
  if (clientPhoneE164) sends.push(sendWhatsApp(clientPhoneE164, pair.client.whatsappBody));
  if (pair.photographer.emailSubject && photographerEmail) {
    sends.push(sendEmail(photographerEmail, pair.photographer.emailSubject, pair.photographer.emailBody, att, photographerHtml));
  }
  if (photographerPhoneE164) sends.push(sendWhatsApp(photographerPhoneE164, pair.photographer.whatsappBody));

  const results = await Promise.allSettled(sends);
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length) {
    const messages = failures.map(r => (r as PromiseRejectedResult).reason?.message || 'unknown').join('; ');
    throw new Error(`Notification email delivery failed: ${messages}`);
  }
}
