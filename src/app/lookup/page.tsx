'use client';

import { useState, useEffect } from 'react';
import { fmtDatePretty, fmtTime12 } from '@/lib/format';
import { ADDONS, sessionById } from '@/lib/constants';
import { MonthCalendar, CandidateSlot, startOfMonth, addMonths } from '@/components/MonthCalendar';
import { PHOTO_SHARING_OPTIONS } from '@/lib/photoConsent';
import { photoSharingConsentLabel } from '@/lib/photoConsent';
import { ClientSetupEditor } from '@/components/ClientSetupEditor';

type Booking = {
  id: string; ref: string; sessionTypeId: string; sessionLabel: string; date: string; startTime: string; endTime: string; status: string;
  clientName: string; clientEmail: string; clientPhone: string; location: string; address: string; notes: string;
  addOns: Record<string, number>; subtotal: number; total: number; discountCode: string | null; discountAmount: number;
  isWeekend: boolean; extraLineItems: {description:string;amount:number}[]; photoSharingConsent?: string;
  setupSelections?: {slot:number;referencePhotoUrls:string[];note?:string;outfitSource?:string|null}[];
  setupSelectionCount?: number;
  inspirationReferencePhotoUrls?: string[]; referencePhotoUrls?: string[];
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
  const [editingAddOnsId, setEditingAddOnsId] = useState<string | null>(null);
  const [draftAddOns, setDraftAddOns] = useState<Record<string, number>>({});
  const [savingAddOns, setSavingAddOns] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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

  function beginEditAddOns(booking: Booking) {
    setDraftAddOns({ ...(booking.addOns || {}) });
    setEditingAddOnsId(booking.id);
    setSaveMessage(null);
    setCancelError(null);
  }

  function changeAddOn(id: string, quantity: number) {
    setDraftAddOns((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[id];
      else next[id] = quantity;
      return next;
    });
  }

  async function saveAddOns(booking: Booking) {
    setSavingAddOns(true);
    setCancelError(null);
    setSaveMessage(null);
    try {
      const response = await fetch(`/api/bookings/${booking.id}/update-addons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, addOns: draftAddOns }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the booking.');
      setEditingAddOnsId(null);
      setSaveMessage('Add-ons and products updated. An updated confirmation email has been sent.');
      await search();
      setSelected({ type: 'booking', item: data.booking });
    } catch (error) {
      setCancelError((error as Error).message);
    } finally {
      setSavingAddOns(false);
    }
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
                <section style={{marginTop:16,padding:14,border:'1.5px solid var(--line)',borderRadius:12,background:'var(--cream)'}}>
                  <h3 style={{fontSize:17,marginBottom:10}}>Photoshoot details</h3>
                  <div className="ticket-row"><span>Client</span><b>{b.clientName}</b></div>
                  <div className="ticket-row"><span>Email</span><b>{b.clientEmail}</b></div>
                  <div className="ticket-row"><span>Phone</span><b>{b.clientPhone}</b></div>
                  <div className="ticket-row"><span>Package</span><b>{b.sessionLabel}</b></div>
                  <div className="ticket-row"><span>Date &amp; time</span><b>{fmtDatePretty(b.date)}, {fmtTime12(b.startTime)}–{fmtTime12(b.endTime)}</b></div>
                  <div className="ticket-row"><span>Location</span><b>{b.location === 'home' ? (b.address || 'Client home') : 'Home Studio @ K-Lodge'}</b></div>
                  <div className="ticket-row"><span>Photo sharing</span><b>{photoSharingConsentLabel(b.photoSharingConsent)}</b></div>
                  {b.notes && <div style={{marginTop:10}}><b>Notes</b><div style={{whiteSpace:'pre-line',marginTop:5,color:'var(--ink-soft)'}}>{b.notes}</div></div>}
                  {!!b.setupSelections?.length && <div style={{marginTop:12}}><b>Setup / outfit selections</b>{b.setupSelections.map((setup)=><div key={setup.slot} style={{marginTop:8,padding:'8px 10px',background:'var(--paper)',borderRadius:8}}><div>Setup {setup.slot}{setup.outfitSource ? ` · ${setup.outfitSource === 'own' ? 'Own outfit' : 'Mamamiyo outfit'}` : ''}</div>{setup.note && <div style={{fontSize:12,color:'var(--ink-soft)'}}>{setup.note}</div>}<div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:6}}>{setup.referencePhotoUrls?.map(url=><img key={url} src={url} alt={`Setup ${setup.slot} reference`} style={{width:64,height:64,objectFit:'cover',borderRadius:7}}/>)}</div></div>)}</div>}
                  {!!b.inspirationReferencePhotoUrls?.length && <div style={{marginTop:12}}><b>Inspiration photos</b><div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:6}}>{b.inspirationReferencePhotoUrls.map(url=><img key={url} src={url} alt="Inspiration reference" style={{width:64,height:64,objectFit:'cover',borderRadius:7}}/>)}</div></div>}
                  {(b.status === 'pending' || b.status === 'confirmed') && <ClientSetupEditor booking={b} email={email} setupCount={Math.min(3,Math.max(1,b.setupSelectionCount || (sessionById(b.sessionTypeId)?.referenceSetups || 1) + (b.addOns?.extraSetup || 0) + (b.addOns?.extraOutfit || 0)))} onSaved={(booking)=>{setSaveMessage('Setup choices and photos updated. An updated confirmation email has been sent.');setSelected({type:'booking',item:booking});setBookings(current=>current?.map(item=>item.id===booking.id?booking:item)||null);}}/>}
                </section>

                <section style={{marginTop:14,padding:14,border:'1.5px solid var(--line)',borderRadius:12}}>
                  <h3 style={{fontSize:17,marginBottom:8}}>Add-ons &amp; products</h3>
                  {Object.entries(b.addOns || {}).filter(([,qty])=>qty>0).length ? Object.entries(b.addOns).filter(([,qty])=>qty>0).map(([id,qty])=><div className="ticket-row" key={id}><span style={{whiteSpace:'pre-line'}}>{ADDONS[id]?.name || id} × {qty}</span><b>${(ADDONS[id]?.price || 0)*qty}</b></div>) : <div style={{color:'var(--ink-soft)',fontSize:13}}>No add-ons selected.</div>}
                  <div className="ticket-row"><span>Subtotal</span><b>${b.subtotal}</b></div>
                  {b.discountAmount > 0 && <div className="ticket-row"><span>Discount{b.discountCode ? ` (${b.discountCode})` : ''}</span><b>−${b.discountAmount}</b></div>}
                  <div className="ticket-row"><span>Total</span><b>${b.total}</b></div>

                  {(b.status === 'pending' || b.status === 'confirmed') && editingAddOnsId !== b.id && <button className="btn btn-primary" style={{marginTop:12}} onClick={()=>beginEditAddOns(b)}>Modify add-ons &amp; products</button>}
                  {editingAddOnsId === b.id && <div style={{marginTop:12}}>
                    {(sessionById(b.sessionTypeId)?.addOns || []).map((id)=>{const item=ADDONS[id];const qty=draftAddOns[id]||0;return <div key={id} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:10,alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--line)'}}><div><b style={{whiteSpace:'pre-line'}}>{item.name}</b><div style={{fontSize:12,color:'var(--ink-soft)'}}>${item.price} each</div></div><div style={{display:'flex',alignItems:'center',gap:8}}><button type="button" className="btn btn-ghost" onClick={()=>changeAddOn(id,qty-1)}>−</button><b>{qty}</b><button type="button" className="btn btn-ghost" onClick={()=>changeAddOn(id,qty+1)}>+</button></div></div>})}
                    <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}><button className="btn btn-ghost" disabled={savingAddOns} onClick={()=>setEditingAddOnsId(null)}>Cancel</button><button className="btn btn-primary" disabled={savingAddOns} onClick={()=>saveAddOns(b)}>{savingAddOns?'Saving…':'Save changes'}</button></div>
                  </div>}
                </section>
                {saveMessage && <div className="notice" style={{marginTop:12}}>{saveMessage}</div>}
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
                    <span style={{ fontSize: 12 }}>{(r.item as Bundle).activated ? (() => {
                      const b = r.item as Bundle;
                      const redeemed = (bookings || []).filter((bk) => bk.bundleParentId === b.id && bk.status !== 'cancelled').length;
                      const next = redeemed + 1;
                      if (next > 3) return 'All sessions completed';
                      return `Session ${next} of 3 ready to book`;
                    })() : 'Awaiting activation'}</span>
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
  const [siblingJoining, setSiblingJoining] = useState('');
  const [photoSharingConsent,setPhotoSharingConsent]=useState('');
  const [notes, setNotes] = useState('');
  const [setupPhotos, setSetupPhotos] = useState<{ file: File; previewUrl: string }[][]>([[],[],[]]);
  const [setupNotes, setSetupNotes] = useState<string[]>(['','','']);
  const [setupOutfitSources,setSetupOutfitSources]=useState<('mamamiyo'|'own'|null)[]>([null,null,null]);
  const [inspirationPhotos,setInspirationPhotos]=useState<{file:File;previewUrl:string}[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const bundleType = sessionById('bundle')!;
  const includedSetupCount = bundleType.referenceSetups || 1;
  const activeSetupCount = Math.min(3, includedSetupCount + (addOns.extraSetup || 0));

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
    if (!siblingJoining) { setError('Please tell us whether a sibling will be joining.'); return; }
    if (!photoSharingConsent) { setError('Please select a photo sharing preference.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      // Upload photos directly to Supabase
      const { uploadPhotoFromBrowser } = await import('@/lib/uploadClient');
      const setupSelections = await Promise.all(setupPhotos.slice(0,activeSetupCount).map(async(items,index)=>({slot:index+1,note:setupNotes[index].trim(),outfitSource:setupOutfitSources[index],referencePhotoUrls:await Promise.all(items.map(p=>uploadPhotoFromBrowser(p.file)))})));
      const referencePhotoUrls = setupSelections.flatMap(group=>group.referencePhotoUrls);
      const inspirationReferencePhotoUrls=await Promise.all(inspirationPhotos.map(photo=>uploadPhotoFromBrowser(photo.file)));
      const res = await fetch(`/api/bundles/${bundle.id}/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot: selectedSlot, addOns, referencePhotoUrls, setupSelectionCount:activeSetupCount, setupSelections, inspirationReferencePhotoUrls, notes, babyGender, siblingJoining, photoSharingConsent }),
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
                    {[['boy', '👦 Boy'], ['girl', '👧 Girl']].map(([val, label]) => (
                      <button key={val} type="button" className={`chip ${babyGender === val ? 'selected' : ''}`} onClick={() => setBabyGender(val)}>{label}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Will a sibling be joining the photoshoot?</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    {[['yes', 'Yes'], ['no', 'No']].map(([val, label]) => (
                      <button key={val} type="button" className={`chip ${siblingJoining === val ? 'selected' : ''}`} onClick={() => setSiblingJoining(val)}>{label}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 6 }}>Sibling participation is free. The additional family / grandparents add-on is charged separately.</div>
                </div>
                <div className="field">
                  <label>Setup choice — optional</label>
                  <div style={{fontSize:12,color:'var(--ink-soft)',marginBottom:8}}><b>One Setup = one outfit + one background setting.</b> Your package includes <b>{includedSetupCount} Setup</b>. <b>Each Additional Setup is $100.</b> References may come from MamaMiyo or anywhere else. Add up to 3 photos for the same Setup. <a href="https://www.mamamiyo-photography.com/" target="_blank" rel="noopener" style={{color:'var(--gold-deep)',fontWeight:700}}>View MamaMiyo Portfolio</a></div>
                  <div style={{display:'grid',gap:9}}>{[0,1,2].map(slotIndex=>{const slot=slotIndex+1;const included=slot<=includedSetupCount;const active=slot<=activeSetupCount;return <div key={slot} style={{border:'1.5px solid var(--line)',borderRadius:9,padding:10}}><div style={{display:'flex',justifyContent:'space-between'}}><b>Setup {slot}</b><span style={{fontSize:11,color:included?'var(--ink-soft)':'var(--rust)',fontWeight:700}}>{included?'Included':'Additional Setup ($100)'}</span></div>{!active?<button type="button" className="btn btn-ghost" style={{marginTop:8}} onClick={()=>setAddOns(a=>({...a,extraSetup:slot-includedSetupCount}))}>Add Setup {slot} · $100</button>:<><div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>{[{value:'mamamiyo',label:'MamaMiyo outfit'},{value:'own',label:'Own outfit'},{value:null,label:'Decide later'}].map(option=><button key={String(option.value)} type="button" className={`chip ${setupOutfitSources[slotIndex]===option.value?'selected':''}`} onClick={()=>setSetupOutfitSources(values=>values.map((value,index)=>index===slotIndex?(option.value===null?null:option.value==='own'?'own':'mamamiyo'):value))}>{option.label}</button>)}</div><input type="file" accept="image/*" multiple disabled={setupPhotos[slotIndex].length>=3} onChange={e=>{if(e.target.files){const room=3-setupPhotos[slotIndex].length;const added=Array.from(e.target.files).slice(0,room).map(file=>({file,previewUrl:URL.createObjectURL(file)}));setSetupPhotos(groups=>groups.map((items,index)=>index===slotIndex?[...items,...added]:items));}e.target.value='';}} style={{marginTop:8}}/><div style={{display:'flex',gap:7,marginTop:8,flexWrap:'wrap'}}>{setupPhotos[slotIndex].map((p,i)=><div key={p.previewUrl} style={{position:'relative',width:56,height:56,borderRadius:8,overflow:'hidden',border:'1.5px solid var(--line)'}}><img src={p.previewUrl} alt={`Setup ${slot} reference ${i+1}`} style={{width:'100%',height:'100%',objectFit:'cover'}}/><button type="button" onClick={()=>setSetupPhotos(groups=>groups.map((items,index)=>index===slotIndex?items.filter((_,photoIndex)=>photoIndex!==i):items))} style={{position:'absolute',top:2,right:2,width:16,height:16,borderRadius:'50%',background:'rgba(46,42,34,.75)',color:'#fff',border:'none',fontSize:10}}>×</button></div>)}</div><div style={{fontSize:11,color:'var(--ink-faint)',marginTop:4}}>{setupPhotos[slotIndex].length}/3 reference photos</div><input value={setupNotes[slotIndex]} maxLength={300} onChange={e=>setSetupNotes(notes=>notes.map((note,index)=>index===slotIndex?e.target.value:note))} placeholder="Outfit / Setup note (e.g. Client will bring this outfit)" style={{width:'100%',marginTop:8,padding:'8px 10px',border:'1.5px solid var(--line)',borderRadius:8,font:'inherit',fontSize:12}}/></>}</div>})}</div>
                </div>
                <div className="field">
                  <label>Inspirational Reference <span style={{color:'var(--ink-faint)',fontWeight:500}}>(Optional · up to 10 photos)</span></label>
                  <div style={{fontSize:12,color:'var(--ink-soft)',marginBottom:8}}>For poses, colours, props, composition or the overall feeling. These photos do not count as a Setup or change the price.</div>
                  <input type="file" accept="image/*" multiple disabled={inspirationPhotos.length>=10} onChange={event=>{const room=10-inspirationPhotos.length;const added=Array.from(event.target.files||[]).slice(0,room).map(file=>({file,previewUrl:URL.createObjectURL(file)}));setInspirationPhotos(items=>[...items,...added]);event.target.value='';}}/>
                  <div style={{display:'flex',gap:7,marginTop:8,flexWrap:'wrap'}}>{inspirationPhotos.map((photo,index)=><div key={photo.previewUrl} style={{position:'relative',width:56,height:56}}><img src={photo.previewUrl} alt={`Inspirational reference ${index+1}`} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:8}}/><button type="button" onClick={()=>setInspirationPhotos(items=>items.filter((_,itemIndex)=>itemIndex!==index))} style={{position:'absolute',right:1,top:1,border:0,borderRadius:99,background:'#3a2e28dd',color:'#fff'}}>×</button></div>)}</div>
                  <div style={{fontSize:11,color:'var(--ink-faint)',marginTop:4}}>{inspirationPhotos.length}/10 photos</div>
                </div>
                <div className="field">
                  <label>Notes (optional)</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know for this session?" style={{ width: '100%', minHeight: 56, border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }} />
                </div>
                <div className="field">
                  <label>May Mamamiyo Photography share photos from this session online?</label>
                  <div style={{display:'grid',gap:8,marginTop:6}}>{PHOTO_SHARING_OPTIONS.map(option=><button key={option.value} type="button" className={`chip ${photoSharingConsent===option.value?'selected':''}`} onClick={()=>setPhotoSharingConsent(option.value)} style={{textAlign:'left',justifyContent:'flex-start',whiteSpace:'normal'}}>{option.label}</button>)}</div>
                  <div style={{fontSize:11.5,color:'var(--ink-faint)',marginTop:6}}>Your choice will not affect your booking or package.</div>
                  <div style={{fontSize:11.5,color:'var(--ink-faint)',marginTop:3}}>By selecting an option, you confirm that you are authorised to give this permission.</div>
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




