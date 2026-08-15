'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { SESSION_TYPES, ADDONS, SessionType } from '@/lib/constants';
import { computeBookingPricing } from '@/lib/pricing';
import { fmtDatePretty, fmtTime12 } from '@/lib/format';
import { MonthCalendar, CandidateSlot, startOfMonth, addMonths, fmtDateISO } from '@/components/MonthCalendar';

type Step = 'package' | 'calendar' | 'details' | 'review' | 'result';

export default function BookPage() {
  const [step, setStep] = useState<Step>('package');
  const [sessionTypeId, setSessionTypeId] = useState<string | null>(null);
  const [pkgOpen, setPkgOpen] = useState(false);

  const [slots, setSlots] = useState<CandidateSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [calMonth, setCalMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<CandidateSlot | null>(null);

  const [addOns, setAddOns] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+65');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [babyGender, setBabyGender] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<{ file: File; previewUrl: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  const [discountInput, setDiscountInput] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number; description: string } | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ booking: { ref: string; status: string; date: string; startTime: string; sessionLabel: string; location: string; depositAmount: number }; payNowPayload: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const sessionType: SessionType | undefined = SESSION_TYPES.find((s) => s.id === sessionTypeId);

  // Fetch availability whenever the package changes
  useEffect(() => {
    if (!sessionTypeId) return;
    setLoadingSlots(true);
    setSelectedDate(null);
    setSelectedSlot(null);
    fetch(`/api/availability?sessionType=${sessionTypeId}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots || []))
      .finally(() => setLoadingSlots(false));
  }, [sessionTypeId]);

  // Render the PayNow QR once we have a result
  useEffect(() => {
    if (result?.payNowPayload) {
      QRCode.toDataURL(result.payNowPayload, { margin: 1, width: 220 }).then(setQrDataUrl);
    }
  }, [result]);

  const slotsByDate: Record<string, CandidateSlot[]> = {};
  slots.forEach((s) => {
    (slotsByDate[s.date] = slotsByDate[s.date] || []).push(s);
  });

  function selectPackage(id: string) {
    setSessionTypeId(id);
    setPkgOpen(false);
    setAddOns({});
    setDiscountInput('');
    setAppliedDiscount(null);
  }

  async function applyDiscount() {
    setDiscountError(null);
    if (!discountInput.trim()) return;
    const res = await fetch(`/api/discounts/${encodeURIComponent(discountInput.trim().toUpperCase())}`);
    if (!res.ok) {
      setDiscountError('Code not recognised.');
      return;
    }
    const data = await res.json();
    setAppliedDiscount({ code: data.code, amount: data.amount, description: data.description });
  }

  async function handlePhotoUpload(files: FileList | null) {
    if (!files || !files.length) return;
    const room = 5 - photos.length;
    if (room <= 0) return;
    const toAdd = Array.from(files).slice(0, room);
    setPhotos((prev) => [...prev, ...toAdd.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  const readyForReview =
    !!selectedSlot &&
    name.trim() &&
    email.trim() &&
    countryCode.trim() &&
    phone.trim() &&
    babyGender.trim() &&
    photos.length > 0 &&
    (sessionType?.location !== 'home' || address.trim());

  const pricing =
    sessionType && selectedSlot
      ? computeBookingPricing({
          sessionType,
          addOns,
          isWeekend: selectedSlot.isWeekend,
          weekendSurchargeAmount: 50, // display estimate — server recomputes authoritatively on submit
          depositAmount: 100,
          discount: appliedDiscount,
        })
      : null;

  async function submitBooking() {
    if (!sessionType || !selectedSlot) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      setUploading(true);
      // Upload directly from browser to Supabase Storage — bypasses Vercel's
      // 4.5MB request body limit entirely since files go straight to Supabase.
      const { uploadPhotoFromBrowser } = await import('@/lib/uploadClient');
      const referencePhotoUrls = await Promise.all(photos.map((p) => uploadPhotoFromBrowser(p.file)));
      setUploading(false);

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionTypeId: sessionType.id,
          date: selectedSlot.date,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
          isWeekend: selectedSlot.isWeekend,
          addOns,
          notes,
          babyGender,
          referencePhotoUrls: referencePhotoUrls,
          address,
          discountCode: appliedDiscount?.code || null,
          clientName: name,
          clientEmail: email,
          countryCode,
          phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');
      setResult(data);
      setStep('result');
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }

  // ---------------- render ----------------
  if (step === 'result' && result) {
    // Build a Google Calendar link and a downloadable .ics for the result screen.
    // Note: the .ics here is client-side generated (for the "Add to calendar" button
    // before the email arrives). The real ICS sent by email is generated server-side
    // after deposit confirmation — this one is just a convenience for the pending state.
    const gcalBase = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
    const gcalDate = result.booking.date.replace(/-/g, '');
    const gcalUrl = `${gcalBase}&text=${encodeURIComponent(result.booking.sessionLabel + ' — Mamamiyo Photography')}&dates=${gcalDate}T090000/${gcalDate}T120000&details=${encodeURIComponent('Ref: ' + result.booking.ref)}`;

    return (
      <div className="wrap">
        <h1>Mamamiyo Photography</h1>
        <div className="card">
          <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--gold-deep)' }}>{result.booking.sessionLabel}</div>
          <h2 style={{ fontSize: 20, marginTop: 6 }}>
            {fmtDatePretty(result.booking.date)} at {fmtTime12(result.booking.startTime)}
          </h2>
          <div style={{ margin: '10px 0', fontFamily: 'monospace' }}>{result.booking.ref}</div>
          {qrDataUrl && (
            <div style={{ textAlign: 'center', margin: '16px 0' }}>
              <img src={qrDataUrl} alt="PayNow QR code" style={{ borderRadius: 12, border: '1.5px solid var(--line)' }} />
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 8 }}>
                Scan with your banking app to pay <b>${result.booking.depositAmount}</b> via PayNow
              </div>
            </div>
          )}
          <a
            href={gcalUrl}
            target="_blank"
            rel="noopener"
            className="btn btn-ghost"
            style={{ display: 'inline-flex', marginTop: 8, textDecoration: 'none' }}
          >
            📅 Add to Google Calendar
          </a>
          <div className="notice" style={{ marginTop: 12 }}>
            We&apos;ll confirm your booking by email once the deposit is received — the confirmation email includes a calendar invite (.ics) that works with all calendar apps. Save your reference code <b>{result.booking.ref}</b> to look up your booking anytime.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--gold-deep)', fontWeight: 600 }}>Mamamiyo Photography</div>
      <h1 style={{ fontSize: 30, marginTop: 6 }}>Book your session</h1>
      <p style={{ color: 'var(--ink-soft)' }}>Pick a package, choose a time, and secure it with a $100 deposit via PayNow.</p>

      {/* Step 1: package */}
      <div style={{ position: 'relative', maxWidth: 420, marginTop: 16 }}>
        <button
          type="button"
          onClick={() => setPkgOpen((o) => !o)}
          className="field"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
            border: '1.5px solid var(--line)', borderRadius: 10, padding: '12px 14px', background: 'var(--paper)', fontSize: 14,
          }}
        >
          {sessionType ? (
            <>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: sessionType.swatch, flexShrink: 0 }} />
              <span style={{ flex: 1, whiteSpace: 'nowrap', fontWeight: 600 }}>{sessionType.name}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 12.5, color: 'var(--gold-deep)' }}>${sessionType.price.toLocaleString()}</span>
            </>
          ) : (
            <span style={{ color: 'var(--ink-faint)' }}>Select a package…</span>
          )}
        </button>
        {pkgOpen && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--paper)', border: '1.5px solid var(--line)', borderRadius: 12, zIndex: 20, overflow: 'hidden' }}>
            {SESSION_TYPES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectPackage(s.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '12px 14px', background: 'var(--paper)', border: 'none', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.swatch, flexShrink: 0 }} />
                <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{s.name}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gold-deep)' }}>${s.price.toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {sessionType && !sessionType.isBundle && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 17, display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: sessionType.swatch }} />
              {sessionType.name}
            </h3>
            <div style={{ fontFamily: 'Georgia,serif', fontSize: 19, color: 'var(--gold-deep)' }}>${sessionType.price}</div>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginLeft: 19 }}>{sessionType.meta}</div>
          {sessionType.note && <div className="notice">{sessionType.note}</div>}
          <div style={{ fontSize: 11.5, textTransform: 'uppercase', color: 'var(--ink-soft)', marginTop: 16, marginBottom: 8 }}>Your session includes</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
            {sessionType.highlights?.map((h) => <li key={h} style={{ marginBottom: 6 }}>{h}</li>)}
          </ul>
        </div>
      )}

      {sessionType?.isBundle && (
        <div className="card">
          <h3 style={{ fontSize: 20 }}>{sessionType.name} — ${sessionType.price.toLocaleString()}</h3>
          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>{sessionType.intro}</p>
          {sessionType.milestones?.map((m, i) => (
            <div key={m.label} style={{ display: 'flex', gap: 12, background: 'var(--gold-pale)', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--gold)', color: 'var(--paper)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{m.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-soft)' }}>{m.age}</span>
            </div>
          ))}
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            Pick a date below and pay the $100 deposit for your first session — exactly like booking any other package. That deposit also secures your bundle: 2 more session credits, redeemable later with no additional deposit.
          </p>
        </div>
      )}

      {/* Step 2: calendar */}
      {sessionType && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15 }}>Pick a date &amp; time</h3>
          {loadingSlots && <div style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Loading availability…</div>}
          {!loadingSlots && slots.length === 0 && <div className="notice warn">No open slots right now — check back soon.</div>}
          {!loadingSlots && slots.length > 0 && (
            <>
              <MonthCalendar
                monthDate={calMonth}
                slotsByDate={slotsByDate}
                selectedDate={selectedDate}
                onNav={(dir) => setCalMonth((m) => addMonths(m, dir))}
                onSelectDay={(iso) => {
                  setSelectedDate(iso);
                  setSelectedSlot(null);
                }}
              />
              {selectedDate && slotsByDate[selectedDate] && (
                <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {slotsByDate[selectedDate].map((s) => (
                    <button
                      key={s.startTime}
                      className={`chip ${selectedSlot?.startTime === s.startTime ? 'selected' : ''}`}
                      onClick={() => setSelectedSlot(s)}
                    >
                      {fmtTime12(s.startTime)} {s.isWeekend && <span style={{ fontSize: 10, background: 'var(--rust-pale)', color: 'var(--rust)', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>+$50</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 3: add-ons + details */}
      {sessionType && selectedSlot && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15 }}>Add-ons &amp; your details</h3>
          <div className="card">
            {selectedSlot.isWeekend && (
              <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--rust-pale)', padding: '10px 12px', borderRadius: 8, marginBottom: 8, fontSize: 13.5 }}>
                <span>Weekend / PH surcharge — applies automatically</span>
                <b style={{ color: 'var(--rust)' }}>+$50</b>
              </div>
            )}
            {sessionType.addOns.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-faint)' }}>No add-ons for this package.</div>}
            {sessionType.addOns.map((id) => (
              <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px dashed var(--line)' }}>
                <span>
                  {ADDONS[id].name} <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>${ADDONS[id].price} each</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button type="button" onClick={() => setAddOns((a) => ({ ...a, [id]: Math.max(0, (a[id] || 0) - 1) }))} style={{ width: 26, height: 26, borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)' }}>−</button>
                  <span style={{ minWidth: 16, textAlign: 'center', fontWeight: 700 }}>{addOns[id] || 0}</span>
                  <button type="button" onClick={() => setAddOns((a) => ({ ...a, [id]: (a[id] || 0) + 1 }))} style={{ width: 26, height: 26, borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)' }}>+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="field"><label>Your name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div>
          <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" /></div>
          <div className="field">
            <label>WhatsApp number</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="+65" style={{ width: 80, flexShrink: 0 }} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9123 4567" style={{ flex: 1 }} />
            </div>
          </div>
          {sessionType.location === 'home' && (
            <div className="field">
              <label>Home address — required</label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Unit number, street, postal code" style={{ minHeight: 56 }} />
            </div>
          )}
          <div className="field">
            <label>Setup / inspiration photos — required</label>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>Screenshot the look(s) you&apos;d like from our website and upload up to 5 images.</div>
            <input type="file" accept="image/*" multiple disabled={photos.length >= 5} onChange={(e) => handlePhotoUpload(e.target.files)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: 'relative', width: 64, height: 64, borderRadius: 10, overflow: 'hidden', border: '1.5px solid var(--line)' }}>
                  <img src={p.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button type="button" onClick={() => removePhoto(i)} style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'rgba(46,42,34,.75)', color: '#fff', border: 'none', fontSize: 11 }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 6 }}>{photos.length}/5 attached</div>
          </div>
          <div className="field">
            <label>Baby's gender</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {[['boy', '👦 Boy'], ['girl', '👧 Girl'], ['prefer_not_to_say', 'Prefer not to say']].map(([val, label]) => (
                <button key={val} type="button" className={`chip ${babyGender === val ? 'selected' : ''}`} onClick={() => setBabyGender(val)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="field"><label>Notes (optional)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know?" /></div>
        </div>
      )}

      {/* Step 4: review */}
      {sessionType && selectedSlot && pricing && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15 }}>Review &amp; pay deposit</h3>
          <div className="field" style={{ maxWidth: 320 }}>
            <label>Discount code — optional</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} placeholder="Enter code, if you have one" disabled={!!appliedDiscount} style={{ textTransform: 'uppercase' }} />
              {appliedDiscount ? (
                <button type="button" className="btn btn-ghost" onClick={() => { setAppliedDiscount(null); setDiscountInput(''); }}>Remove</button>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={applyDiscount}>Apply</button>
              )}
            </div>
            {discountError && <div className="error-text">{discountError}</div>}
            {appliedDiscount && <div style={{ fontSize: 12, color: 'var(--sage)', marginTop: 6 }}>&quot;{appliedDiscount.code}&quot; applied — −${appliedDiscount.amount}</div>}
          </div>

          <div className="card">
            {/* Session details */}
            <div className="ticket-row"><span>Date</span><b>{fmtDatePretty(selectedSlot.date)}, {fmtTime12(selectedSlot.startTime)}</b></div>
            <div className="ticket-row"><span>Session</span><b>{sessionType.name}</b></div>

            {/* Line items */}
            <div style={{ borderTop: '1px dashed var(--line)', margin: '10px 0' }} />
            <div className="ticket-row"><span>{sessionType.isBundle ? 'Session 1 price' : 'Session price'}</span><b>${pricing.sessionPrice}</b></div>
            {Object.entries(addOns).filter(([, q]) => q > 0).map(([id, q]) => (
              <div className="ticket-row" key={id}><span>{ADDONS[id].name} ×{q}</span><b>+${ADDONS[id].price * q}</b></div>
            ))}
            <div className="ticket-row"><span>{pricing.weekendFee > 0 ? 'Weekend / PH surcharge' : 'Surcharge'}</span><b>{pricing.weekendFee > 0 ? `+$${pricing.weekendFee}` : '$0'}</b></div>
            {pricing.discountAmount > 0 && <div className="ticket-row" style={{ color: 'var(--sage)' }}><span>Discount ({appliedDiscount?.code})</span><b style={{ color: 'var(--sage)' }}>−${pricing.discountAmount}</b></div>}

            {/* Total */}
            <div style={{ borderTop: '1.5px solid var(--ink)', margin: '10px 0' }} />
            <div className="ticket-row" style={{ fontWeight: 700 }}><span>{sessionType.isBundle ? 'Session 1 total' : 'Total'}</span><b>${pricing.total}</b></div>

            {/* Payment breakdown */}
            <div style={{ borderTop: '1px dashed var(--line)', margin: '14px 0 10px' }} />
            <div className="ticket-total" style={{ marginTop: 0, marginBottom: 8 }}><span style={{ fontWeight: 700 }}>Deposit due now</span><span className="amt">${pricing.depositAmount}</span></div>
            <div className="ticket-row" style={{ color: 'var(--ink-soft)' }}><span>Balance due after session</span><b style={{ color: 'var(--ink-soft)' }}>${pricing.balanceDue}</b></div>
          </div>

          <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={!readyForReview || submitting} onClick={submitBooking}>
            {submitting ? (uploading ? 'Uploading photos…' : 'Creating booking…') : 'Generate payment QR'}
          </button>
          {!readyForReview && <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 6 }}>Fill in your name, email, WhatsApp number, baby's gender, address (if applicable), and attach at least one reference photo to continue.</div>}
          {submitError && <div className="error-text">{submitError}</div>}
        </div>
      )}
    </div>
  );
}
