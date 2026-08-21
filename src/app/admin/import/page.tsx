'use client';

import { useState } from 'react';
import { SESSION_TYPES } from '@/lib/constants';

type Status = 'pending' | 'confirmed' | 'pending_balance' | 'completed' | 'cancelled';

const STATUSES: { key: Status; label: string }[] = [
  { key: 'pending', label: '1. Pending deposit' },
  { key: 'confirmed', label: '2. Booking confirmed' },
  { key: 'pending_balance', label: '3. Pending balance' },
  { key: 'completed', label: '4. Photoshoot complete' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function ImportPage() {
  const [form, setForm] = useState({
    sessionTypeId: 'newborn',
    date: '',
    startTime: '09:00',
    clientName: '',
    clientEmail: '',
    phone: '',
    address: '',
    notes: '',
    status: 'completed' as Status,
    isWeekend: false,
    bundleSessionsDone: 1,
  });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const sessionType = SESSION_TYPES.find(s => s.id === form.sessionTypeId)!;

  function f(key: string, val: unknown) {
    setForm(p => ({ ...p, [key]: val }));
  }

  async function save() {
    if (!form.date || !form.clientName || !form.clientEmail || !form.phone) {
      setResult({ ok: false, message: 'Please fill in date, client name, email and phone.' });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/import-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) setResult({ ok: false, message: data.error || 'Failed' });
      else setResult({ ok: true, message: `Imported! Ref: ${data.ref}` });
    } catch (err) {
      setResult({ ok: false, message: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, marginBottom: 16 }}>
        Import existing bookings silently — <b>no emails sent</b>. For customers booked before this system.
      </p>
      <div className="card">
        <div className="field">
          <label>Package</label>
          <select value={form.sessionTypeId} onChange={e => f('sessionTypeId', e.target.value)}>
            {SESSION_TYPES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Date</label>
            <input type="date" value={form.date} onChange={e => f('date', e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Start time</label>
            <input type="time" value={form.startTime} onChange={e => f('startTime', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Client name</label>
          <input value={form.clientName} onChange={e => f('clientName', e.target.value)} placeholder="Full name" />
        </div>
        <div className="field">
          <label>Client email</label>
          <input type="email" value={form.clientEmail} onChange={e => f('clientEmail', e.target.value)} placeholder="email@example.com" />
        </div>
        <div className="field">
          <label>WhatsApp (with country code)</label>
          <input value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="+6591234567" />
        </div>
        {sessionType.location === 'home' && (
          <div className="field">
            <label>Home address</label>
            <textarea value={form.address} onChange={e => f('address', e.target.value)} placeholder="Unit, street, postal code" style={{ minHeight: 56 }} />
          </div>
        )}
        <div className="field">
          <label>Notes (baby gender, etc.)</label>
          <input value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="e.g. Baby gender: girl" />
        </div>
        <div className="field">
          <label>Weekend / PH surcharge</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {[{ v: false, l: 'No' }, { v: true, l: '+$50 yes' }].map(o => (
              <button key={String(o.v)} type="button" className={`chip ${form.isWeekend === o.v ? 'selected' : ''}`} onClick={() => f('isWeekend', o.v)}>{o.l}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={form.status} onChange={e => f('status', e.target.value)}>
            {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        {sessionType.isBundle && (
          <div className="field">
            <label>Bundle — how many sessions already done?</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {[1, 2, 3].map(n => (
                <button key={n} type="button" className={`chip ${form.bundleSessionsDone === n ? 'selected' : ''}`} onClick={() => f('bundleSessionsDone', n)}>
                  {n} done
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>
              Creates the bundle and marks sessions as completed. Client can then book remaining sessions via "Look up my booking".
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className={`notice ${result.ok ? '' : 'warn'}`} style={{ marginTop: 12 }}>
          {result.ok ? '✅ ' : '❌ '}{result.message}
        </div>
      )}

      <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={saving} onClick={save}>
        {saving ? 'Importing…' : 'Import booking (no email sent)'}
      </button>
    </div>
  );
}
