'use client';

import { useEffect, useState, useCallback } from 'react';
import { fmtDatePretty, fmtTime12 } from '@/lib/format';
import { ADDONS, STATUS_LABELS } from '@/lib/constants';
import BookingSummaryModal from '@/components/BookingSummaryModal';
import EditBookingModal from '@/components/EditBookingModal';

type Booking = {
  id: string; ref: string; sessionTypeId: string; sessionLabel: string; location: string;
  date: string; startTime: string; endTime: string; isWeekend: boolean; addOns: Record<string, number>;
  notes: string; address: string; discountCode: string | null; discountAmount: number;
  clientName: string; clientEmail: string; clientPhone: string;
  subtotal: number; total: number; depositAmount: number; balanceDue: number;
  extraLineItems: { description: string; amount: number }[]; invoiceRef: string | null;
  status: string; depositStatus: string; balanceStatus: string;
  referencePhotoUrls: string[]; remindersSent: string[]; bundleSessionNumber: number | null;
};

const STATUS_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'pending', label: '1. Pending deposit' },
  { key: 'confirmed', label: '2. Booking confirmed' },
  { key: 'basic_retouch', label: '3. Basic retouch' },
  { key: 'further_retouch', label: '4. Further retouch' },
  { key: 'completed', label: '5. Photoshoot complete' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_LABEL = STATUS_LABELS;

export default function AdminBookingsPage() {
  const [filter, setFilter] = useState('active');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedPhotos, setExpandedPhotos] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lineDesc, setLineDesc] = useState('');
  const [lineAmount, setLineAmount] = useState('');
  const [invoiceQr, setInvoiceQr] = useState<{ bookingId: string; dataUrl: string; due: number } | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [summaryBooking, setSummaryBooking] = useState<Booking | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const url = filter === 'active'
      ? `/api/admin/bookings?active=1`
      : `/api/admin/bookings?status=${filter}`;
    const res = await fetch(url);
    const data = await res.json();
    setBookings(data.bookings || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function expandBooking(id: string) {
    if (expandedId === id) { setExpandedId(null); setExpandedPhotos([]); return; }
    setExpandedId(id);
    setExpandedPhotos([]);
    const res = await fetch(`/api/admin/bookings/${id}`);
    const data = await res.json();
    setExpandedPhotos(data.booking?.referencePhotoUrls || []);
  }

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
      if (!res.ok) { setActionError({ id, message: data.error || 'Action failed' }); return null; }
      await load();
      return data;
    } finally {
      setBusyId(null);
    }
  }

  async function openSummary(id: string) {
    const res = await fetch(`/api/admin/bookings/${id}`);
    const data = await res.json();
    if (data?.booking) setSummaryBooking(data.booking);
  }

  async function generateInvoice(id: string) {
    const data = await runAction(id, 'generate-invoice');
    if (data?.payNowPayload) {
      const QRCode = (await import('qrcode')).default;
      const dataUrl = await QRCode.toDataURL(data.payNowPayload, { margin: 1, width: 200 });
      setInvoiceQr({ bookingId: id, dataUrl, due: data.due });
    }
  }

  function renderBookingCard(b: Booking) {
        const isOpen = expandedId === b.id;
        const isBusy = busyId === b.id;
        const statusStyle = STATUS_LABEL[b.status] || { label: b.status, color: '#3A2E28', bg: '#EDE6DC' };
        const isPostProcessing = ['pending_balance', 'basic_retouch', 'further_retouch', 'completed'].includes(b.status);

        return (
          <div key={b.id} className={`booking-card${isOpen ? ' open' : ''}${filter === 'active' ? ((b.status === 'pending' || b.status === 'confirmed') ? ' pre-shoot-card' : ' post-shoot-card') : ''}`}>
            {/* Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: '0 0 68%', minWidth: 0 }}>
                <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 16, lineHeight: 1.25, color: '#3A2E28' }}>{b.clientName}</div>
                <div style={{ fontSize: 13, color: '#9A8C7F', marginTop: 4, lineHeight: 1.35 }}>{b.sessionLabel}</div>
                <div style={{ fontWeight: 600, fontSize: 12.5, color: '#3A2E28', marginTop: 4, lineHeight: 1.35 }}>{fmtDatePretty(b.date)} · {fmtTime12(b.startTime)}</div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, minWidth: 92 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 999, background: statusStyle.bg, color: statusStyle.color, whiteSpace: 'nowrap' }}>
                  {statusStyle.label}
                </span>
                {isPostProcessing && b.balanceStatus !== 'n/a' && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: b.balanceStatus === 'paid' ? '#E4E9DD' : '#F4E4C1', color: b.balanceStatus === 'paid' ? '#4B5940' : '#7A5F2F', whiteSpace: 'nowrap' }}>
                    {b.balanceStatus === 'paid' ? 'Balance paid' : 'Balance pending'}
                  </span>
                )}
                <button onClick={() => expandBooking(b.id)} className="booking-open-button">
                  {isOpen ? 'Close' : 'Open'}
                </button>
              </div>
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <div className="booking-detail">
                {actionError?.id === b.id && <div className="notice warn" style={{ marginTop: 0, marginBottom: 12 }}>{actionError.message}</div>}

                <div className="ticket-row"><span>Reference</span><b style={{ fontFamily: 'monospace' }}>{b.ref}</b></div>
                <div className="ticket-row"><span>Location</span><b>{b.location === 'home' ? "Client's home" : 'Studio'}</b></div>
                <div className="ticket-row"><span>Email</span><b>{b.clientEmail}</b></div>
                <div className="ticket-row"><span>Phone</span><b>{b.clientPhone}</b></div>
                {b.address && <div className="ticket-row"><span>Address</span><b>{b.address}</b></div>}
                <div className="ticket-row"><span>Add-ons</span><b>{Object.entries(b.addOns).filter(([, q]) => q > 0).map(([id, q]) => `${ADDONS[id]?.name} ×${q}`).join(', ') || '—'}</b></div>
                {b.isWeekend && <div className="ticket-row"><span>Weekend surcharge</span><b>+$50</b></div>}
                {b.discountCode && <div className="ticket-row"><span>Discount</span><b>−${b.discountAmount} ({b.discountCode})</b></div>}
                <div className="ticket-row"><span>Notes</span><b style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{b.notes || '—'}</b></div>

                {expandedPhotos.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 6 }}>Reference photos ({expandedPhotos.length})</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {expandedPhotos.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noopener" style={{ display: 'block', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: '1.5px solid var(--line)' }}>
                          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {b.status === 'confirmed' && (
                  <div style={{ marginTop: 8, fontSize: 12 }}>Reminders sent: {b.remindersSent?.length ? b.remindersSent.join(', ') : 'none yet'}</div>
                )}

                {/* Final bill panel */}
                {isPostProcessing && b.balanceStatus === 'pending' && (() => {
                  const addOnsRecord = (b.addOns || {}) as Record<string, number>;
                  const addOnsTotal = Object.entries(addOnsRecord).filter(([,q]) => q > 0).reduce((s, [id, q]) => s + (ADDONS[id]?.price || 0) * q, 0);
                  const weekendFee = b.isWeekend ? 50 : 0;
                  const isBundle = b.sessionTypeId === 'bundle';
                  const basePrice = isBundle
                    ? b.balanceDue - addOnsTotal - weekendFee  // session balance only (e.g. $330)
                    : b.total - addOnsTotal - weekendFee + b.discountAmount;
                  const baseLabel = isBundle
                    ? `Session ${b.bundleSessionNumber || 1} balance`
                    : 'Package price';
                  const extraTotal = b.extraLineItems.reduce((s, i) => s + i.amount, 0);
                  const totalDue = b.balanceDue + extraTotal;
                  return (
                  <div style={{ marginTop: 14, background: 'var(--gold-pale)', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Final bill</div>

                    {/* Full breakdown */}
                    <div className="ticket-row"><span>{baseLabel}</span><b>${basePrice}</b></div>
                    {Object.entries(addOnsRecord).filter(([,q]) => q > 0).map(([id, q]) => (
                      <div className="ticket-row" key={id}><span>{ADDONS[id]?.name} ×{q}</span><b>+${(ADDONS[id]?.price || 0) * q}</b></div>
                    ))}
                    {weekendFee > 0 && <div className="ticket-row"><span>Weekend / PH surcharge</span><b>+${weekendFee}</b></div>}
                    {b.discountAmount > 0 && <div className="ticket-row" style={{ color: 'var(--sage)' }}><span>Discount ({b.discountCode})</span><b>−${b.discountAmount}</b></div>}

                    {/* Extra line items added post-session */}
                    {b.extraLineItems.length > 0 && (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--line)' }}>
                        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 4 }}>Additional charges</div>
                        {b.extraLineItems.map((item, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px dashed var(--line)' }}>
                            <input
                              defaultValue={item.description}
                              onBlur={async (e) => {
                                if (e.target.value === item.description) return;
                                const updated = [...b.extraLineItems];
                                updated[i] = { ...item, description: e.target.value };
                                await runAction(b.id, 'extra-line-item', { replace: updated });
                              }}
                              style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 6, padding: '4px 8px', fontSize: 12.5 }}
                            />
                            <input
                              defaultValue={item.amount}
                              type="number"
                              onBlur={async (e) => {
                                const val = Number(e.target.value);
                                if (val === item.amount) return;
                                const updated = [...b.extraLineItems];
                                updated[i] = { ...item, amount: val };
                                await runAction(b.id, 'extra-line-item', { replace: updated });
                              }}
                              style={{ width: 60, border: '1.5px solid var(--line)', borderRadius: 6, padding: '4px 8px', fontSize: 12.5 }}
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm(`Delete "${item.description}"?`)) return;
                                const updated = b.extraLineItems.filter((_: unknown, j: number) => j !== i);
                                await runAction(b.id, 'extra-line-item', { replace: updated });
                              }}
                              style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid var(--rust-pale)', background: 'var(--rust-pale)', color: 'var(--rust)', fontSize: 14, cursor: 'pointer' }}
                            >×</button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ borderTop: '1.5px solid var(--ink)', margin: '8px 0 6px', paddingTop: 6 }}>
                      <div className="ticket-row"><span>Total</span><b>${(isBundle ? b.balanceDue : b.total) + extraTotal}</b></div>
                      {!isBundle && <div className="ticket-row"><span>Deposit paid</span><b>−${b.depositAmount}</b></div>}
                      <div className="ticket-total" style={{ marginTop: 6 }}>
                        <span style={{ fontWeight: 700 }}>Balance due</span>
                        <span className="amt">${totalDue}</span>
                      </div>
                    </div>

                    {/* Add extra line items */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <input placeholder="Description" value={lineDesc} onChange={(e) => setLineDesc(e.target.value)} style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
                      <input placeholder="$" type="number" value={lineAmount} onChange={(e) => setLineAmount(e.target.value)} style={{ width: 70, border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
                      <button className="btn btn-ghost" onClick={async () => {
                        if (!lineDesc || !lineAmount) return;
                        await runAction(b.id, 'extra-line-item', { description: lineDesc, amount: Number(lineAmount) });
                        setLineDesc(''); setLineAmount('');
                      }}>Add</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button className="btn btn-primary" disabled={isBusy} onClick={() => generateInvoice(b.id)}>
                        Generate &amp; send invoice to client
                      </button>
                      <button className="btn btn-ghost" disabled={isBusy} onClick={() => {
                        if (confirm('Confirm that the balance has already been received? This will skip sending an invoice.')) {
                          runAction(b.id, 'confirm-balance');
                        }
                      }}>
                        Payment received — skip invoice
                      </button>
                    </div>
                    {invoiceQr?.bookingId === b.id && (
                      <div className="notice" style={{ marginTop: 8 }}>Invoice sent to {b.clientEmail} — PayNow QR included in email.</div>
                    )}
                  </div>
                  );
                })()}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  {(b.status === 'pending' || b.status === 'confirmed') && (
                    <button className="btn btn-ghost" disabled={isBusy} onClick={() => setEditBooking(b)}>Edit booking</button>
                  )}
                  {b.status === 'pending' && (
                    <button className="btn btn-primary" disabled={isBusy} onClick={() => runAction(b.id, 'confirm-deposit')}>Confirm deposit received</button>
                  )}
                  {b.status === 'confirmed' && (
                    <button className="btn btn-primary" disabled={isBusy} onClick={() => runAction(b.id, 'mark-completed')}>Mark session done</button>
                  )}
                  {b.status === 'confirmed' && (
                    <button className="btn btn-ghost" onClick={() => openSummary(b.id)}>Generate booking summary</button>
                  )}
                  {(b.status === 'pending_balance' || b.status === 'basic_retouch' || b.status === 'further_retouch') && (
                    <button className="btn btn-primary" disabled={isBusy} onClick={() => runAction(b.id, 'advance-stage')}>
                      {(b.status === 'pending_balance' || b.status === 'basic_retouch') ? 'Move to further retouch' : 'Mark photoshoot complete'}
                    </button>
                  )}
                  {(b.status === 'pending_balance' || b.status === 'basic_retouch') && (
                    <button className="btn btn-ghost" disabled={isBusy} onClick={() => {
                      if (confirm('Skip further retouch and mark this photoshoot complete?')) {
                        runAction(b.id, 'skip-further-retouch');
                      }
                    }}>
                      Skip further retouch &amp; complete
                    </button>
                  )}
                  {(b.status === 'further_retouch' || b.status === 'completed') && (
                    <button className="btn btn-ghost" disabled={isBusy} onClick={() => runAction(b.id, 'revert-stage')}>
                      {b.status === 'completed' ? 'Go back to further retouch' : 'Go back to basic retouch'}
                    </button>
                  )}
                  {b.status !== 'cancelled' && (
                    <button className="btn btn-ghost" disabled={isBusy} onClick={() => { if (confirm('Cancel this booking?')) runAction(b.id, 'cancel'); }}>Cancel</button>
                  )}
                  <button className="btn btn-ghost" style={{ color: 'var(--rust)' }} disabled={isBusy} onClick={() => { if (confirm('Permanently DELETE this booking? Cannot be undone.')) runAction(b.id, 'delete'); }}>Delete</button>
                </div>
              </div>
            )}
          </div>
        );
  }

  return (
    <div className="bookings-view">
      <div className="bookings-heading">
        <div>
          <div className="bookings-kicker">Booking management</div>
          <h2>Sessions</h2>
        </div>
        <div className="bookings-count">{loading ? '—' : bookings.length}</div>
      </div>
      {/* Status filter chips — single scrollable row, equal height, no wrap */}
      <div className="status-filter" aria-label="Filter bookings by status">
        {STATUS_TABS.map((t) => (
          <button key={t.key} onClick={() => setFilter(t.key)} className={`status-filter-button${filter === t.key ? ' active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Loading…</div>}
      {!loading && bookings.length === 0 && <div className="notice">No bookings in this category.</div>}

      {/* Column header */}
      {!loading && bookings.length > 0 && filter !== 'active' && (
        <div className="booking-column-head">
          <div style={{ flex: '0 0 68%' }}>Session</div>
          <div style={{ flex: 1, textAlign: 'right' }}>Status</div>
        </div>
      )}

      {filter === 'active' ? (
        <div className="booking-active-groups">
          <section className="booking-group">
            <div className="booking-group-heading pre-shoot-heading">
              <span>Before photoshoot</span>
              <b>{bookings.filter((booking) => booking.status === 'pending' || booking.status === 'confirmed').length}</b>
            </div>
            <div className="booking-list">
              {[...bookings]
                .filter((booking) => booking.status === 'pending' || booking.status === 'confirmed')
                .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
                .map(renderBookingCard)}
            </div>
          </section>
          <section className="booking-group">
            <div className="booking-group-heading post-shoot-heading">
              <span>Photoshoot done · Post-processing</span>
              <b>{bookings.filter((booking) => ['pending_balance', 'basic_retouch', 'further_retouch', 'completed'].includes(booking.status)).length}</b>
            </div>
            <div className="booking-list">
              {[...bookings]
                .filter((booking) => ['pending_balance', 'basic_retouch', 'further_retouch', 'completed'].includes(booking.status))
                .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
                .map(renderBookingCard)}
            </div>
          </section>
        </div>
      ) : (
        <div className="booking-list">
          {[...bookings]
            .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
            .map(renderBookingCard)}
        </div>
      )}

      {summaryBooking && (
        <BookingSummaryModal booking={summaryBooking} onClose={() => setSummaryBooking(null)} />
      )}
      {editBooking && (
        <EditBookingModal
          booking={editBooking}
          onClose={() => setEditBooking(null)}
          onSaved={async () => {
            setEditBooking(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
