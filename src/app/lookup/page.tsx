'use client';

import { useState, useEffect } from 'react';
import { fmtDatePretty, fmtTime12 } from '@/lib/format';
import { ADDONS, sessionById } from '@/lib/constants';
import { MonthCalendar, CandidateSlot, startOfMonth, addMonths } from '@/components/MonthCalendar';

type Booking = {
  id: string; ref: string; sessionLabel: string; date: string; startTime: string; status: string;
  depositAmount: number; depositStatus: string; balanceDue: number; balanceStatus: string;
  bundleParentId: string | null;
};
type Bundle = { id: string; ref: string; clientName: string; creditsTotal: number; activated: boolean };

export default function LookupPage() {
  const [email, setEmail] = useState('');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [bundles, setBundles] = useState<Bundle[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{ type: 'booking' | 'bundle'; item: Booking | Bundle } | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function search() {
    if (!email.trim()) return;
    setLoading(true);
    setSelected(null);
    setCancelError(null);
    const res = await fetch(`/api/bookings/lookup?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    setBookings(data.bookings || []);
    setBundles(data.bundles || []);
    setLoading(false);
  }

  async function cancelBooking(id: string) {
    setCancelError(null);
    const res = await fetch(`/api/bookings/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const data = await res.json();
      setCancelError(data.error || 'Could not cancel this booking');
      return;
    }
    search();
    setSelected(null);
  }

  const results = [...(bookings || []).map((b) => ({ type: 'booking' as const, item: b })), ...(bundles || []).map((b) => ({ type: 'bundle' as const, item: b }))];

  return (
    <div className="wrap">
      <h1 style={{ fontSize: 26 }}>Look up my booking</h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5 }}>Enter the email address you used when booking.</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email address" style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 10, padding: '10px 12px' }} />
        <button className="btn btn-primary" onClick={search} disabled={loading}>{loading ? 'Searching…' : 'Find'}</button>
      </div>

      {selected ? (
        <div className="card">
          <button className="btn btn-ghost" style={{ marginBottom: 14 }} onClick={() => setSelected(null)}>‹ Back to results</button>
          {selected.type === 'booking' && (() => {
            const b = selected.item as Booking;
            return (
              <>
                <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--gold-deep)' }}>{b.sessionLabel}</div>
                <h2 style={{ fontSize: 20 }}>{fmtDatePretty(b.date)} at {fmtTime12(b.startTime)}</h2>
                <div style={{ fontFamily: 'monospace', margin: '8px 0' }}>{b.ref} — {b.status}</div>
                <div className="ticket-row"><span>Deposit</span><b>${b.depositAmount} — {b.depositStatus}</b></div>
                <div className="ticket-row"><span>Balance</span><b>{b.balanceStatus === 'n/a' ? '—' : `$${b.balanceDue} — ${b.balanceStatus}`}</b></div>
                {(b.status === 'pending' || b.status === 'confirmed') && (
                  <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => cancelBooking(b.id)}>Cancel / request reschedule</button>
                )}
                {cancelError && <div className="error-text">{cancelError}</div>}
              </>
            );
          })()}
          {selected.type === 'bundle' && (
            <BundleDetail
              bundle={selected.item as Bundle}
              redeemedSessions={(bookings || []).filter((b) => b.bundleParentId === (selected.item as Bundle).id && b.status !== 'cancelled')}
              onRedeemed={search}
            />
          )}
        </div>
      ) : (
        results.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {results.map((r) => (
              <button
                key={r.item.id}
                onClick={() => setSelected(r)}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', textAlign: 'left', background: 'var(--paper)', border: '1.5px solid var(--line)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}
              >
                {r.type === 'booking' ? (
                  <>
                    <div>
                      <div style={{ fontWeight: 600 }}>{(r.item as Booking).sessionLabel}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{fmtDatePretty((r.item as Booking).date)}, {fmtTime12((r.item as Booking).startTime)}</div>
                    </div>
                    <span>{(r.item as Booking).status}</span>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 600 }}>First Year Bundle</div>
                    <span style={{ fontSize: 12 }}>{(r.item as Bundle).activated ? 'Sessions ready to book' : 'Awaiting activation'}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        )
      )}
      {bookings !== null && bundles !== null && results.length === 0 && !selected && (
        <div className="notice warn">No bookings found for that email — please check it matches the address you used when booking.</div>
      )}
    </div>
  );
}

