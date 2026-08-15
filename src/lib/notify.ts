import { sendEmail, buildEmailHtml } from './email';
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
  payload: string;  // the raw PayNow string, used to generate QR client-side
  amount: number;
  ref: string;
};

function fmtReceipt(r: Receipt): string {
  const lines: string[] = [
    `Session: ${r.sessionLabel}`,
    `Date: ${r.date} at ${r.startTime}`,
    `Location: ${r.location === 'home' ? `Your home — ${r.address || 'address on file'}` : 'Studio'}`,
  ];
  if (r.isWeekend) lines.push(`Weekend / PH surcharge: +$${r.weekendSurcharge}`);
  r.addOns.filter(a => a.qty > 0).forEach(a => lines.push(`${a.name} ×${a.qty}: +$${a.price * a.qty}`));
  if (r.discountCode && r.discountAmount > 0) lines.push(`Discount (${r.discountCode}): -$${r.discountAmount}`);
  lines.push(`Total: $${r.total}`);
  lines.push(`Deposit paid: $${r.depositAmount}`);
  lines.push(`Balance due after session: $${r.balanceDue}`);
  return lines.join('\n');
}

function receiptDetails(r: Receipt): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [
    { label: 'Session', value: r.sessionLabel },
    { label: 'Location', value: r.location === 'home'
      ? `Your home\n${r.address || 'address on file'}`
      : `${STUDIO_INFO.name}\n${STUDIO_INFO.addressLines.join('\n')}\n${STUDIO_INFO.access}\n${STUDIO_INFO.parkingOk}` },
  ];
  if (r.isWeekend) rows.push({ label: 'Weekend surcharge', value: `+$${r.weekendSurcharge}` });
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
  let icsAttachment: { filename: string; content: string } | undefined;
  let gcalUrl = '';
  let qrAttachment: { filename: string; content: string } | undefined;

  if (calendarEvent) {
    icsAttachment = { filename: 'booking.ics', content: icsToBase64(generateIcs(calendarEvent)) };
    const gcalDate = calendarEvent.dateISO.replace(/-/g, '');
    const startT = calendarEvent.startTime.replace(':', '') + '00';
    const endT = calendarEvent.endTime.replace(':', '') + '00';
    gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calendarEvent.summary)}&dates=${gcalDate}T${startT}/${gcalDate}T${endT}&location=${encodeURIComponent(calendarEvent.location)}&details=${encodeURIComponent(calendarEvent.description)}`;
  }

  if (payNowQr) {
    try {
      const QRCode = (await import('qrcode')).default;
      const qrDataUrl = await QRCode.toDataURL(payNowQr.payload, { margin: 1, width: 280 });
      // Convert data URL to base64 content
      const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
      qrAttachment = { filename: 'paynow-qr.png', content: base64 };
    } catch {
      // QR generation failed silently
    }
  }

  const attachments = [
    ...(icsAttachment ? [icsAttachment] : []),
    ...(qrAttachment ? [qrAttachment] : []),
  ];

  // Build HTML for client email
  const clientParagraphs = pair.client.emailBody.split('\n\n').filter(Boolean);
  if (receipt) {
    clientParagraphs.push(`Your itemised receipt:\n${fmtReceipt(receipt)}`);
  }
  if (payNowQr) {
    clientParagraphs.push(`Balance due: $${payNowQr.amount}\nReference: ${payNowQr.ref}\n\nA PayNow QR code is attached — open the attachment and scan it with your banking app to pay.`);
  }
  const clientHtml = buildEmailHtml({
    title: pair.client.emailSubject,
    paragraphs: clientParagraphs,
    details: receipt ? receiptDetails(receipt) : undefined,
    calendarUrl: gcalUrl || undefined,
    businessName: 'Mamamiyo Photography',
  });

  // Build HTML for photographer email
  const photographerParagraphs = pair.photographer.emailBody.split('\n\n').filter(Boolean);
  const photographerHtml = buildEmailHtml({
    title: pair.photographer.emailSubject,
    paragraphs: photographerParagraphs,
    details: receipt ? receiptDetails(receipt) : undefined,
    calendarUrl: gcalUrl || undefined,
    businessName: 'Mamamiyo Photography',
  });

  const results = await Promise.allSettled([
    sendEmail(clientEmail, pair.client.emailSubject, pair.client.emailBody, attachments.length ? attachments : undefined, clientHtml),
    sendWhatsApp(clientPhoneE164, pair.client.whatsappBody),
    sendEmail(photographerEmail, pair.photographer.emailSubject, pair.photographer.emailBody, attachments.length ? attachments : undefined, photographerHtml),
    sendWhatsApp(photographerPhoneE164, pair.photographer.whatsappBody),
  ]);

  const emailFailures = [results[0], results[2]].filter((r) => r.status === 'rejected');
  if (emailFailures.length) {
    const messages = emailFailures
      .map((r) => (r as PromiseRejectedResult).reason?.message || 'unknown error')
      .join('; ');
    throw new Error(`Notification email delivery failed: ${messages}`);
  }
}
