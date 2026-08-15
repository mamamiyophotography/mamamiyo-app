'use client';

import { useEffect, useState } from 'react';

type Bundle = {
  id: string; ref: string; clientName: string; clientEmail: string;
  depositStatus: string; activated: boolean; creditsTotal: number; redeemedCount: number;
};

export default function AdminBundlesPage() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/admin/bundles');
    const data = await res.json();
    setBundles(data.bundles || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function activate(id: string) {
    setBusyId(id);
    await fetch(`/api/admin/bundles/${id}/activate`, { method: 'POST' });
    setBusyId(null);
    load();
  }

  function statusLabel(bd: Bundle) {
    if (bd.depositStatus !== 'paid') return 'Awaiting session 1 deposit';
    if (!bd.activated) return 'Deposit paid — not activated';
    return 'Active';
  }

  return (
    <div>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>
        Sessions 2 &amp; 3 unlock automatically once session 1&apos;s balance is confirmed (see Bookings). The button below is a manual fallback only.
      </p>
      {bundles.length === 0 && <div className="notice">No bundles yet.</div>}
      {bundles.map((bd) => (
        <div key={bd.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{bd.clientName}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{bd.clientEmail}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 4 }}>{bd.ref}</div>
              <div style={{ fontSize: 12.5, marginTop: 6 }}>{statusLabel(bd)} · {bd.redeemedCount}/3 sessions used</div>
            </div>
            {bd.depositStatus === 'paid' && !bd.activated && (
              <button className="btn btn-ghost" disabled={busyId === bd.id} onClick={() => activate(bd.id)}>Activate manually</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
