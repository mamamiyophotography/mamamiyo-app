import { sendEmail } from './email';
import { sendWhatsApp } from './whatsapp';
import { NotificationPair } from './notifications';
import { generateIcs, icsToBase64, IcsEvent } from './ics';
import { STUDIO_INFO } from './constants';
import { fmtBookingTitle } from './format';

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
  extraLineItems?: { description: string; amount: number }[];  // post-session charges
  total: number;       // original session total (before extra items)
  depositAmount: number;
  balanceDue: number;  // final balance due (including extra items)
  isBundle?: boolean;
  bundleSessionNumber?: number | null;
  isInvoice?: boolean;  // true for balance payment invoice, false for booking confirmation
};

export type PayNowQr = {
  payload: string;
  amount: number;
  ref: string;
};

export type ClientDetails = {
  name: string;
  email: string;
  phone: string;
  address?: string;
  notes?: string;
};

function buildHtml(opts: {
  subject: string;
  paragraphs: string[];
  calendarUrl?: string;
  studioDetails?: { label: string; value: string }[];
  setupDetails?: { label: string; value: string }[];
  clientDetails?: { label: string; value: string }[];
  receiptDetails?: { label: string; value: string }[];
  paymentSummary?: { label: string; value: string }[];
  bundleSchedule?: string;  // payment schedule text for bundle emails
  inlinePhotos?: string[];
  photoUrls?: string[];      // fallback clickable links if inline fails
  inlineQrDataUrl?: string;
  qrApiUrl?: string;        // external QR image URL (Gmail-compatible)
  payNowAmount?: number;
  payNowRef?: string;
}): string {
  const gold = '#b08d57';
  const ink = '#2e2a22';
  const soft = '#6b6152';
  const cream = '#fbf6ec';
  const line = '#e6decb';

  const [titleLine1, titleLine2] = opts.subject.split('\n');
  const titleHtml = titleLine2
    ? `<div style="color:#c5a87c;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-bottom:5px;">${titleLine1}</div><div style="color:${gold};font-size:17px;font-family:Georgia,serif;">${titleLine2}</div>`
    : `<div style="color:${gold};font-size:17px;font-family:Georgia,serif;">${titleLine1}</div>`;

  const calBtn = opts.calendarUrl
    ? `<div style="margin:16px 0 20px;"><a href="${opts.calendarUrl}" target="_blank" style="display:inline-block;background:${gold};color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:10px 20px;border-radius:8px;font-family:sans-serif;">📅 Add to Google Calendar</a></div>`
    : '';

  function sectionTable(header: string, rows: { label: string; value: string }[], emoji = ''): string {
    const rowsHtml = rows.map(d => {
      const isBoldLabel = d.label.startsWith('**') && d.label.endsWith('**');
      const isBoldValue = d.value.startsWith('**') && d.value.endsWith('**');
      const label = isBoldLabel ? `<strong>${d.label.slice(2, -2)}</strong>` : d.label;
      const valueFormatted = d.value.replace(/\n\*\*(.*?)\*\*/g, '<br><strong>$1</strong>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
      const rowStyle = isBoldLabel || isBoldValue
        ? `padding:8px 0;color:#2e2a22;font-size:14px;vertical-align:top;border-top:1.5px solid #2e2a22;`
        : `padding:6px 0;color:#6b6152;font-size:13px;vertical-align:top;border-bottom:1px solid #e6decb;`;
      return `<tr>` +
        `<td style="${rowStyle}width:120px;min-width:120px;padding-right:16px;white-space:nowrap;">${label}</td>` +
        `<td style="${rowStyle}font-weight:600;word-break:break-word;">${valueFormatted}</td>` +
        `</tr>`;
    }).join('');
    return `<div style="margin:20px 0 0;">` +
      `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${soft};font-family:sans-serif;padding:6px 0;border-top:2px solid ${ink};">${emoji ? emoji + ' ' : ''}${header}</div>` +
      `<table style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0"><tbody>${rowsHtml}</tbody></table></div>`;
  }

  // Build body — inject calendar button after paragraph mentioning calendar
  let bodyHtml = '';
  for (const p of opts.paragraphs) {
    const mentionsCalendar = /calendar|invite|ics/i.test(p);
    bodyHtml += `<p style="margin:0 0 14px;color:${ink};font-size:15px;line-height:1.6;">${p.replace(/\n/g, '<br>')}</p>`;
    if (mentionsCalendar && calBtn) bodyHtml += calBtn;
  }
  if (calBtn && !bodyHtml.includes(calBtn)) bodyHtml += calBtn;

  // Studio section
  if (opts.studioDetails?.length) bodyHtml += sectionTable('Studio Details', opts.studioDetails, '📍');

  // Client details (photographer email)
  if (opts.clientDetails?.length) bodyHtml += sectionTable('Client Details', opts.clientDetails, '👤');

  // Setup Choices: photos first (inline or linked), then notes
  if (opts.setupDetails?.length || opts.inlinePhotos?.length || opts.photoUrls?.length) {
    const rowsHtml = (opts.setupDetails || []).map(d =>
      `<tr><td style="padding:6px 0;color:${soft};font-size:13px;width:150px;vertical-align:top;border-bottom:1px solid ${line};">${d.label}</td>` +
      `<td style="padding:6px 0;color:${ink};font-size:13px;font-weight:600;vertical-align:top;border-bottom:1px solid ${line};">${d.value.replace(/\n/g, '<br>')}</td></tr>`
    ).join('');

    let photoSection = '';
    if (opts.inlinePhotos?.length) {
      // External URL img tags — loaded by email client directly (not base64)
      const thumbs = opts.inlinePhotos.map(url =>
        `<td style="padding:0 6px 0 0;"><img src="${url}" width="100" height="100" style="width:100px;height:100px;object-fit:cover;border-radius:6px;border:1.5px solid ${line};display:block;" alt="Reference photo"></td>`
      ).join('');
      photoSection = `<div style="padding:10px 0;border-bottom:1px solid ${line};"><div style="font-size:12px;color:${soft};margin-bottom:6px;font-family:sans-serif;">Reference photos</div><table cellpadding="0" cellspacing="0"><tbody><tr>${thumbs}</tr></tbody></table></div>`;
    } else if (opts.photoUrls?.length) {
      // Fallback: clickable links
      const links = opts.photoUrls.map((url, i) =>
        `<a href="${url}" target="_blank" style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;background:${cream};border:1px solid ${line};border-radius:6px;font-size:12px;color:${ink};text-decoration:none;font-family:sans-serif;">Photo ${i + 1} 🔗</a>`
      ).join('');
      photoSection = `<div style="padding:10px 0;border-bottom:1px solid ${line};"><div style="font-size:12px;color:${soft};margin-bottom:6px;font-family:sans-serif;">Reference photos</div>${links}</div>`;
    }

    bodyHtml += `<div style="margin:20px 0 0;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${soft};font-family:sans-serif;padding:6px 0;border-top:2px solid ${ink};">🎨 Setup Choices</div>${photoSection}<table style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0"><tbody>${rowsHtml}</tbody></table></div>`;
  }

  // Receipt with Payment Summary
  if (opts.receiptDetails?.length) {
    bodyHtml += sectionTable(opts.inlineQrDataUrl ? 'Invoice' : 'Receipt', opts.receiptDetails, '🧾');
    if (opts.paymentSummary?.length) {
      bodyHtml += sectionTable('Payment Summary', opts.paymentSummary, '💰');
    }
    if (opts.bundleSchedule) {
      bodyHtml += `<div style="margin:16px 0 0;padding:14px;background:${cream};border-radius:8px;border:1px solid ${line};">`;
      bodyHtml += `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${soft};font-family:sans-serif;margin-bottom:8px;">📋 Bundle Payment Schedule</div>`;
      bodyHtml += `<pre style="margin:0;font-size:13px;color:${ink};font-family:Georgia,serif;white-space:pre-wrap;">${opts.bundleSchedule}</pre>`;
      bodyHtml += `</div>`;
    }
    bodyHtml += `<p style="margin:16px 0 0;color:${soft};font-size:13px;text-align:center;font-style:italic;">Thank you for choosing us! ♡</p>`;
  }

  // QR code inline — always at the very end
  if (opts.inlineQrDataUrl || opts.qrApiUrl) {
    // Use external QR API URL if available (Gmail-compatible), fall back to base64
    const qrImgSrc = opts.qrApiUrl || opts.inlineQrDataUrl;
    bodyHtml += `<div style="margin:20px 0 0;text-align:center;padding:20px;background:${cream};border-radius:10px;border:1px solid ${line};">` +
      `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${soft};font-family:sans-serif;margin-bottom:8px;">💳 PayNow QR Code</div>` +
      (opts.payNowAmount ? `<div style="font-size:15px;font-weight:700;color:${ink};margin-bottom:4px;">Amount due: $${opts.payNowAmount}</div>` : '') +
      (opts.payNowRef ? `<div style="font-size:12px;color:${soft};margin-bottom:12px;font-family:sans-serif;">Reference: ${opts.payNowRef}</div>` : '') +
      `<img src="${qrImgSrc}" width="200" height="200" style="width:200px;height:200px;display:block;margin:0 auto;border-radius:8px;" alt="PayNow QR">` +
      `<div style="font-size:12px;color:${soft};margin-top:8px;font-family:sans-serif;">Scan with your banking app to pay</div></div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid ${line};">
<tr><td style="background:${ink};padding:24px 36px;text-align:center;">
  <div style="color:#c5a87c;font-size:9px;letter-spacing:4px;text-transform:uppercase;margin-bottom:8px;">Mamamiyo Photography</div>
  ${titleHtml}
</td></tr>
<tr><td style="padding:28px 36px;">${bodyHtml}</td></tr>
<tr><td style="padding:14px 36px;border-top:1px solid ${line};text-align:center;">
  <div style="color:${soft};font-size:11px;font-family:sans-serif;">Mamamiyo Photography &nbsp;·&nbsp; <a href="https://www.mamamiyo-photography.com" style="color:${gold};text-decoration:none;">mamamiyo-photography.com</a></div>
</td></tr>
</table></td></tr></table></body></html>`;
}

function receiptRows(r: Receipt): { label: string; value: string }[] {
  const addOnsTotal = r.addOns.filter(a => a.qty > 0).reduce((s, a) => s + a.price * a.qty, 0);
  const weekendFee = r.isWeekend ? r.weekendSurcharge : 0;
  const extraTotal = (r.extraLineItems || []).reduce((s, i) => s + i.amount, 0);

  const rows: { label: string; value: string }[] = [];

  if (r.isBundle && r.bundleSessionNumber) {
    const sn = r.bundleSessionNumber;
    if (!r.isInvoice) {
      // BOOKING CONFIRMATION — session 1: just show deposit paid
      rows.push({ label: 'Deposit paid', value: '$' + r.depositAmount });
      rows.push({ label: '**Total paid now**', value: '**$' + r.depositAmount + '**' });
      return rows;
    } else {
      // BALANCE INVOICE — show session balance + surcharges
      // basePrice = the session balance (e.g. $330 for session 1, $330 for s2, $328 for s3)
      const sessionBalance = r.total; // for invoice: total = session balance only
      rows.push({ label: 'Session ' + sn + ' balance', value: '$' + sessionBalance });
    }
  } else {
    const basePrice = r.total - addOnsTotal - weekendFee + (r.discountAmount || 0);
    rows.push({ label: 'Package Price', value: '$' + basePrice });
  }

  if (weekendFee > 0) rows.push({ label: 'Wknd/PH Surcharge', value: '+$' + weekendFee });
  r.addOns.filter(a => a.qty > 0).forEach(a =>
    rows.push({ label: a.name + ' × ' + a.qty, value: '+$' + (a.price * a.qty) })
  );
  if (r.discountCode && r.discountAmount > 0)
    rows.push({ label: 'Discount (' + r.discountCode + ')', value: '-$' + r.discountAmount });
  if (r.extraLineItems?.length)
    r.extraLineItems.forEach(item => rows.push({ label: item.description, value: '+$' + item.amount }));

  const totalDue = r.balanceDue;
  rows.push({ label: '**Total due**', value: '**$' + totalDue + '**' });
  return rows;
}

function paymentSummaryRows(r: Receipt): { label: string; value: string }[] {
  // Bundle: payment schedule section already shows the full structure — no need to repeat
  if (r.isBundle) return [];
  return [
    { label: 'Deposit Paid', value: '-$' + r.depositAmount },
    { label: '**Balance Due**', value: '**$' + r.balanceDue + '**' },
  ];
}

function studioRows(): { label: string; value: string }[] {
  return [
    { label: 'Studio', value: STUDIO_INFO.name },
    { label: 'Address', value: STUDIO_INFO.addressLines.join(', ') },
    { label: 'Access', value: STUDIO_INFO.access },
    { label: 'Parking', value: `${STUDIO_INFO.parkingOk}\n**Do NOT park in other slots**` },
  ];
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
  referencePhotoUrls?: string[],
  clientDetails?: ClientDetails,
  bookingMeta?: { date: string; clientName: string; sessionLabel: string },
): Promise<void> {
  if (!clientEmail || !photographerEmail) {
    console.warn('dispatchNotification: missing email address, skipping');
    return;
  }

  // ICS attachment
  let icsAttachment: { filename: string; content: string } | undefined;
  let gcalUrl = '';
  if (calendarEvent) {
    try {
      icsAttachment = { filename: 'booking.ics', content: icsToBase64(generateIcs(calendarEvent)) };
      const d = calendarEvent.dateISO.replace(/-/g, '');
      const s = calendarEvent.startTime.replace(':', '') + '00';
      const e = calendarEvent.endTime.replace(':', '') + '00';
      gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calendarEvent.summary)}&dates=${d}T${s}/${d}T${e}&location=${encodeURIComponent(calendarEvent.location)}&details=${encodeURIComponent(calendarEvent.description)}`;
    } catch { /* silent */ }
  }

  // PayNow QR — use QR code API for Gmail-compatible external image URL
  // (Gmail blocks base64 inline images but loads external https:// URLs fine)
  let qrApiUrl: string | undefined;
  let payNowRef = '';
  let payNowAmount = 0;
  if (payNowQr) {
    try {
      // api.qrserver.com is a free, reliable QR generation service
      const encoded = encodeURIComponent(payNowQr.payload);
      qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&margin=10`;
      payNowRef = payNowQr.ref;
      payNowAmount = payNowQr.amount;
    } catch { /* silent */ }
  }

  // Photos — use Supabase URLs directly as img src (bucket is public)
  // Email clients load these externally. No server-side base64 conversion needed.
  const photoUrls = referencePhotoUrls?.slice(0, 5) || [];

  const att = icsAttachment ? [icsAttachment] : undefined;

  const studio = receipt?.location === 'studio' ? studioRows() : undefined;

  // Bundle payment schedule — shown in ALL bundle emails regardless of whether receipt is present
  const isBundle = receipt?.isBundle || pair.client.emailSubject.toLowerCase().includes('bundle') || pair.photographer.emailSubject.toLowerCase().includes('bundle');
  const bundleSchedule = isBundle ? [
    'First Year Bundle ($1,088 total)',
    '',
    '• Deposit to secure booking:     $100',
    '• Balance after Session 1:       $330',
    '• Balance after Session 2:       $330',
    '• Balance after Session 3:       $328',
  ].join('\n') : undefined;

  // Client setup: notes only (photos shown separately via inlinePhotos/photoUrls)
  const setupForClient: { label: string; value: string }[] = [];
  if (clientDetails?.notes) setupForClient.push({ label: 'Your notes', value: clientDetails.notes });

  // Photographer client info
  const clientInfoRows: { label: string; value: string }[] = [];
  if (clientDetails) {
    clientInfoRows.push({ label: 'Name', value: clientDetails.name });
    clientInfoRows.push({ label: 'Email', value: clientDetails.email });
    clientInfoRows.push({ label: 'Phone', value: clientDetails.phone });
    if (clientDetails.address) clientInfoRows.push({ label: 'Address', value: clientDetails.address });
    if (clientDetails.notes) clientInfoRows.push({ label: 'Notes', value: clientDetails.notes });
  }

  const clientParagraphs = pair.client.emailBody.split('\n\n').filter(Boolean);
  const clientHtml = buildHtml({
    subject: pair.client.emailSubject,
    paragraphs: clientParagraphs,
    calendarUrl: gcalUrl || undefined,
    studioDetails: studio,
    setupDetails: setupForClient.length ? setupForClient : undefined,
    receiptDetails: receipt ? receiptRows(receipt) : undefined,
    paymentSummary: receipt ? paymentSummaryRows(receipt) : undefined,
    bundleSchedule: bundleSchedule,
    inlinePhotos: photoUrls.length ? photoUrls : undefined,
    qrApiUrl,
    payNowAmount: payNowAmount || undefined,
    payNowRef: payNowRef || undefined,
  });

  const photographerParagraphs = pair.photographer.emailBody.split('\n\n').filter(Boolean);
  const photographerHtml = buildHtml({
    subject: pair.photographer.emailSubject,
    paragraphs: photographerParagraphs,
    calendarUrl: gcalUrl || undefined,
    studioDetails: studio,
    clientDetails: clientInfoRows.length ? clientInfoRows : undefined,
    receiptDetails: receipt ? receiptRows(receipt) : undefined,
    paymentSummary: receipt ? paymentSummaryRows(receipt) : undefined,
    bundleSchedule: bundleSchedule,
    inlinePhotos: photoUrls.length ? photoUrls : undefined,
    qrApiUrl,
    payNowAmount: payNowAmount || undefined,
    payNowRef: payNowRef || undefined,
  });

  const sends: Promise<void>[] = [];
  if (pair.client.emailSubject && clientEmail) {
    sends.push(sendEmail(clientEmail, pair.client.emailSubject.replace('\n', ' — '), pair.client.emailBody, att, clientHtml));
  }
  if (clientPhoneE164) sends.push(sendWhatsApp(clientPhoneE164, pair.client.whatsappBody));
  if (pair.photographer.emailSubject && photographerEmail) {
    const photographerSubject = bookingMeta
      ? fmtBookingTitle(bookingMeta.date, bookingMeta.clientName, bookingMeta.sessionLabel)
      : pair.photographer.emailSubject;
    sends.push(sendEmail(photographerEmail, photographerSubject, pair.photographer.emailBody, att, photographerHtml));
  }
  if (photographerPhoneE164) sends.push(sendWhatsApp(photographerPhoneE164, pair.photographer.whatsappBody));

  const results = await Promise.allSettled(sends);
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length) {
    const messages = failures.map(r => (r as PromiseRejectedResult).reason?.message || 'unknown').join('; ');
    throw new Error(`Notification email delivery failed: ${messages}`);
  }
}
