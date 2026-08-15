'use client';

import { useEffect, useState, useCallback } from 'react';
import { fmtDatePretty, fmtTime12 } from '@/lib/format';
import { ADDONS } from '@/lib/constants';

type Booking = {
  id: string; ref: string; sessionTypeId: string; sessionLabel: string; location: string;
  date: string; startTime: string; isWeekend: boolean; addOns: Record<string, number>;
  notes: string; address: string; discountCode: string | null; discountAmount: number;
  clientName: string; clientEmail: string; clientPhone: string;
  subtotal: number; total: number; depositAmount: number; balanceDue: number;
  extraLineItems: { description: string; amount: number }[]; invoiceRef: string | null;
  status: string; depositStatus: string; balanceStatus: string;
  referencePhotoUrls: string[]; remindersSent: string[];
};

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'pending_balance', label: 'Pending balance' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function AdminBookingsPage() {
  const [filter, setFilter] = useState('pending');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedPhotos, setExpandedPhotos] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lineDesc, setLineDesc] = useState('');
  const [lineAmount, setLineAmount] = useState('');
  const [invoiceQr, setInvoiceQr] = useState<{ bookingId: string; dataUrl: string; due: number } | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  async function expandBooking(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedPhotos([]);
      return;
    }
    setExpandedId(id);
    setExpandedPhotos([]);
    // Fetch full booking detail including photos
    const res = await fetch(`/api/admin/bookings/${id}`);
    const data = await res.json();
    setExpandedPhotos(data.booking?.referencePhotoUrls || []);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/bookings?status=${filter}`);
    const data = await res.json();
    setBookings(data.bookings || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(id: string, path: string, body?: unknown) {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${id}/${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError({ id, message: data.error || 'Action failed' });
        return null;
      }
      await load();
      return data;
    } finally {
      setBusyId(null);
    }
  }

  async function generateInvoice(id: string) {
    const data = await runAction(id, 'generate-invoice');
    if (data?.payNowPayload) {
      const QRCode = (await import('qrcode')).default;
      const dataUrl = await QRCode.toDataURL(data.payNowPayload, { margin: 1, width: 200 });
      setInvoiceQr({ bookingId: id, dataUrl, due: data.due });
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            style={{
              borderRadius: 20, padding: '7px 14px', fontSize: 12.5, fontWeight: 600,
              background: filter === t.key ? 'var(--ink)' : 'var(--paper)',
              color: filter === t.key ? 'var(--cream)' : 'var(--ink-soft)',
              border: filter === t.key ? 'none' : '1.5px solid var(--line)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Loading…</div>}
      {!loading && bookings.length === 0 && <div className="notice">No {filter.replace('_', ' ')} bookings.</div>}

      {bookings.map((b) => {
        const isOpen = expandedId === b.id;
        const isBusy = busyId === b.id;
        return (
          <div key={b.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                  {b.sessionLabel} {b.isWeekend && <span style={{ fontSize: 9, background: 'var(--rust-pale)', color: 'var(--rust)', padding: '1px 6px', borderRadius: 6, fontWeight: 700, marginLeft: 4 }}>WKND/PH</span>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{fmtDatePretty(b.date)}, {fmtTime12(b.startTime)} — {b.clientName}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>
                  ${b.total} · dep ${b.depositAmount} {b.depositStatus} · bal ${b.balanceDue + b.extraLineItems.reduce((s, i) => s + i.amount, 0)} {b.balanceStatus}
                </div>
              </div>
              <button className="btn btn-ghost" onClick={() => expandBooking(b.id)}>{isOpen ? 'Hide' : 'Details'}</button>
            </div>

            {isOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--line)', fontSize: 13 }}>
                {actionError?.id === b.id && <div className="notice warn" style={{ marginTop: 0, marginBottom: 12 }}>{actionError.message}</div>}
                <div className="ticket-row"><span>Reference</span><b style={{ fontFamily: 'monospace' }}>{b.ref}</b></div>
                <div className="ticket-row"><span>Location</span><b>{b.location === 'home' ? "Client's home" : 'Studio'}</b></div>
                <div className="ticket-row"><span>Phone</span><b>{b.clientPhone}</b></div>
                {b.address && <div className="ticket-row"><span>Address</span><b>{b.address}</b></div>}
                <div className="ticket-row"><span>Add-ons</span><b>{Object.entries(b.addOns).filter(([, q]) => q > 0).map(([id, q]) => `${ADDONS[id]?.name} ×${q}`).join(', ') || '—'}</b></div>
                {b.isWeekend && <div className="ticket-row"><span>Weekend / PH surcharge</span><b>+$50</b></div>}
                {b.discountCode && <div className="ticket-row"><span>Discount</span><b>−${b.discountAmount} ({b.discountCode})</b></div>}
                <div className="ticket-row"><span>Notes</span><b>{b.notes || '—'}</b></div>

                {expandedPhotos.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 6 }}>Reference photos ({expandedPhotos.length})</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {expandedPhotos.map((url: string) => (
                        <a key={url} href={url} target="_blank" rel="noopener" style={{ display: 'block', width: 56, height: 56, borderRadius: 8, overflow: 'hidden', border: '1.5px solid var(--line)' }}>
                          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {b.status === 'confirmed' && (
                  <div style={{ marginTop: 8, fontSize: 12 }}>Reminders sent: {b.remindersSent.length ? b.remindersSent.join(', ') : 'none yet'}</div>
                )}

                {/* Final bill panel — only relevant once the session has happened */}
                {b.status === 'pending_balance' && (
                  <div style={{ marginTop: 14, background: 'var(--gold-pale)', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Final bill</div>
                    {b.extraLineItems.map((item, i) => (
                      <div className="ticket-row" key={i}><span>{item.description}</span><b>+${item.amount}</b></div>
                    ))}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <input placeholder="Description" value={lineDesc} onChange={(e) => setLineDesc(e.target.value)} style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
                      <input placeholder="$" type="number" value={lineAmount} onChange={(e) => setLineAmount(e.target.value)} style={{ width: 70, border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
                      <button
                        className="btn btn-ghost"
                        onClick={async () => {
                          if (!lineDesc || !lineAmount) return;
                          await runAction(b.id, 'extra-line-item', { description: lineDesc, amount: Number(lineAmount) });
                          setLineDesc('');
                          setLineAmount('');
                        }}
                      >
                        Add
                      </button>
                    </div>
                    <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={isBusy} onClick={() => generateInvoice(b.id)}>
                      Generate invoice &amp; payment QR
                    </button>
                    {invoiceQr?.bookingId === b.id && (
                      <div style={{ textAlign: 'center', marginTop: 12 }}>
                        <img src={invoiceQr.dataUrl} alt="Invoice PayNow QR" style={{ borderRadius: 10 }} />
                        <div style={{ fontSize: 12, marginTop: 6 }}>${invoiceQr.due} due — screenshot or forward to client</div>
                      </div>
                    )}
                    <button className="btn btn-ghost" style={{ marginTop: 10 }} disabled={isBusy} onClick={() => runAction(b.id, 'confirm-balance')}>
                      Confirm balance received
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  {b.status === 'pending' && (
                    <button className="btn btn-primary" disabled={isBusy} onClick={() => runAction(b.id, 'confirm-deposit')}>Confirm deposit received</button>
                  )}
                  {b.status === 'confirmed' && (
                    <button className="btn btn-primary" disabled={isBusy} onClick={() => runAction(b.id, 'mark-completed')}>Mark session done</button>
                  )}
                  {b.status !== 'cancelled' && (
                    <button className="btn btn-ghost" disabled={isBusy} onClick={() => { if (confirm('Cancel this booking?')) runAction(b.id, 'cancel'); }}>Cancel</button>
                  )}
                  <button className="btn btn-ghost" style={{ color: 'var(--rust)' }} disabled={isBusy} onClick={() => { if (confirm('Permanently DELETE this booking? This cannot be undone.')) runAction(b.id, 'delete'); }}>Delete</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
