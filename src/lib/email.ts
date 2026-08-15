import { Resend } from 'resend';

let client: Resend | null = null;
function getClient(): Resend {
  if (!client) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set — add it to .env.');
    }
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

export type EmailAttachment = {
  filename: string;
  content: string; // base64-encoded
};

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  attachments?: EmailAttachment[],
  html?: string
): Promise<void> {
  if (process.env.DRY_RUN_NOTIFICATIONS === 'true') {
    console.log(`[DRY RUN] Email to ${to}\nSubject: ${subject}\n${body}\n`);
    return;
  }
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set — add it to .env.');
  const { error } = await getClient().emails.send({
    from,
    to,
    subject,
    text: body,
    html,
    attachments: attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });
  if (error) {
    throw new Error(`Resend failed to send to ${to}: ${error.message}`);
  }
}

/** Wraps plain text content in a clean, on-brand HTML email template.
 *  Paragraphs are separated by double newlines in the plain text body.
 *  Lines within a paragraph are separated by single newlines. */
export function buildEmailHtml(opts: {
  title: string;
  paragraphs: string[];        // main body paragraphs
  details?: { label: string; value: string }[];  // optional detail rows (session, date, etc.)
  calendarUrl?: string;        // if provided, renders an "Add to Google Calendar" button
  businessName: string;
}): string {
  const gold = '#b08d57';
  const ink = '#2e2a22';
  const soft = '#6b6152';
  const cream = '#fbf6ec';
  const line = '#e6decb';

  const detailRows = (opts.details || []).map(
    (d) => `<tr>
      <td style="padding:6px 0;color:${soft};font-size:13px;width:140px;vertical-align:top;">${d.label}</td>
      <td style="padding:6px 0;color:${ink};font-size:13px;font-weight:600;vertical-align:top;">${d.value}</td>
    </tr>`
  ).join('');

  const detailTable = detailRows ? `
    <table style="width:100%;border-collapse:collapse;margin:20px 0;background:${cream};border-radius:10px;padding:16px;" cellpadding="0" cellspacing="0">
      <tbody>${detailRows}</tbody>
    </table>` : '';

  const calButton = opts.calendarUrl ? `
    <div style="text-align:center;margin:24px 0;">
      <a href="${opts.calendarUrl}" target="_blank" style="display:inline-block;background:${gold};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;font-family:sans-serif;">
        📅 Add to Google Calendar
      </a>
    </div>` : '';

  const bodyHtml = opts.paragraphs.map((p) =>
    `<p style="margin:0 0 16px;color:${ink};font-size:15px;line-height:1.6;">${p.replace(/\n/g, '<br>')}</p>`
  ).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${line};">
        <!-- Header -->
        <tr>
          <td style="background:${ink};padding:28px 36px;text-align:center;">
            <div style="font-family:Georgia,serif;color:#fbf6ec;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-bottom:4px;">Mamamiyo Photography</div>
            <div style="font-family:Georgia,serif;color:${gold};font-size:20px;">${opts.title}</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 36px;">
            ${bodyHtml}
            ${detailTable}
            ${calButton}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px;border-top:1px solid ${line};text-align:center;">
            <div style="color:${soft};font-size:12px;font-family:sans-serif;">
              ${opts.businessName} &nbsp;·&nbsp; <a href="https://www.mamamiyo-photography.com" style="color:${gold};text-decoration:none;">mamamiyo-photography.com</a>
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
