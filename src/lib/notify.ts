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
  total: number;
  depositAmount: number;
  balanceDue: number;
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

/** Fetch a URL and return a base64 data URI, for inline email images.
 *  Returns null if the fetch fails — callers should handle gracefully. */
async function toInlineImage(url: string): Promise<string | null> {
  try {
    // Use a manual timeout via Promise.race — AbortSignal.timeout not
    // available in all Node versions on Vercel
    const timeout = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 10000)
    );
    const fetchPromise = fetch(url).then(async (res) => {
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      const buf = await res.arrayBuffer();
      return `data:${contentType};base64,${Buffer.from(buf).toString('base64')}`;
    });
    return await Promise.race([fetchPromise, timeout]);
  } catch {
    return null;
  }
}

/** Fetch all reference photo URLs and convert to inline data URIs in parallel. */
async function fetchInlinePhotos(urls: string[]): Promise<string[]> {
  const results = await Promise.all(urls.map(toInlineImage));
  return results.filter((r): r is string => r !== null);
}

function buildHtml(opts: {
  subject: string;
  paragraphs: string[];
  calendarUrl?: string;
  studioDetails?: { label: string; value: string }[];
  setupDetails?: { label: string; value: string }[];
  clientDetails?: { label: string; value: string }[];
  receiptDetails?: { label: string; value: string }[];
  inlinePhotos?: string[];
  inlineQrDataUrl?: string;   // QR shown inline at end of email
  payNowNote?: string;
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
    const rowsHtml = rows.map(d =>
      `<tr><td style="padding:6px 0;color:${soft};font-size:13px;width:150px;vertical-align:top;border-bottom:1px solid ${line};">${d.label}</td>` +
      `<td style="padding:6px 0;color:${ink};font-size:13px;font-weight:600;vertical-align:top;border-bottom:1px solid ${line};">${d.value.replace(/\n/g, '<br>')}</td></tr>`
    ).join('');
    return `<div style="margin:20px 0 0;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${soft};font-family:sans-serif;padding:6px 0;border-top:2px solid ${ink};">${emoji ? emoji + ' ' : ''}${header}</div>` +
      `<table style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0"><tbody>${rowsHtml}</tbody></table></div>`;
  }

  function photoGrid(inlinePhotos: string[]): string {
    if (!inlinePhotos.length) return '';
    const thumbs = inlinePhotos.map(src =>
      `<td style="padding:4px;"><img src="${src}" style="width:110px;height:110px;object-fit:cover;border-radius:8px;border:1.5px solid ${line};display:block;" alt="Reference photo"></td>`
    ).join('');
    return `<div style="margin:20px 0 0;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${soft};font-family:sans-serif;padding:6px 0;border-top:2px solid ${ink};">📸 Reference Photos</div>` +
      `<table cellpadding="0" cellspacing="0" style="margin-top:8px;"><tbody><tr>${thumbs}</tr></tbody></table></div>`;
  }

  // Build body — inject calendar button after paragraph mentioning calendar
  let bodyHtml = '';
  for (const p of opts.paragraphs) {
    const mentionsCalendar = /calendar|invite|ics/i.test(p);
    bodyHtml += `<p style="margin:0 0 14px;color:${ink};font-size:15px;line-height:1.6;">${p.replace(/\n/g, '<br>')}</p>`;
    if (mentionsCalendar && calBtn) bodyHtml += calBtn;
  }
  if (calBtn && !bodyHtml.includes(calBtn)) bodyHtml += calBtn;

  if (opts.payNowNote) {
    bodyHtml += `<p style="margin:14px 0;color:${ink};font-size:15px;line-height:1.6;">${opts.payNowNote.replace(/\n/g, '<br>')}</p>`;
  }

  // Sections in order: studio → client/setup (with photos inside) → receipt → QR
  if (opts.studioDetails?.length) bodyHtml += sectionTable('Studio Details', opts.studioDetails, '📍');
  if (opts.clientDetails?.length) bodyHtml += sectionTable('Client Details', opts.clientDetails, '👤');

  // Setup Choices: photos first, then notes — all inside the same section
  if (opts.setupDetails?.length || opts.inlinePhotos?.length) {
    const rowsHtml = (opts.setupDetails || []).map(d =>
      `<tr><td style="padding:6px 0;color:${soft};font-size:13px;width:150px;vertical-align:top;border-bottom:1px solid ${line};">${d.label}</td>` +
      `<td style="padding:6px 0;color:${ink};font-size:13px;font-weight:600;vertical-align:top;border-bottom:1px solid ${line};">${d.value.replace(/\n/g, '<br>')}</td></tr>`
    ).join('');
    const photoHtml = opts.inlinePhotos?.length
      ? `<div style="padding:10px 0;border-bottom:1px solid ${line};"><div style="font-size:12px;color:${soft};margin-bottom:6px;">Reference photos</div><table cellpadding="0" cellspacing="0"><tbody><tr>${
          opts.inlinePhotos.map(src =>
            `<td style="padding:0 6px 0 0;"><img src="${src}" style="width:100px;height:100px;object-fit:cover;border-radius:6px;border:1.5px solid ${line};display:block;" alt="Reference photo"></td>`
          ).join('')
        }</tr></tbody></table></div>`
      : '';
    bodyHtml += `<div style="margin:20px 0 0;"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${soft};font-family:sans-serif;padding:6px 0;border-top:2px solid ${ink};">🎨 Setup Choices</div>${photoHtml}<table style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0"><tbody>${rowsHtml}</tbody></table></div>`;
  }

  if (opts.receiptDetails?.length) bodyHtml += sectionTable('Receipt', opts.receiptDetails, '🧾');

  // QR code inline at end of email (not as attachment)
  if (opts.inlineQrDataUrl) {
    bodyHtml += `<div style="margin:20px 0 0;text-align:center;padding:20px;background:${cream};border-radius:10px;border:1px solid ${line};">` +
      `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:${soft};font-family:sans-serif;margin-bottom:12px;">💳 PayNow QR Code</div>` +
      `<img src="${opts.inlineQrDataUrl}" style="width:200px;height:200px;border-radius:8px;" alt="PayNow QR">` +
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
  const rows: { label: string; value: string }[] = [];
  rows.push({ label: 'Package price', value: `$${r.total - (r.isWeekend ? r.weekendSurcharge : 0) + r.discountAmount - r.addOns.filter(a => a.qty > 0).reduce((s, a) => s + a.price * a.qty, 0)}` });
  if (r.location === 'home' && r.address) {
    rows.push({ label: 'Address', value: r.address });
  }
  rows.push({ label: r.isWeekend ? 'Weekend surcharge' : 'Surcharge', value: r.isWeekend ? `+$${r.weekendSurcharge}` : '$0' });
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

function studioRows(): { label: string; value: string }[] {
  return [
    { label: 'Name', value: STUDIO_INFO.name },
    { label: 'Address', value: STUDIO_INFO.addressLines.join('\n') },
    { label: 'Access', value: STUDIO_INFO.access },
    { label: 'Parking', value: STUDIO_INFO.parkingOk },
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

  // PayNow QR — generate as inline data URL for embedding in email, not as attachment
  let inlineQrDataUrl: string | undefined;
  let payNowNote = '';
  if (payNowQr) {
    try {
      const QRCode = (await import('qrcode')).default;
      inlineQrDataUrl = await QRCode.toDataURL(payNowQr.payload, { margin: 1, width: 280 });
      payNowNote = `Balance due: $${payNowQr.amount}\nReference: ${payNowQr.ref}\nPlease scan the QR code below with your banking app to pay via PayNow.`;
    } catch { /* silent */ }
  }

  // Fetch inline photos
  let inlinePhotos: string[] = [];
  if (referencePhotoUrls?.length) {
    inlinePhotos = await fetchInlinePhotos(referencePhotoUrls.slice(0, 5));
  }

  const attachments = icsAttachment ? [icsAttachment] : undefined;
  const att = attachments?.length ? attachments : undefined;

  // Studio details (only for studio sessions)
  const studio = receipt?.location === 'studio' ? studioRows() : undefined;

  // Client setup details (for client email — notes + photo count)
  const setupForClient: { label: string; value: string }[] = [];
  if (clientDetails?.notes) setupForClient.push({ label: 'Your notes', value: clientDetails.notes });


  // Client details for photographer
  const clientInfoRows: { label: string; value: string }[] = [];
  if (clientDetails) {
    clientInfoRows.push({ label: 'Name', value: clientDetails.name });
    clientInfoRows.push({ label: 'Email', value: clientDetails.email });
    clientInfoRows.push({ label: 'Phone', value: clientDetails.phone });
    if (clientDetails.address) clientInfoRows.push({ label: 'Address', value: clientDetails.address });
    if (clientDetails.notes) clientInfoRows.push({ label: 'Notes', value: clientDetails.notes });
  }

  // Client email HTML
  const clientParagraphs = pair.client.emailBody.split('\n\n').filter(Boolean);
  const clientHtml = buildHtml({
    subject: pair.client.emailSubject,
    paragraphs: clientParagraphs,
    calendarUrl: gcalUrl || undefined,
    studioDetails: studio,
    setupDetails: setupForClient.length ? setupForClient : undefined,
    receiptDetails: receipt ? receiptRows(receipt) : undefined,
    inlinePhotos,
    inlineQrDataUrl,
    payNowNote: payNowNote || undefined,
  });

  // Photographer email HTML
  const photographerParagraphs = pair.photographer.emailBody.split('\n\n').filter(Boolean);
  const photographerHtml = buildHtml({
    subject: pair.photographer.emailSubject,
    paragraphs: photographerParagraphs,
    calendarUrl: gcalUrl || undefined,
    studioDetails: studio,
    clientDetails: clientInfoRows.length ? clientInfoRows : undefined,
    receiptDetails: receipt ? receiptRows(receipt) : undefined,
    inlinePhotos,
    inlineQrDataUrl,
    payNowNote: payNowNote || undefined,
  });

  const sends: Promise<void>[] = [];
  if (pair.client.emailSubject && clientEmail) {
    sends.push(sendEmail(clientEmail, pair.client.emailSubject.replace('\n', ' — '), pair.client.emailBody, att, clientHtml));
  }
  if (clientPhoneE164) sends.push(sendWhatsApp(clientPhoneE164, pair.client.whatsappBody));
  if (pair.photographer.emailSubject && photographerEmail) {
    // Photographer subject always uses YYYYMMDD ClientName PhotoshootType format
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
