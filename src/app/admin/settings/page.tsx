'use client';

import { useEffect, useState } from 'react';
import { fmtDatePretty } from '@/lib/format';

type Settings = {
  businessName: string; paynowMobile: string; depositAmount: number; weekendSurcharge: number;
  bufferStudioMin: number; bufferHomeMin: number; minNoticeHours: number; maxBookingMonths: number; holdWindowMinutes: number;
};
type Holiday = { id: string; date: string; label: string };

const FIELDS: { key: keyof Settings; label: string }[] = [
  { key: 'businessName', label: 'Business name' },
  { key: 'paynowMobile', label: 'PayNow mobile (8-digit SG number)' },
  { key: 'depositAmount', label: 'Deposit amount ($)' },
  { key: 'weekendSurcharge', label: 'Weekend / PH surcharge ($)' },
  { key: 'bufferStudioMin', label: 'Studio buffer (min)' },
  { key: 'bufferHomeMin', label: 'Home buffer (min)' },
  { key: 'minNoticeHours', label: 'Minimum notice (hrs)' },
  { key: 'maxBookingMonths', label: 'Max booking window (months)' },
  { key: 'holdWindowMinutes', label: 'Payment hold window (min)' },
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [phDate, setPhDate] = useState('');
  const [phLabel, setPhLabel] = useState('');

  async function loadSettings() {
    const res = await fetch('/api/admin/settings');
    const data = await res.json();
    setSettings(data.settings);
  }
  async function loadHolidays() {
    const res = await fetch('/api/admin/public-holidays');
    const data = await res.json();
    setHolidays(data.holidays || []);
  }

  useEffect(() => {
    loadSettings();
    loadHolidays();
  }, []);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    setSaved(false);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
  }

  async function addHoliday() {
    if (!phDate) return;
    await fetch('/api/admin/public-holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: phDate, label: phLabel || 'Public holiday' }),
    });
    setPhDate('');
    setPhLabel('');
    loadHolidays();
  }
  async function removeHoliday(id: string) {
    await fetch(`/api/admin/public-holidays/${id}`, { method: 'DELETE' });
    loadHolidays();
  }

  if (!settings) return <div style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      <div className="card" style={{ maxWidth: 480 }}>
        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label>{f.label}</label>
            <input
              type={typeof settings[f.key] === 'number' ? 'number' : 'text'}
              value={settings[f.key]}
              onChange={(e) => update(f.key, (typeof settings[f.key] === 'number' ? Number(e.target.value) : e.target.value) as Settings[typeof f.key])}
            />
          </div>
        ))}
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save settings'}</button>
        {saved && <span style={{ marginLeft: 10, fontSize: 12.5, color: 'var(--sage)' }}>Saved</span>}
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Public holidays (also surcharged)</div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 12 }}>Any date here gets the weekend/PH surcharge, same as a Saturday or Sunday.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="date" value={phDate} onChange={(e) => setPhDate(e.target.value)} style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
          <input placeholder="Label (optional)" value={phLabel} onChange={(e) => setPhLabel(e.target.value)} style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
          <button className="btn btn-ghost" onClick={addHoliday}>Add date</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {holidays.filter((h) => h.date >= new Date().toISOString().slice(0, 10)).map((h) => (
            <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px dashed var(--line)', fontSize: 12.5 }}>
              <span>{fmtDatePretty(h.date)} — <span style={{ color: 'var(--ink-soft)' }}>{h.label}</span></span>
              <button className="btn btn-ghost" style={{ padding: '2px 10px' }} onClick={() => removeHoliday(h.id)}>Remove</button>
            </div>
          ))}
          {holidays.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>No upcoming public holidays listed.</div>}
        </div>
      </div>
    </div>
  );
}
