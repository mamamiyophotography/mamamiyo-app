'use client';

import { useEffect, useState } from 'react';
import { fmtDatePretty } from '@/lib/format';

type Block = { id: string; date: string; startTime: string; endTime: string; location: string };

// Half-hour slots from 8am to 8pm
const TIME_OPTIONS: { label: string; value: string }[] = [];
for (let h = 8; h <= 20; h++) {
  for (const m of [0, 30]) {
    if (h === 20 && m === 30) break;
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ampm = h < 12 ? 'am' : h === 12 ? 'pm' : 'pm';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    TIME_OPTIONS.push({ label: `${h12}:${mm}${ampm}`, value: `${hh}:${mm}` });
  }
}

export default function AdminAvailabilityPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch('/api/admin/availability');
    const data = await res.json();
    setBlocks((data.blocks || []).sort((a: Block, b: Block) => a.date.localeCompare(b.date)));
  }

  useEffect(() => { load(); }, []);

  async function addBlock() {
    if (!date || startTime >= endTime) return;
    setLoading(true);
    await fetch('/api/admin/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, startTime, endTime, location: 'studio' }),
    });
    setDate('');
    setLoading(false);
    load();
  }

  async function removeBlock(id: string) {
    await fetch(`/api/admin/availability/${id}`, { method: 'DELETE' });
    load();
  }

  const endOptions = TIME_OPTIONS.filter(t => t.value > startTime);

  return (
    <div>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>
        Add a date and time window — clients will only see slots that fit within it.
        A full day would be 8:00am to 8:00pm.
      </p>
      <div className="card" style={{ maxWidth: 480 }}>
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>From</label>
            <select value={startTime} onChange={(e) => { setStartTime(e.target.value); if (e.target.value >= endTime) setEndTime(TIME_OPTIONS.find(t => t.value > e.target.value)?.value || '17:00'); }}>
              {TIME_OPTIONS.slice(0, -1).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>To</label>
            <select value={endTime} onChange={(e) => setEndTime(e.target.value)}>
              {endOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        {startTime >= endTime && <div className="error-text">End time must be after start time</div>}
        <button
          className="btn btn-primary"
          style={{ marginTop: 8 }}
          disabled={loading || !date || startTime >= endTime}
          onClick={addBlock}
        >
          Add availability
        </button>
      </div>

      {blocks.length === 0 && <div className="notice" style={{ maxWidth: 480 }}>No availability added yet — clients won't see any bookable dates until you add some.</div>}

      {blocks.map((b) => (
        <div key={b.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', maxWidth: 480 }}>
          <div style={{ fontSize: 13.5 }}>
            <b>{fmtDatePretty(b.date)}</b>
            <span style={{ color: 'var(--ink-soft)', marginLeft: 10 }}>
              {TIME_OPTIONS.find(t => t.value === b.startTime)?.label || b.startTime}
              {' — '}
              {TIME_OPTIONS.find(t => t.value === b.endTime)?.label || b.endTime}
            </span>
          </div>
          <button className="btn btn-ghost" onClick={() => removeBlock(b.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}
