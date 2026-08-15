// Ported directly from the prototype's confirmDeposit / redeemBundleSession /
// confirmBalance / sendReminder / activateBundle / generateInvoice message
// construction — this is the exact, business-owner-approved copy (multi-
// paragraph format, Subject lines, prep links, receipt language, bundle
// milestone logic). Don't rewrite this wording; port it as-is.
//
// Each function returns content for BOTH channels. Only sendEmail() is
// wired up right now (email-only launch) — sendWhatsApp() is a safe no-op
// stub. When the Twilio/WhatsApp application clears, wiring it up means
// implementing whatsapp.ts's stub — nothing here needs to change.

import { fmtDatePretty, fmtTime12 } from './format';
import { studioAddressText } from './studio';
import { prepLinkFor, closingLineFor, sessionById, BUNDLE_SESSION_BALANCES } from './constants';

export type NotifyBooking = {
  ref: string;
  sessionTypeId: string;
  sessionLabel: string;
  location: string; // 'studio' | 'home'
  date: string;
  startTime: string;
  clientName: string;
  bundleSessionNumber?: number | null;
};

type Message = { emailSubject: string; emailBody: string; whatsappBody: string };
export type NotificationPair = { client: Message; photographer: Message };

function firstNameOf(fullName: string): string {
  return fullName.split(' ')[0];
}

/** Session 1 of a bundle, or any standalone package's deposit confirmation.
 *  Deliberately says nothing about bundle sessions 2/3 or activation —
 *  that only belongs in the balance-confirmation message (see below). */
export function bookingConfirmedNotification(b: NotifyBooking, businessName: string): NotificationPair {
  const firstName = firstNameOf(b.clientName);
  const whenStr = `${fmtDatePretty(b.date)} at ${fmtTime12(b.startTime)}`;
  const prep = prepLinkFor(b);
  const studioLine = b.location === 'studio' ? `📍 Studio: ${studioAddressText()}` : '';

  const waParts = [
    `Hi ${firstName}!\nYour ${b.sessionLabel} on ${whenStr} is confirmed.\nSee you then!`,
    studioLine,
    prep ? `For ${prep.note}: ${prep.url}` : '',
    `Your itemised receipt has been emailed to you.`,
    businessName,
  ].filter(Boolean);

  // Email body — location is NOT here since it appears in the receipt table below.
  // Calendar button is injected by notify.ts right after the prep link paragraph.
  const emailParts = [
    `Hi ${firstName}!`,
    `Your ${b.sessionLabel} on ${whenStr} is confirmed. See you then!`,
    prep ? `For ${prep.note}, please visit ${prep.url}\n\nPlease also add this session to your calendar — the invite (.ics) is attached.` : `Please add this session to your calendar — the invite (.ics) is attached.`,
    closingLineFor(b),
  ].filter(Boolean);

  return {
    client: {
      emailSubject: `Booking Confirmed\n${b.sessionLabel} — ${fmtDatePretty(b.date)}, ${fmtTime12(b.startTime)}`,
      emailBody: emailParts.join('\n\n'),
      whatsappBody: waParts.join('\n\n'),
    },
    photographer: {
      emailSubject: `Booking confirmed — ${b.sessionLabel}`,
      emailBody: `Deposit received. Booking confirmed.\n\nClient: ${b.clientName}\nSession: ${b.sessionLabel}\nWhen: ${whenStr}\nLocation: ${b.location === 'home' ? `Home — ${b.address || 'see booking'}` : 'Studio'}\nRef: ${b.ref}`,
      whatsappBody: `Confirmed: ${b.sessionLabel} with ${b.clientName}\n${whenStr}\nRef: ${b.ref}`,
    },
  };
}

/** Bundle session 2 or 3 being redeemed (sessionIndex is 0-based: 0 = session 2). */
export function bundleSessionConfirmedNotification(
  b: NotifyBooking,
  sessionIndex: number,
  balanceDue: number,
  businessName: string
): NotificationPair {
  const firstName = firstNameOf(b.clientName);
  const whenStr = `${fmtDatePretty(b.date)} at ${fmtTime12(b.startTime)}`;
  const sessionNum = sessionIndex + 1;
  const prep = prepLinkFor(b);

  const waParts = [
    `Hi ${firstName}!\nSession ${sessionNum} of 3 of your First Year Bundle is booked for ${whenStr}.\nBalance of $${balanceDue} due after the session.`,
    prep ? `For ${prep.note}: ${prep.url}` : '',
    businessName,
  ].filter(Boolean);

  // Same clean format as bookingConfirmedNotification — no studio line in body,
  // no repetitive receipt/calendar mention, sections handled by notify.ts
  const emailParts = [
    `Hi ${firstName}!`,
    `Session ${sessionNum} of 3 of your First Year Bundle is confirmed for ${whenStr}. Balance of $${balanceDue} is due after the session.`,
    prep ? `For ${prep.note}, please visit ${prep.url}\n\nPlease also add this session to your calendar — the invite (.ics) is attached.` : `Please add this session to your calendar — the invite (.ics) is attached.`,
    closingLineFor(b),
  ].filter(Boolean);

  return {
    client: {
      emailSubject: `Booking Confirmed\nFirst Year Bundle — Session ${sessionNum} of 3 — ${fmtDatePretty(b.date)}, ${fmtTime12(b.startTime)}`,
      emailBody: emailParts.join('\n\n'),
      whatsappBody: waParts.join('\n\n'),
    },
    photographer: {
      emailSubject: `Bundle session ${sessionNum} of 3 confirmed — ${b.clientName}`,
      emailBody: `Bundle session ${sessionNum} of 3 confirmed.\n\nClient: ${b.clientName}\nWhen: ${whenStr}\nBalance due after session: $${balanceDue}\nRef: ${b.ref}`,
      whatsappBody: `Bundle session ${sessionNum}/3 confirmed: ${b.clientName}, ${whenStr}, ref ${b.ref}`,
    },
  };
}

