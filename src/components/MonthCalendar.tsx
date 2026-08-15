'use client';

export type CandidateSlot = { date: string; startTime: string; endTime: string; isWeekend: boolean };

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function fmtDateISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function MonthCalendar({
  monthDate,
  slotsByDate,
  selectedDate,
  onNav,
  onSelectDay,
}: {
  monthDate: Date;
  slotsByDate: Record<string, CandidateSlot[]>;
  selectedDate: string | null;
  onNav: (dir: number) => void;
  onSelectDay: (iso: string) => void;
}) {
  const first = startOfMonth(monthDate);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const todayISO = fmtDateISO(new Date());
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d));

  return (
    <div style={{ maxWidth: 340 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button type="button" onClick={() => onNav(-1)} className="btn-ghost" style={{ width: 30, height: 30, borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)' }}>‹</button>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: 15 }}>{monthDate.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })}</div>
        <button type="button" onClick={() => onNav(1)} className="btn-ghost" style={{ width: 30, height: 30, borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)' }}>›</button>
      </div>
      <div className="cal-grid" style={{ marginBottom: 4 }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase' }}>{d}</div>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((c, i) => {
          if (!c) return <div key={i} className="cal-cell empty" />;
          const iso = fmtDateISO(c);
          const daySlots = slotsByDate[iso];
          const has = !!(daySlots && daySlots.length);
          const isPast = iso < todayISO;
          const disabled = !has || isPast;
          const isSurcharge = has && daySlots.some((s) => s.isWeekend);
          const sel = selectedDate === iso;
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDay(iso)}
              className={`cal-cell ${disabled ? 'disabled' : ''} ${sel ? 'selected' : ''} ${isSurcharge ? 'surcharge' : ''}`}
            >
              <span>{c.getDate()}</span>
              {has && !disabled && <span className={`cal-dot ${isSurcharge ? 'surcharge' : ''}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
export { startOfMonth, fmtDateISO };
