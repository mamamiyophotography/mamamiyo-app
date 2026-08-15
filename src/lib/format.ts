function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function fmtDatePretty(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

export function fmtTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${m ? ':' + pad2(m) : ''}${ampm}`;
}

/** YYYYMMDD format for use in email subjects and booking titles */
export function fmtDateYMD(iso: string): string {
  return iso.replace(/-/g, '');
}

/** Booking title format: YYYYMMDD ClientName PhotoshootType */
export function fmtBookingTitle(date: string, clientName: string, sessionLabel: string): string {
  return `${fmtDateYMD(date)} ${clientName} ${sessionLabel}`;
}