/** Balance confirmed — the real trigger for unlocking the next bundle
 *  credit and prompting the client to schedule their next milestone. */
export function balanceReceivedNotification(
  b: NotifyBooking,
  businessName: string,
  bundleContext?: { nextSessionNumber: number } | { completed: true }
): NotificationPair {
  const firstName = firstNameOf(b.clientName);
  let bundleNote = '';
  if (bundleContext) {
    if ('completed' in bundleContext) {
      bundleNote = `That completes all 3 sessions of your First Year Bundle — thank you for letting us capture this whole first year with you and your family!`;
    } else {
      const milestone = sessionById('bundle')!.milestones![bundleContext.nextSessionNumber - 1];
      bundleNote = `Ready for your next milestone? Your ${milestone.label} session (best around ${milestone.age}) is now ready to schedule, whenever suits you — just head to "Look up my booking," no extra deposit needed.`;
    }
  }

  const waParts = [`Hi ${firstName}!\nYour balance is received — you're all settled. Thank you so much!`, bundleNote, businessName].filter(Boolean);
  const emailParts = [
    `Hi ${firstName}!`,
    `Your balance is received — ${b.sessionLabel} is now fully paid. Thank you so much!`,
    bundleNote,
    businessName,
  ].filter(Boolean);

  return {
    client: {
      emailSubject: `Payment Received \u2014 ${b.sessionLabel}`,
      emailBody: emailParts.join('\n\n'),
      whatsappBody: waParts.join('\n\n'),
    },
    photographer: {
      emailSubject: `Balance payment confirmed`,
      emailBody: `Client: ${b.clientName}\nSession: ${b.sessionLabel}\nRef: ${b.ref}`,
      whatsappBody: `Balance received from ${b.clientName} — ${b.sessionLabel}, ref ${b.ref}.`,
    },
  };
}

export type ReminderThreshold = { key: '3day' | '1day' | '2hr'; hours: number; label: string };
export const REMINDER_THRESHOLDS: ReminderThreshold[] = [
  { key: '3day', hours: 72, label: 'in 3 days' },
  { key: '1day', hours: 24, label: 'tomorrow' },
  { key: '2hr', hours: 2, label: 'in about 2 hours' },
];

export function reminderNotification(b: NotifyBooking, threshold: ReminderThreshold, businessName: string): NotificationPair {
  const firstName = firstNameOf(b.clientName);
  const whenStr = `${fmtDatePretty(b.date)} at ${fmtTime12(b.startTime)}`;
  const studioLine = b.location === 'studio' ? `\ud83d\udccd Studio location: ${studioAddressText()}` : '';
  const prep = prepLinkFor(b);

  let intro: string;
  if (threshold.key === '3day') intro = `Just a friendly reminder — your ${b.sessionLabel} is coming up in 3 days, on ${whenStr}.`;
  else if (threshold.key === '1day') intro = `Your ${b.sessionLabel} is tomorrow, ${whenStr}!`;
  else intro = `Quick reminder — your ${b.sessionLabel} starts in about 2 hours, at ${fmtTime12(b.startTime)} today.`;

  const prepLine = threshold.key === '3day' && prep ? `Haven't checked our prep guide yet? ${prep.url}` : '';

  const waParts = [`Hi ${firstName}!\n${intro}`, studioLine, prepLine, `See you soon!`, businessName].filter(Boolean);
  const emailParts = [`Hi ${firstName}!`, intro, studioLine, prepLine, `See you soon!`, businessName].filter(Boolean);

  return {
    client: {
      emailSubject: `Reminder \u2014 ${b.sessionLabel} ${threshold.label}`,
      emailBody: emailParts.join('\n\n'),
      whatsappBody: waParts.join('\n\n'),
    },
    photographer: {
      emailSubject: `Upcoming session reminder`,
      emailBody: `Session with ${b.clientName} is ${threshold.label} — ${whenStr}. Ref ${b.ref}.`,
      whatsappBody: `Reminder: session with ${b.clientName} is ${threshold.label} — ${whenStr}. Ref ${b.ref}.`,
    },
  };
}

