'use client';

import { useEffect, useState } from 'react';

type Code = { id: string; code: string; description: string; amount: number };

export default function AdminDiscountsPage() {
  const [codes, setCodes] = useState<Code[]>([]);
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/admin/discounts');
    const data = await res.json();
    setCodes(data.codes || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function addCode() {
    setError(null);
    if (!code.trim() || !amount) return;
    const res = await fetch('/api/admin/discounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, description, amount: Number(amount) }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setCode('');
    setDescription('');
    setAmount('');
    load();
  }

  async function removeCode(id: string) {
    await fetch(`/api/admin/discounts/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>No codes are visible to clients until you create one and share it directly.</p>
      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0 }}><label>Code</label><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="FRIEND50" style={{ width: 140 }} /></div>
          <div className="field" style={{ margin: 0 }}><label>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Repeat client" /></div>
          <div className="field" style={{ margin: 0 }}><label>Amount ($)</label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 90 }} /></div>
          <button className="btn btn-primary" onClick={addCode}>Add code</button>
        </div>
        {error && <div className="error-text">{error}</div>}
      </div>

      {codes.map((c) => (
        <div key={c.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
          <div>
            <b style={{ fontFamily: 'monospace' }}>{c.code}</b> — ${c.amount} off {c.description && <span style={{ color: 'var(--ink-soft)' }}>({c.description})</span>}
          </div>
          <button className="btn btn-ghost" onClick={() => removeCode(c.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}
