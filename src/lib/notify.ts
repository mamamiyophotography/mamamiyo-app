// Fans a NotificationPair out to both parties, on whichever channels are
// actually active. Email is live now; WhatsApp is a safe no-op until the
// Twilio application clears (see whatsapp.ts) — nothing here needs to
// change when that happens, since sendWhatsApp() already has the right
// shape and just starts actually sending once it's implemented.

import { sendEmail } from './email';
import { sendWhatsApp } from './whatsapp';
import { NotificationPair } from './notifications';

export async function dispatchNotification(
  pair: NotificationPair,
  clientEmail: string,
  clientPhoneE164: string,
  photographerEmail: string,
  photographerPhoneE164: string
): Promise<void> {
  const results = await Promise.allSettled([
    sendEmail(clientEmail, pair.client.emailSubject, pair.client.emailBody),
    sendWhatsApp(clientPhoneE164, pair.client.whatsappBody),
    sendEmail(photographerEmail, pair.photographer.emailSubject, pair.photographer.emailBody),
    sendWhatsApp(photographerPhoneE164, pair.photographer.whatsappBody),
  ]);

  // Email failing is a real problem worth surfacing (it's the only live
  // channel); WhatsApp "failing" because it's not wired up yet is expected
  // and already handled inside sendWhatsApp(), so it never rejects here.
  const emailFailures = [results[0], results[2]].filter((r) => r.status === 'rejected');
  if (emailFailures.length) {
    const messages = emailFailures.map((r) => (r as PromiseRejectedResult).reason?.message || 'unknown error').join('; ');
    throw new Error(`Notification email delivery failed: ${messages}`);
  }
}
