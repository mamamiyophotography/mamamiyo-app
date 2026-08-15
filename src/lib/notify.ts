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

// Inline HTML builder — avoids importing from email.ts which may not have
// buildEmailHtml in older deployed versions
function buildHtml(subject: string, paragraphs: string[], details?: { label: string; value: string }[], calUrl?: string): string {
  const gold = '#b08d57';
  const ink = '#2e2a22';
  const soft = '#6b6152';
  const cream = '#fbf6ec';
  const line = '#e6decb';

  const rows = (details || []).map(d =>
    `<tr><td style="padding:5px 0;color:${soft};font-size:13px;width:160px;vertical-align:top;">${d.label}</td>` +
    `<td style="padding:5px 0;color:${ink};font-size:13px;font-weight:600;vertical-align:top;">${d.value.replace(/\n/g, '<br>')}</td></tr>`
  ).join('');

  const table = rows ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;background:${cream};border-radius:8px;padding:12px;" cellpadding="0" cellspacing="0"><tbody>${rows}</tbody></table>` : '';

  const calBtn = calUrl ? `<div style="text-align:center;margin:20px 0;"><a href="${calUrl}" target="_blank" style="display:inline-block;background:${gold};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:9px;font-family:sans-serif;">📅 Add to Google Calendar</a></div>` : '';

  const body = paragraphs.map(p => `<p style="margin:0 0 14px;color:${ink};font-size:15px;line-height:1.6;">${p.replace(/\n/g, '<br>')}</p>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;"><tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid ${line};">
<tr><td style="background:${ink};padding:24px 32px;text-align:center;">
  <div style="color:${cream};font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-bottom:3px;">Mamamiyo Photography</div>
  <div style="color:${gold};font-size:18px;font-family:Georgia,serif;">${subject}</div>
</td></tr>
<tr><td style="padding:28px 32px;">${body}${table}${calBtn}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid ${line};text-align:center;">
  <div style="color:${soft};font-size:11px;font-family:sans-serif;">Mamamiyo Photography &nbsp;·&nbsp; <a href="https://www.mamamiyo-photography.com" style="color:${gold};text-decoration:none;">mamamiyo-photography.com</a></div>
</td></tr>
</table></td></tr></table></body></html>`;
}

function fmtReceipt(r: Receipt): { label: string; value: string }[] {
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
): Promise<void> {
  // Skip sending if email addresses are missing
  if (!clientEmail || !photographerEmail) {
    console.warn('dispatchNotification: missing email address, skipping');
    return;
  }

  let icsAttachment: { filename: string; content: string } | undefined;
  let gcalUrl = '';
  let qrAttachment: { filename: string; content: string } | undefined;

  if (calendarEvent) {
    try {
      icsAttachment = { filename: 'booking.ics', content: icsToBase64(generateIcs(calendarEvent)) };
      const gcalDate = calendarEvent.dateISO.replace(/-/g, '');
      const startT = calendarEvent.startTime.replace(':', '') + '00';
      const endT = calendarEvent.endTime.replace(':', '') + '00';
      gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calendarEvent.summary)}&dates=${gcalDate}T${startT}/${gcalDate}T${endT}&location=${encodeURIComponent(calendarEvent.location)}&details=${encodeURIComponent(calendarEvent.description)}`;
    } catch { /* calendar generation failed silently */ }
  }

  if (payNowQr) {
    try {
      const QRCode = (await import('qrcode')).default;
      const qrDataUrl = await QRCode.toDataURL(payNowQr.payload, { margin: 1, width: 280 });
      const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
      qrAttachment = { filename: 'paynow-qr.png', content: base64 };
    } catch { /* QR generation failed silently */ }
  }

  const attachments = [
    ...(icsAttachment ? [icsAttachment] : []),
    ...(qrAttachment ? [qrAttachment] : []),
  ];

  // Build client email HTML
  const clientParagraphs = pair.client.emailBody.split('\n\n').filter(Boolean);
  if (receipt) clientParagraphs.push(`Your itemised receipt is shown below.`);
  if (payNowQr) clientParagraphs.push(`Balance due: $${payNowQr.amount} (ref: ${payNowQr.ref})\nA PayNow QR code is attached — scan it with your banking app to pay.`);
  const clientDetails = receipt ? fmtReceipt(receipt) : undefined;
  const clientHtml = buildHtml(pair.client.emailSubject, clientParagraphs, clientDetails, gcalUrl || undefined);

  // Build photographer email HTML
  const photographerParagraphs = pair.photographer.emailBody.split('\n\n').filter(Boolean);
  if (receipt) photographerParagraphs.push(`Client receipt attached.`);
  if (payNowQr) photographerParagraphs.push(`Balance due: $${payNowQr.amount} (ref: ${payNowQr.ref})`);
  const photographerDetails = receipt ? fmtReceipt(receipt) : undefined;
  const photographerHtml = buildHtml(pair.photographer.emailSubject, photographerParagraphs, photographerDetails, gcalUrl || undefined);

  const att = attachments.length ? attachments : undefined;

  // Skip sending to empty addresses
  const sends: Promise<void>[] = [];
  if (pair.client.emailSubject && clientEmail) {
    sends.push(sendEmail(clientEmail, pair.client.emailSubject, pair.client.emailBody, att, clientHtml));
  }
  if (clientPhoneE164) sends.push(sendWhatsApp(clientPhoneE164, pair.client.whatsappBody));
  if (pair.photographer.emailSubject && photographerEmail) {
    sends.push(sendEmail(photographerEmail, pair.photographer.emailSubject, pair.photographer.emailBody, att, photographerHtml));
  }
  if (photographerPhoneE164) sends.push(sendWhatsApp(photographerPhoneE164, pair.photographer.whatsappBody));

  const results = await Promise.allSettled(sends);

  const emailFailures = results.filter((r) => r.status === 'rejected');
  if (emailFailures.length) {
    const messages = emailFailures
      .map((r) => (r as PromiseRejectedResult).reason?.message || 'unknown error')
      .join('; ');
    throw new Error(`Notification email delivery failed: ${messages}`);
  }
}
