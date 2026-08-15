// Ported from the prototype's generateCandidateSlots / isSurchargeDate.
// Written as pure functions (data passed in, not fetched here) so this
// stays framework-agnostic — the API route calling this is responsible for
// pulling AvailabilityBlock/Booking rows from Prisma and passing them in.

import { SessionType } from './constants';

export type AvailabilityBlock = { date: string; startTime: string; endTime: string; location: string };
export type ExistingBooking = { date: string; startTime: string; endTime: string; status: string; holdExpiresAt?: Date | string | null };
export type PublicHoliday = { date: string };
export type Settings = {
  bufferStudioMin: number;
  bufferHomeMin: number;
  minNoticeHours: number;
  maxBookingMonths: number;
};

export type CandidateSlot = { date: string; startTime: string; endTime: string; isWeekend: boolean };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(mins: number): string {
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
}
function fmtDateISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function bufferFor(sessionType: SessionType, settings: Settings): number {
  return sessionType.location === 'home' ? settings.bufferHomeMin : settings.bufferStudioMin;
}

/** A date is a surcharge date if it's a Saturday/Sunday OR explicitly listed
 *  as a public holiday — this is what drives the $50 weekend/PH surcharge. */
export function isSurchargeDate(dateStr: string, dow: number, publicHolidays: PublicHoliday[]): boolean {
  if (dow === 0 || dow === 6) return true;
  return publicHolidays.some((ph) => ph.date === dateStr);
}

function isRangeTaken(
  bookings: ExistingBooking[],
  dateStr: string,
  startMin: number,
  endMin: number
): boolean {
  const now = new Date();
  return bookings.some((b) => {
    if (b.status === 'cancelled') return false;
    if (b.status === 'pending' && b.holdExpiresAt && new Date(b.holdExpiresAt) < now) return false; // expired hold
    if (b.date !== dateStr) return false;
    const bs = toMinutes(b.startTime);
    const be = toMinutes(b.endTime);
    return startMin < be && bs < endMin;
  });
}

export function generateCandidateSlots(
  sessionType: SessionType,
  settings: Settings,
  availability: AvailabilityBlock[],
  existingBookings: ExistingBooking[],
  publicHolidays: PublicHoliday[]
): CandidateSlot[] {
  const dur = sessionType.durationMin;
  const buf = bufferFor(sessionType, settings);
  const step = dur + buf;
  const now = new Date();
  const earliest = new Date(now.getTime() + settings.minNoticeHours * 3600 * 1000);
  const maxDate = new Date(now);
  maxDate.setMonth(maxDate.getMonth() + settings.maxBookingMonths);

  const out: CandidateSlot[] = [];
  availability
    .filter((b) => b.location === sessionType.location)
    .forEach((block) => {
      const blockDay = new Date(block.date + 'T00:00:00');
      if (blockDay > maxDate) return;
      let cur = toMinutes(block.startTime);
      const end = toMinutes(block.endTime);
      while (cur + dur <= end) {
        const slotStart = new Date(block.date + 'T00:00:00');
        slotStart.setMinutes(slotStart.getMinutes() + cur);
        if (slotStart >= earliest && !isRangeTaken(existingBookings, block.date, cur, cur + dur)) {
          const dow = slotStart.getDay();
          out.push({
            date: block.date,
            startTime: toHHMM(cur),
            endTime: toHHMM(cur + dur),
            isWeekend: isSurchargeDate(block.date, dow, publicHolidays),
          });
        }
        cur += step;
      }
    });

  out.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  return out;
}

export { fmtDateISO };
