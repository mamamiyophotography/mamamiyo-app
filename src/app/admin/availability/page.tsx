'use client';

import { useEffect, useState } from 'react';
import { fmtDatePretty } from '@/lib/format';

type Block = { id: string; date: string; startTime: string; endTime: string; location: string };

export default function AdminAvailabilityPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('studio');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('13:00');
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch('/api/admin/availability');
    const data = await res.json();
    setBlocks((data.blocks || []).sort((a: Block, b: Block) => a.date.localeCompare(b.date)));
  }

  useEffect(() => {
    load();
  }, []);

  async function addBlock() {
    if (!date) return;
    setLoading(true);
    await fetch('/api/admin/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, startTime, endTime, location }),
    });
    setDate('');
    setLoading(false);
    load();
  }

  async function removeBlock(id: string) {
    await fetch(`/api/admin/availability/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>Nothing is bookable until you open it up — clients only see slots that fit within a block below.</p>
      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0 }}><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}>
            <label>Location</label>
            <select value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="studio">Studio</option>
              <option value="home">Home</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}><label>Start</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}><label>End</label><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
          <button className="btn btn-primary" disabled={loading || !date} onClick={addBlock}>Add block</button>
        </div>
      </div>

      {blocks.map((b) => (
        <div key={b.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, background: b.location === 'home' ? 'var(--blush)' : 'var(--gold-pale)', padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', marginRight: 8 }}>{b.location}</span>
            {fmtDatePretty(b.date)} — {b.startTime} to {b.endTime}
          </div>
          <button className="btn btn-ghost" onClick={() => removeBlock(b.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}