/** Manual fallback only — bundle activation now normally happens
 *  automatically inside balanceReceivedNotification's flow. */
export function bundleActivatedNotification(bundleRef: string, clientName: string, businessName: string): NotificationPair {
  const firstName = firstNameOf(clientName);
  return {
    client: {
      emailSubject: `Your First Year Bundle is active`,
      emailBody: `Your First Year Bundle is fully active — sessions 2 and 3 are ready to redeem whenever you're ready, no extra deposit needed. Reference ${bundleRef}.`,
      whatsappBody: `Hi ${firstName}! Sessions 2 and 3 of your First Year Bundle are now unlocked — head to "Look up my booking" with your phone number whenever you're ready to pick a date. — ${businessName}`,
    },
    photographer: {
      emailSubject: `Bundle activated`,
      emailBody: `Bundle activated — ${clientName}, ref ${bundleRef}.`,
      whatsappBody: `Bundle activated for ${clientName} — ref ${bundleRef}. Sessions 2 & 3 now redeemable.`,
    },
  };
}

export function invoiceNotification(
  b: NotifyBooking,
  due: number,
  invoiceRef: string,
  extraLineItems: { description: string; amount: number }[]
): NotificationPair {
  const firstName = firstNameOf(b.clientName);
  const whenStr = `${fmtDatePretty(b.date)} at ${fmtTime12(b.startTime)}`;
  const extraLines = extraLineItems.length
    ? extraLineItems.map((i) => `${i.description}: $${i.amount}`).join('\n') + '\n'
    : '';

  return {
    client: {
      emailSubject: `Invoice for Balance Payment\n${b.sessionLabel} — ${fmtDatePretty(b.date)}`,
      emailBody: [
        `Hi ${firstName}!`,
        `Thank you for your ${b.sessionLabel} on ${whenStr}. Please find your balance payment invoice below.`,
        `${extraLines}Balance due: $${due}\nRef: ${invoiceRef}`,
        `Kindly make payment via PayNow — a QR code is attached for your convenience. Please use the reference number above so we can match your payment promptly.`,
        `Do reach out if you have any questions. Thank you!`,
      ].join('\n\n'),
      whatsappBody: `Hi ${firstName}! Your balance invoice for ${b.sessionLabel} on ${whenStr} is ready. Amount due: $${due}, ref ${invoiceRef}. Please scan the attached PayNow QR to settle — thank you!`,
    },
    photographer: {
      emailSubject: `Invoice for balance payment sent — ${b.clientName}`,
      emailBody: `Invoice sent to ${b.clientName}.\n\nSession: ${b.sessionLabel}\nDate: ${whenStr}\nRef: ${invoiceRef}\nAmount due: $${due}`,
      whatsappBody: `Invoice sent to ${b.clientName} — ${b.sessionLabel}, ref ${invoiceRef}, $${due} due.`,
    },
  };
}

/** Given a booking's bundleSessionNumber (or null for a standalone booking),
 *  determines what balanceReceivedNotification's bundle context should be. */
export function bundleContextAfterBalance(bundleSessionNumber: number | null | undefined):
  | { nextSessionNumber: number }
  | { completed: true }
  | undefined {
  if (!bundleSessionNumber) return undefined;
  const nextNum = bundleSessionNumber + 1;
  return nextNum <= 3 ? { nextSessionNumber: nextNum } : { completed: true };
}

/** Sent to photographer immediately when a new booking request comes in
 *  (before deposit is confirmed). Client gets nothing yet — they already
 *  see the PayNow QR on screen. */
export function newBookingRequestNotification(
  b: NotifyBooking & { clientEmail: string; clientPhone: string; address?: string; notes?: string },
  businessName: string
): NotificationPair {
  const whenStr = `${fmtDatePretty(b.date)} at ${fmtTime12(b.startTime)}`;
  const locationLine = b.location === 'home'
    ? `Location: Client's home — ${b.address || 'see booking'}`
    : `Location: Studio`;
  const notesLine = b.notes ? `Notes: ${b.notes}` : '';

  const body = [
    `New booking request — awaiting deposit.`,
    `Client: ${b.clientName}`,
    `Email: ${b.clientEmail}`,
    `Phone: ${b.clientPhone}`,
    `Session: ${b.sessionLabel}`,
    `When: ${whenStr}`,
    locationLine,
    notesLine,
    `Ref: ${b.ref}`,
  ].filter(Boolean).join('\n');

  return {
    client: {
      emailSubject: '',
      emailBody: '',
      whatsappBody: '',
    },
    photographer: {
      emailSubject: `New booking request — ${b.sessionLabel} on ${fmtDatePretty(b.date)}`,
      emailBody: body,
      whatsappBody: body,
    },
  };
}
