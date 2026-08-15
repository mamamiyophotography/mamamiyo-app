// Generates an RFC 5545-compliant .ics file for a booking, suitable for
// attaching to confirmation emails. Works in all major calendar apps
// (Google Calendar, Apple Calendar, Outlook).

export type IcsEvent = {
  uid: string;           // unique booking ref
  summary: string;       // e.g. "Newborn Photoshoot — Mamamiyo Photography"
  description: string;   // plain text details
  location: string;      // studio address or client address
  dateISO: string;       // YYYY-MM-DD
  startTime: string;     // HH:MM (24h)
  endTime: string;       // HH:MM (24h)
  organizerName: string;
  organizerEmail: string;
};

function icsDate(dateISO: string, time: string): string {
  // Produces YYYYMMDDTHHMMSS format (local time, no Z suffix)
  const d = dateISO.replace(/-/g, '');
  const t = time.replace(':', '') + '00';
  return `${d}T${t}`;
}

function icsEscape(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function generateIcs(event: IcsEvent): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mamamiyo Photography//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${event.uid}@mamamiyo-photography.com`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=Asia/Singapore:${icsDate(event.dateISO, event.startTime)}`,
    `DTEND;TZID=Asia/Singapore:${icsDate(event.dateISO, event.endTime)}`,
    `SUMMARY:${icsEscape(event.summary)}`,
    `DESCRIPTION:${icsEscape(event.description)}`,
    `LOCATION:${icsEscape(event.location)}`,
    `ORGANIZER;CN=${icsEscape(event.organizerName)}:mailto:${event.organizerEmail}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function icsToBase64(ics: string): string {
  return Buffer.from(ics, 'utf-8').toString('base64');
}
