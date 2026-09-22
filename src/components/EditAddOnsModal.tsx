'use client';

import { useMemo, useState } from 'react';
import { ADDONS, SESSION_TYPES } from '@/lib/constants';

type AddOnBooking = {
  id: string; sessionTypeId: string; addOns: Record<string, number>;
  total: number; balanceDue: number; extraLineItems: { amount: number }[];
  depositAmount: number; version: number; invoiceRef: string | null;
};

export default function EditAddOnsModal({ booking, onClose, onSaved }: {
  booking: AddOnBooking;
  onClose: () => void;
  onSaved: (invoiceNeedsRegeneration: boolean) => void | Promise<void>;
}) {
  const session = SESSION_TYPES.find((item) => item.id === booking.sessionTypeId);
  const [values, setValues] = useState<Record<string, number>>({ ...booking.addOns });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const oldAddOnTotal = useMemo(() => Object.entries(booking.addOns || {})
    .reduce((sum, [id, qty]) => sum + (ADDONS[id]?.price || 0) * qty, 0), [booking.addOns]);
  const newAddOnTotal = useMemo(() => Object.entries(values)
    .reduce((sum, [id, qty]) => sum + (ADDONS[id]?.price || 0) * qty, 0), [values]);
  const difference = newAddOnTotal - oldAddOnTotal;
  const extraTotal = booking.extraLineItems.reduce((sum, item) => sum + item.amount, 0);

  function change(id: string, next: number) {
    setValues((current) => {
      const updated = { ...current };
      if (next <= 0) delete updated[id]; else updated[id] = Math.min(20, next);
      return updated;
    });
  }

  async function save() {
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/admin/bookings/${booking.id}/update-addons`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addOns: values, version: booking.version }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save add-ons.');
      await onSaved(Boolean(data.invoiceNeedsRegeneration));
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  if (!session) return null;
  return <div className="modal-backdrop" role="presentation">
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-addons-title" style={{ maxWidth: 580 }}>
      <h2 id="edit-addons-title">Edit Add-ons</h2>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Changes update the final bill. The package, session details and paid deposit stay unchanged.</p>
      <div style={{ display: 'grid', gap: 7, margin: '18px 0' }}>
        {session.addOns.map((id) => {
          const item = ADDONS[id]; const quantity = values[id] || 0;
          return <div key={id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <div><strong style={{ fontSize: 13.5, whiteSpace: 'pre-line' }}>{item.name}</strong><div style={{ color: 'var(--ink-faint)', fontSize: 12 }}>${item.price} each</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <button className="btn btn-ghost" type="button" onClick={() => change(id, quantity - 1)}>−</button>
              <strong style={{ minWidth: 24, textAlign: 'center' }}>{quantity}</strong>
              <button className="btn btn-ghost" type="button" onClick={() => change(id, quantity + 1)}>+</button>
            </div>
          </div>;
        })}
      </div>
      <div style={{ background: 'var(--gold-pale)', borderRadius: 10, padding: 14 }}>
        <div className="ticket-row"><span>Updated total</span><b>${booking.total + difference + extraTotal}</b></div>
        <div className="ticket-row"><span>Deposit paid</span><b>−${booking.depositAmount}</b></div>
        <div className="ticket-total"><span>Updated balance due</span><span className="amt">${Math.max(0, booking.balanceDue + difference + extraTotal)}</span></div>
      </div>
      {booking.invoiceRef && difference !== 0 && <div className="notice" style={{ marginTop: 12 }}>The existing invoice will need to be regenerated after saving.</div>}
      {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" type="button" disabled={saving} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" type="button" disabled={saving || difference === 0} onClick={save}>{saving ? 'Saving…' : 'Save Add-ons'}</button>
      </div>
    </div>
  </div>;
}
