import { sendEmail } from './email';
import { sendWhatsApp } from './whatsapp';
import { NotificationPair } from './notifications';
import { generateIcs, icsToBase64, IcsEvent } from './ics';

export async function dispatchNotification(
  pair: NotificationPair,
  clientEmail: string,
  clientPhoneE164: string,
  photographerEmail: string,
  photographerPhoneE164: string,
  calendarEvent?: IcsEvent  // optional — only on booking confirmation
): Promise<void> {
  // Attach .ics to the client's confirmation email if provided
  const clientAttachments = calendarEvent
    ? [{ filename: 'booking.ics', content: icsToBase64(generateIcs(calendarEvent)) }]
    : undefined;

  const results = await Promise.allSettled([
    sendEmail(clientEmail, pair.client.emailSubject, pair.client.emailBody, clientAttachments),
    sendWhatsApp(clientPhoneE164, pair.client.whatsappBody),
    sendEmail(photographerEmail, pair.photographer.emailSubject, pair.photographer.emailBody),
    sendWhatsApp(photographerPhoneE164, pair.photographer.whatsappBody),
  ]);

  const emailFailures = [results[0], results[2]].filter((r) => r.status === 'rejected');
  if (emailFailures.length) {
    const messages = emailFailures.map((r) => (r as PromiseRejectedResult).reason?.message || 'unknown error').join('; ');
    throw new Error(`Notification email delivery failed: ${messages}`);
  }
}