function BundleDetail({ bundle, redeemedSessions, onRedeemed }: { bundle: Bundle; redeemedSessions: Booking[]; onRedeemed: () => void }) {
  const redeemedCount = redeemedSessions.length;
  const nextSessionNumber = redeemedCount + 1; // 1 = already booked as the original deposit booking; 2 or 3 = redeemable here
  const canRedeem = bundle.activated && nextSessionNumber >= 2 && nextSessionNumber <= 3;

  const [redeeming, setRedeeming] = useState(false);
  const [slots, setSlots] = useState<CandidateSlot[]>([]);
  const [calMonth, setCalMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<CandidateSlot | null>(null);
  const [addOns, setAddOns] = useState<Record<string, number>>({});
  const [babyGender, setBabyGender] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const bundleType = sessionById('bundle')!;

  useEffect(() => {
    if (!redeeming) return;
    fetch('/api/availability?sessionType=bundle')
      .then((r) => r.json())
      .then((d) => setSlots(d.slots || []));
  }, [redeeming]);

  const slotsByDate: Record<string, CandidateSlot[]> = {};
  slots.forEach((s) => {
    (slotsByDate[s.date] = slotsByDate[s.date] || []).push(s);
  });

  async function confirmRedeem() {
    if (!selectedSlot) return;
    if (!babyGender) { setError('Please select baby\'s gender.'); return; }
    if (!photos.length) { setError('Please attach at least one reference photo.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      // Upload photos directly to Supabase
      const { uploadPhotoFromBrowser } = await import('@/lib/uploadClient');
      const referencePhotoUrls = await Promise.all(photos.map((p) => uploadPhotoFromBrowser(p.file)));
      const res = await fetch(`/api/bundles/${bundle.id}/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: selectedSlot, addOns, referencePhotoUrls, notes, babyGender }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Redemption failed'); return; }
      setDone(true);
      onRedeemed();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--gold-deep)' }}>First Year Bundle</div>
      <div style={{ fontFamily: 'monospace', margin: '8px 0' }}>{bundle.ref} — {bundle.activated ? 'active' : 'awaiting activation'}</div>
      <div style={{ fontSize: 13, marginBottom: 10 }}>{redeemedCount}/3 sessions used</div>

      {done && <div className="notice">Session booked — check your email for confirmation.</div>}

      {!bundle.activated && <div className="notice">Sessions 2 and 3 aren&apos;t unlocked yet — we&apos;ll let you know by email once they are.</div>}
      {bundle.activated && nextSessionNumber > 3 && <div className="notice">All 3 sessions have been used — thank you for booking your First Year Bundle with us!</div>}

      {canRedeem && !done && !redeeming && (
        <button className="btn btn-primary" onClick={() => setRedeeming(true)}>Redeem session {nextSessionNumber}</button>
      )}

      {canRedeem && redeeming && !done && (
        <div style={{ marginTop: 14 }}>
          {slots.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>Loading availability…</div>}
          {slots.length > 0 && (
            <>
              <MonthCalendar monthDate={calMonth} slotsByDate={slotsByDate} selectedDate={selectedDate} onNav={(d) => setCalMonth((m) => addMonths(m, d))} onSelectDay={(iso) => { setSelectedDate(iso); setSelectedSlot(null); }} />
              {selectedDate && slotsByDate[selectedDate] && (
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {slotsByDate[selectedDate].map((s) => (
                    <button key={s.startTime} className={`chip ${selectedSlot?.startTime === s.startTime ? 'selected' : ''}`} onClick={() => setSelectedSlot(s)}>
                      {fmtTime12(s.startTime)} {s.isWeekend && <span style={{ fontSize: 10, background: 'var(--rust-pale)', color: 'var(--rust)', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>+$50</span>}
                    </button>
                  ))}
                </div>
              )}
              {bundleType.addOns.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  {/* Service add-ons */}
                  {bundleType.addOns.filter((id: string) => ['extraSetup','extraOutfit','headcount'].includes(id)).map((id: string) => (
                    <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed var(--line)', fontSize: 13 }}>
                      <span>{ADDONS[id].name} <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>${ADDONS[id].price} each</span></span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button type="button" onClick={() => setAddOns((a) => ({ ...a, [id]: Math.max(0, (a[id] || 0) - 1) }))} style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid var(--line)', background: 'var(--paper)' }}>−</button>
                        <span style={{ minWidth: 14, textAlign: 'center', fontWeight: 700 }}>{addOns[id] || 0}</span>
                        <button type="button" onClick={() => setAddOns((a) => ({ ...a, [id]: (a[id] || 0) + 1 }))} style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid var(--line)', background: 'var(--paper)' }}>+</button>
                      </div>
                    </div>
                  ))}
                  {/* Products */}
                  <div style={{ marginTop: 8, marginBottom: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                    Products — <a href="https://www.mamamiyo-photography.com/products" target="_blank" rel="noopener" style={{ color: 'var(--gold-deep)', fontWeight: 400, textTransform: 'none' }}>view options</a>
                  </div>
                  {bundleType.addOns.filter((id: string) => !['extraSetup','extraOutfit','headcount'].includes(id)).map((id: string) => (
                    <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px dashed var(--line)', fontSize: 12 }}>
                      <span>{ADDONS[id].name} <span style={{ color: 'var(--ink-soft)' }}>${ADDONS[id].price}</span></span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button type="button" onClick={() => setAddOns((a) => ({ ...a, [id]: Math.max(0, (a[id] || 0) - 1) }))} style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid var(--line)', background: 'var(--paper)' }}>−</button>
                        <span style={{ minWidth: 14, textAlign: 'center', fontWeight: 700 }}>{addOns[id] || 0}</span>
                        <button type="button" onClick={() => setAddOns((a) => ({ ...a, [id]: (a[id] || 0) + 1 }))} style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid var(--line)', background: 'var(--paper)' }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
                <div className="field" style={{ marginTop: 14 }}>
                  <label>Baby's gender</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {[['boy', '👦 Boy'], ['girl', '👧 Girl'], ['prefer_not_to_say', 'Prefer not to say']].map(([val, label]) => (
                      <button key={val} type="button" className={`chip ${babyGender === val ? 'selected' : ''}`} onClick={() => setBabyGender(val)}>{label}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Reference photos — required</label>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6 }}>Upload up to 5 reference photos for this session.</div>
                  <input type="file" accept="image/*" multiple disabled={photos.length >= 5} onChange={(e) => {
                    if (!e.target.files) return;
                    const toAdd = Array.from(e.target.files).slice(0, 5 - photos.length);
                    setPhotos((prev) => [...prev, ...toAdd.map((f) => ({ file: f, previewUrl: URL.createObjectURL(f) }))]);
                  }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {photos.map((p, i) => (
                      <div key={i} style={{ position: 'relative', width: 56, height: 56, borderRadius: 8, overflow: 'hidden', border: '1.5px solid var(--line)' }}>
                        <img src={p.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button type="button" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: 'rgba(46,42,34,.75)', color: '#fff', border: 'none', fontSize: 10 }}>×</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}>{photos.length}/5 attached</div>
                </div>
                <div className="field">
                  <label>Notes (optional)</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know for this session?" style={{ width: '100%', minHeight: 56, border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }} />
                </div>
              <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={!selectedSlot || submitting} onClick={confirmRedeem}>
                {submitting ? 'Uploading & booking…' : 'Confirm this session'}
              </button>
              {error && <div className="error-text">{error}</div>}
            </>
          )}
        </div>
      )}
    </>
  );
}
