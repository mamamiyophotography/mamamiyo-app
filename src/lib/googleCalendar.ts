import { createHash } from 'node:crypto';

const TIME_ZONE = 'Asia/Singapore';
const STUDIO_ADDRESS = 'K-Lodge, 32 Lorong K Telok Kurau #01-01, Singapore 425641';

type CalendarBooking = {
  id: string; ref: string; clientName: string; clientEmail: string; clientPhone: string;
  sessionLabel: string; location: string; address: string; date: string; startTime: string;
  endTime: string; notes: string; balanceDue: number; googleCalendarEventId?: string | null;
};

export function googleCalendarConfigured() {
  return Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET
    && process.env.GOOGLE_CALENDAR_REFRESH_TOKEN && process.env.GOOGLE_CALENDAR_ID);
}

async function accessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '',
      refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Google Calendar authorization failed.');
  return data.access_token as string;
}

function locationLabel(location: string, address: string) {
  if (location === 'studio') return STUDIO_ADDRESS;
  const labels: Record<string, string> = { home: 'Client Home', confinement: 'Confinement Centre', other: 'Other Photoshoot Location' };
  return [labels[location] || location, address].filter(Boolean).join(' — ');
}

function eventBody(booking: CalendarBooking) {
  return {
    summary: `${booking.clientName} — ${booking.sessionLabel}`,
    location: locationLabel(booking.location, booking.address),
    description: [
      `Booking: ${booking.ref}`, `Client: ${booking.clientName}`, `Phone: ${booking.clientPhone}`,
      `Email: ${booking.clientEmail}`, `Balance due: $${booking.balanceDue}`,
      booking.notes ? `Notes: ${booking.notes}` : '',
    ].filter(Boolean).join('\n'),
    start: { dateTime: `${booking.date}T${booking.startTime}:00+08:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${booking.date}T${booking.endTime}:00+08:00`, timeZone: TIME_ZONE },
    reminders: { useDefault: true },
  };
}

function stableEventId(bookingId: string) {
  return `mmy${createHash('sha256').update(bookingId).digest('hex').slice(0, 40)}`;
}

export async function syncBookingToGoogleCalendar(db: any, booking: CalendarBooking) {
  if (!googleCalendarConfigured()) return { configured: false as const, synced: false as const, message: 'Google Calendar is not connected yet.' };
  const token = await accessToken();
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || 'primary');
  const eventId = booking.googleCalendarEventId || stableEventId(booking.id);
  const base = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const update = await fetch(`${base}/${encodeURIComponent(eventId)}?sendUpdates=none`, {
    method: 'PUT', headers, body: JSON.stringify(eventBody(booking)),
  });
  let response = update;
  if (update.status === 404) {
    response = await fetch(`${base}?sendUpdates=none`, {
      method: 'POST', headers, body: JSON.stringify({ id: eventId, ...eventBody(booking) }),
    });
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Unable to update Google Calendar.');
  const updated = await db.booking.update({
    where: { id: booking.id },
    data: { googleCalendarEventId: data.id || eventId, googleCalendarEventUrl: data.htmlLink || null, googleCalendarSyncedAt: new Date() },
  });
  return { configured: true as const, synced: true as const, eventUrl: data.htmlLink as string | undefined, booking: updated };
}
