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
  calendarEvent?: IcsEvent
): Promise<void> {
  // Build ICS attachment and Google Calendar link when a calendar event is provided
  let icsAttachment: { filename: string; content: string } | undefined;
  let gcalLink = '';

  if (calendarEvent) {
    const icsContent = generateIcs(calendarEvent);
    icsAttachment = { filename: 'booking.ics', content: icsToBase64(icsContent) };

    const gcalDate = calendarEvent.dateISO.replace(/-/g, '');
    const startT = calendarEvent.startTime.replace(':', '') + '00';
    const endT = calendarEvent.endTime.replace(':', '') + '00';
    gcalLink = `\n\nAdd to Google Calendar: https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calendarEvent.summary)}&dates=${gcalDate}T${startT}/${gcalDate}T${endT}&location=${encodeURIComponent(calendarEvent.location)}&details=${encodeURIComponent(calendarEvent.description)}`;
  }

  // Append the calendar link to both client and photographer email bodies
  const clientBody = pair.client.emailBody + gcalLink;
  const photographerBody = pair.photographer.emailBody + gcalLink;

  // Both client and photographer get the .ics attachment
  const attachments = icsAttachment ? [icsAttachment] : undefined;

  const results = await Promise.allSettled([
    sendEmail(clientEmail, pair.client.emailSubject, clientBody, attachments),
    sendWhatsApp(clientPhoneE164, pair.client.whatsappBody),
    sendEmail(photographerEmail, pair.photographer.emailSubject, photographerBody, attachments),
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
