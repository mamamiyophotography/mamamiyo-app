'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { SESSION_TYPES, ADDONS, SessionType } from '@/lib/constants';
import { computeBookingPricing } from '@/lib/pricing';
import { fmtDatePretty, fmtTime12 } from '@/lib/format';
import { MonthCalendar, CandidateSlot, startOfMonth, addMonths, fmtDateISO } from '@/components/MonthCalendar';

type Step = 'package' | 'calendar' | 'information' | 'setup' | 'addons' | 'review' | 'result';
const BOOKING_STEPS: {id:Exclude<Step,'result'>;label:string}[] = [
  {id:'package',label:'Package'},{id:'calendar',label:'Date & Time'},{id:'information',label:'Your Information'},
  {id:'setup',label:'Choose Your Setup (you may decide later)'},{id:'addons',label:'Choose Add-ons'},{id:'review',label:'Review & Confirm'},
];

const PRODUCT_GROUPS = [
  {key:'album',name:'Layflat Photo Album',detail:'20 pages · up to 30 images',bonus:'+20 Bonus Further Retouch',ids:['album8x8','album10x10','album12x12']},
  {key:'canvas',name:'Canvas',detail:'Ready-to-display wall art',bonus:'+5 Bonus Further Retouch',ids:['canvas11x14','canvas16x24']},
  {key:'plaque',name:'Wooden / Crystal Plaque',detail:'Tabletop display',bonus:'+2 Bonus Further Retouch',ids:['plaque5x7','plaque6x8']},
] as const;

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
  const [productVariants,setProductVariants]=useState<Record<string,string>>({album:'album8x8',canvas:'canvas11x14',plaque:'plaque5x7'});
  const [firstName,setFirstName]=useState('');
  const [lastName,setLastName]=useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+65');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [babyGender, setBabyGender] = useState('');
  const [siblingJoining, setSiblingJoining] = useState('');
  const [siblingCount,setSiblingCount]=useState('');
  const [notes, setNotes] = useState('');
  const [setupPhotos, setSetupPhotos] = useState<{ file: File; previewUrl: string }[][]>([[], [], []]);
  const [setupNotes, setSetupNotes] = useState<string[]>(['', '', '']);
  const [setupOutfitSources,setSetupOutfitSources]=useState<('mamamiyo'|'own'|null)[]>([null,null,null]);
  const [inspirationPhotos,setInspirationPhotos]=useState<{file:File;previewUrl:string}[]>([]);
  const [stepErrors,setStepErrors]=useState<Record<string,string>>({});
  const [uploading, setUploading] = useState(false);

  const [discountInput, setDiscountInput] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number; description: string } | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ booking: { ref: string; status: string; date: string; startTime: string; sessionLabel: string; location: string; depositAmount: number }; payNowPayload: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const sessionType: SessionType | undefined = SESSION_TYPES.find((s) => s.id === sessionTypeId);
  const includedSetupCount = sessionType?.referenceSetups || 1;
  const additionalSetupKey = sessionType?.id === 'maternity' ? 'extraOutfit' : 'extraSetup';
  const activeSetupCount = Math.min(3, includedSetupCount + (addOns[additionalSetupKey] || 0));

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
    setSetupPhotos([[], [], []]);
    setSetupNotes(['', '', '']);
    setSetupOutfitSources([null,null,null]);
    setInspirationPhotos([]);
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

  async function handlePhotoUpload(slotIndex: number, files: FileList | null) {
    if (!files || !files.length) return;
    const room = 3 - setupPhotos[slotIndex].length;
    if (room <= 0) return;
    const toAdd = Array.from(files).slice(0, room);
    setSetupPhotos((prev) => prev.map((items, index) => index === slotIndex ? [...items, ...toAdd.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))] : items));
  }

  function removePhoto(slotIndex: number, photoIndex: number) {
    setSetupPhotos((prev) => prev.map((items, index) => index === slotIndex ? items.filter((_, i) => i !== photoIndex) : items));
  }

  function handleInspirationUpload(files:FileList|null){
    if(!files?.length)return;
    const toAdd=Array.from(files).slice(0,10-inspirationPhotos.length);
    setInspirationPhotos(items=>[...items,...toAdd.map(file=>({file,previewUrl:URL.createObjectURL(file)}))]);
  }

  function goNext(){
    setStepErrors({});
    if(step==='package'){if(!sessionType){setStepErrors({package:'Choose a package to continue.'});return;}setStep('calendar');return;}
    if(step==='calendar'){if(!selectedSlot){setStepErrors({calendar:'Choose a date and time to continue.'});return;}setStep('information');return;}
    if(step==='information'){if(missingFields.length){setStepErrors({information:`Please complete: ${missingFields.join(', ')}.`});return;}setStep('setup');return;}
    if(step==='setup'){setStep('addons');return;}
    if(step==='addons')setStep('review');
  }
  function goBack(){const order=BOOKING_STEPS.map(item=>item.id);const index=order.indexOf(step as Exclude<Step,'result'>);if(index>0)setStep(order[index-1]);}

  const missingFields: string[] = [];
  if (!firstName.trim()) missingFields.push('First name');
  if (!lastName.trim()) missingFields.push('Last name');
  if (!email.trim()) missingFields.push('Email');
  if (!phone.trim()) missingFields.push('WhatsApp number');
  if (sessionType?.id !== 'maternity' && !babyGender.trim()) missingFields.push("Baby's gender");
  if (!siblingJoining) missingFields.push('Sibling attendance');
  if(siblingJoining==='yes'&&(!Number.isSafeInteger(Number(siblingCount))||Number(siblingCount)<1))missingFields.push('Number of siblings');
  if (sessionType?.location === 'home' && !address.trim()) missingFields.push('Home address');
  const readyForReview = !!selectedSlot && missingFields.length === 0;

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
    if (missingFields.length > 0) return; // validation shown inline
    setSubmitting(true);
    setSubmitError(null);
    try {
      setUploading(true);
      // Upload directly from browser to Supabase Storage — bypasses Vercel's
      // 4.5MB request body limit entirely since files go straight to Supabase.
      const { uploadPhotoFromBrowser } = await import('@/lib/uploadClient');
      const setupSelections = await Promise.all(setupPhotos.slice(0, activeSetupCount).map(async (items, index) => ({slot:index + 1,note:setupNotes[index].trim(),outfitSource:setupOutfitSources[index],referencePhotoUrls:await Promise.all(items.map((p) => uploadPhotoFromBrowser(p.file)))})));
      const referencePhotoUrls = setupSelections.flatMap(group => group.referencePhotoUrls);
      const inspirationReferencePhotoUrls=await Promise.all(inspirationPhotos.map(photo=>uploadPhotoFromBrowser(photo.file)));
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
          siblingJoining,
          siblingCount:siblingJoining==='yes'?Number(siblingCount):0,
          setupSelectionCount: activeSetupCount,
          setupSelections,
          inspirationReferencePhotoUrls,
          referencePhotoUrls: referencePhotoUrls,
          address,
          discountCode: appliedDiscount?.code || null,
          clientName: `${firstName.trim()} ${lastName.trim()}`,
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
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:5,margin:'18px 0 22px'}}>
        {BOOKING_STEPS.map((item,index)=>{const current=BOOKING_STEPS.findIndex(s=>s.id===step);return <div key={item.id}><div style={{height:5,borderRadius:8,background:index<=current?'var(--sage)':'var(--line)'}}/><div style={{fontSize:10,marginTop:5,textAlign:'center',color:index===current?'var(--ink)':'var(--ink-faint)',fontWeight:index===current?700:400}}>{index+1}</div></div>})}
      </div>
      <div style={{fontSize:12,textTransform:'uppercase',letterSpacing:.7,color:'var(--sage)',fontWeight:700,marginBottom:8}}>Step {Math.max(1,BOOKING_STEPS.findIndex(s=>s.id===step)+1)} of 6</div>
      <h2 style={{fontSize:22,margin:'0 0 14px'}}>{BOOKING_STEPS.find(s=>s.id===step)?.label}</h2>

      {/* Step 1: package */}
      <div style={{display:step==='package'?'block':'none'}}>
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
      </div>
      {step==='package'&&<WizardNav next={goNext} nextDisabled={!sessionType} error={stepErrors.package}/>}

      {/* Step 2: calendar */}
      {sessionType && step==='calendar' && (
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
          <WizardNav back={goBack} next={goNext} nextDisabled={!selectedSlot} error={stepErrors.calendar}/>
        </div>
      )}

      {/* Step 3: add-ons + details */}
      {sessionType && selectedSlot && ['information','setup','addons'].includes(step) && (
        <div style={{ marginTop: 24 }}>
          {step==='addons'&&<h3 style={{ fontSize: 15 }}>Choose Add-ons</h3>}
          {step==='addons'&&(
          <div className="card">
            <a className="btn btn-ghost" href="https://www.mamamiyo-photography.com/products" target="_blank" rel="noopener" style={{display:'inline-flex',textDecoration:'none',marginBottom:10}}>View MamaMiyo Products</a>
            {selectedSlot.isWeekend && (
              <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--rust-pale)', padding: '10px 12px', borderRadius: 8, marginBottom: 8, fontSize: 13.5 }}>
                <span>Weekend / PH surcharge — applies automatically</span>
                <b style={{ color: 'var(--rust)' }}>+$50</b>
              </div>
            )}
            {/* Service add-ons: setup & headcount */}
            {sessionType.addOns.filter(id => ['extraSetup','extraOutfit','headcount'].includes(id)).map((id) => (
              <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px dashed var(--line)' }}>
                <span>
                  {ADDONS[id].name} <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>${ADDONS[id].price} each</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button type="button" onClick={() => setAddOns((a) => ({ ...a, [id]: Math.max(0, (a[id] || 0) - 1) }))} style={{ width: 26, height: 26, borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)' }}>−</button>
                  <span style={{ minWidth: 16, textAlign: 'center', fontWeight: 700 }}>{addOns[id] || 0}</span>
                  <button type="button" onClick={() => setAddOns((a) => ({ ...a, [id]: ['extraSetup','extraOutfit'].includes(id) ? Math.min(3-includedSetupCount,(a[id]||0)+1) : (a[id]||0)+1 }))} style={{ width: 26, height: 26, borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--paper)' }}>+</button>
                </div>
              </div>
            ))}
            {/* Products: photo albums, canvas, plaques */}
            <div style={{ marginTop: 10, marginBottom: 4, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)', letterSpacing: 0.5 }}>
              Products — <a href="https://www.mamamiyo-photography.com/products" target="_blank" rel="noopener" style={{ color: 'var(--gold-deep)', fontWeight: 400, textTransform: 'none' }}>view all options</a>
            </div>
            {PRODUCT_GROUPS.map(group=>{const id=productVariants[group.key];const quantity=addOns[id]||0;return <div key={group.key} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,padding:'12px 0',borderBottom:'1px dashed var(--line)',alignItems:'center'}}>
              <div style={{minWidth:0}}><div style={{fontWeight:700,fontSize:14}}>{group.name}</div><div style={{fontSize:11.5,color:'var(--ink-soft)',marginTop:2}}>{group.detail}</div><div style={{fontSize:11.5,color:'var(--sage)',fontWeight:700,marginTop:2}}>{group.bonus}</div><select value={id} onChange={event=>{const nextId=event.target.value;setProductVariants(current=>({...current,[group.key]:nextId}));setAddOns(current=>{const next={...current};const qty=group.ids.reduce((sum,item)=>sum+(next[item]||0),0);group.ids.forEach(item=>delete next[item]);if(qty)next[nextId]=qty;return next;});}} style={{marginTop:7,width:'100%',maxWidth:250,padding:'7px 9px',border:'1.5px solid var(--line)',borderRadius:8,background:'var(--paper)'}}>{group.ids.map(optionId=><option key={optionId} value={optionId}>{ADDONS[optionId].name.replace(group.name,'').trim().replace(/^·\s*/, '')}</option>)}</select></div>
              <div style={{display:'grid',justifyItems:'end',gap:8}}><strong style={{fontSize:20,color:'var(--gold-deep)'}}>${ADDONS[id].price}</strong><div style={{display:'flex',alignItems:'center',gap:10}}><button type="button" onClick={()=>setAddOns(current=>({...current,[id]:Math.max(0,(current[id]||0)-1)}))} style={{width:28,height:28,borderRadius:8,border:'1.5px solid var(--line)',background:'var(--paper)'}}>−</button><strong style={{minWidth:16,textAlign:'center'}}>{quantity}</strong><button type="button" onClick={()=>setAddOns(current=>({...current,[id]:(current[id]||0)+1}))} style={{width:28,height:28,borderRadius:8,border:'1.5px solid var(--line)',background:'var(--paper)'}}>+</button></div></div>
            </div>})}
          </div>
          )}

          {step==='information'&&<>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><div className="field"><label>First name<span style={{color:'var(--rust)',fontWeight:700}}> (Compulsory)</span></label><input value={firstName} onChange={event=>setFirstName(event.target.value)} autoComplete="given-name"/></div><div className="field"><label>Last name<span style={{color:'var(--rust)',fontWeight:700}}> (Compulsory)</span></label><input value={lastName} onChange={event=>setLastName(event.target.value)} autoComplete="family-name"/></div></div>
          <div className="field"><label>Email<span style={{ color: 'var(--rust)', fontWeight: 700 }}> (Compulsory)</span></label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" /></div>
          <div className="field">
            <label>WhatsApp number<span style={{ color: 'var(--rust)', fontWeight: 700 }}> (Compulsory)</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="+65" style={{ width: 80, flexShrink: 0 }} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9123 4567" style={{ flex: 1 }} />
            </div>
          </div>
          {sessionType.location === 'home' && (
            <div className="field">
              <label>Home address<span style={{ color: 'var(--rust)', fontWeight: 700 }}> (Compulsory)</span></label>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Unit number, street, postal code" style={{ minHeight: 56 }} />
            </div>
          )}
          </>}
          {step==='setup'&&<>
          <div className="field">
            <div className="notice" style={{fontSize:12,lineHeight:1.55,marginBottom:10}}><p style={{margin:'0 0 8px'}}><b>One Setup = one outfit + one background setting.</b></p><p style={{margin:'0 0 8px'}}>Your package includes <b>{includedSetupCount} {includedSetupCount===1?'Setup':'Setups'}</b>. Each Additional Setup is <b>$100</b>.</p><p style={{margin:'0 0 8px'}}>Please choose your preferred Setup from the <a href={sessionType.id==='maternity'?'https://www.mamamiyo-photography.com/sensual-maternity/':sessionType.id==='newborn'?'https://www.mamamiyo-photography.com/cutie-newborn':'https://www.mamamiyo-photography.com/'} target="_blank" rel="noopener" style={{color:'var(--gold-deep)',fontWeight:700}}>MamaMiyo Photography Portfolio here</a> and upload screenshots.</p><p style={{margin:0}}>You may bring your own outfit. Please add a note in advance; its suitability is subject to fit, safety, styling and the backgrounds or props available in the studio.</p></div>
            <div style={{ display: 'grid', gap: 10 }}>
              {[0,1,2].map((slotIndex) => { const slot=slotIndex+1; const included=slot<=includedSetupCount; const active=slot<=activeSetupCount; return <div key={slot} style={{ border:'1.5px solid var(--line)',borderRadius:10,padding:12,background:active?'var(--paper)':'#f6f2ee' }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><b>Setup {slot}</b><span style={{fontSize:11.5,color:included?'var(--ink-soft)':'var(--rust)',fontWeight:700}}>{included?'Included':'Additional Setup ($100)'}</span></div>
                {!active ? <button type="button" className="btn btn-ghost" style={{marginTop:9}} onClick={()=>setAddOns(a=>({...a,[additionalSetupKey]:slot-includedSetupCount}))}>Add Setup {slot} · $100</button> : <>
                  <div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:9}}>{[{value:'mamamiyo',label:'MamaMiyo outfit'},{value:'own',label:'Own outfit'},{value:null,label:'Decide later'}].map(option=><button key={String(option.value)} type="button" className={`chip ${setupOutfitSources[slotIndex]===option.value?'selected':''}`} onClick={()=>setSetupOutfitSources(values=>values.map((value,index)=>index===slotIndex?option.value as 'mamamiyo'|'own'|null:value))}>{option.label}</button>)}</div>
                  <input type="file" accept="image/*" multiple disabled={setupPhotos[slotIndex].length>=3} onChange={(e)=>{handlePhotoUpload(slotIndex,e.target.files);e.target.value='';}} style={{marginTop:9}}/>
                  <div style={{display:'flex',gap:8,marginTop:9,flexWrap:'wrap'}}>{setupPhotos[slotIndex].map((p,i)=><div key={p.previewUrl} style={{position:'relative',width:64,height:64,borderRadius:9,overflow:'hidden',border:'1.5px solid var(--line)'}}><img src={p.previewUrl} alt={`Setup ${slot} reference ${i+1}`} style={{width:'100%',height:'100%',objectFit:'cover'}}/><button type="button" onClick={()=>removePhoto(slotIndex,i)} style={{position:'absolute',top:2,right:2,width:18,height:18,borderRadius:'50%',background:'rgba(46,42,34,.75)',color:'#fff',border:'none',fontSize:11}}>×</button></div>)}</div>
                  <div style={{fontSize:11.5,color:'var(--ink-faint)',marginTop:6}}>{setupPhotos[slotIndex].length}/3 reference photos</div>
                  <input value={setupNotes[slotIndex]} maxLength={300} onChange={e=>setSetupNotes(notes=>notes.map((note,index)=>index===slotIndex?e.target.value:note))} placeholder="Outfit / Setup note (e.g. Client will bring this outfit)" style={{width:'100%',marginTop:8,padding:'8px 10px',border:'1.5px solid var(--line)',borderRadius:8,font:'inherit',fontSize:12}}/>
                  {!included&&slot===activeSetupCount&&<button type="button" className="btn btn-ghost" style={{marginTop:8}} onClick={()=>{setAddOns(a=>({...a,[additionalSetupKey]:Math.max(0,(a[additionalSetupKey]||0)-1)}));setSetupPhotos(groups=>groups.map((items,index)=>index===slotIndex?[]:items));}}>Remove Additional Setup</button>}
                </>}
              </div>;})}
            </div>
          </div>
          <div className="field"><label>Inspirational Reference <span style={{color:'var(--ink-faint)',fontWeight:500}}>(Optional · up to 10 photos)</span></label><div className="notice" style={{marginBottom:9}}>For poses, colours, props, composition or the overall feeling. These photos do not count as a Setup and do not change the price.</div><input type="file" accept="image/*" multiple disabled={inspirationPhotos.length>=10} onChange={event=>{handleInspirationUpload(event.target.files);event.target.value='';}}/><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:9}}>{inspirationPhotos.map((photo,index)=><div key={photo.previewUrl} style={{position:'relative',width:64,height:64,borderRadius:9,overflow:'hidden',border:'1.5px solid var(--line)'}}><img src={photo.previewUrl} alt={`Inspirational reference ${index+1}`} style={{width:'100%',height:'100%',objectFit:'cover'}}/><button type="button" onClick={()=>setInspirationPhotos(items=>items.filter((_,itemIndex)=>itemIndex!==index))} style={{position:'absolute',top:2,right:2,width:18,height:18,borderRadius:'50%',background:'rgba(46,42,34,.75)',color:'#fff',border:'none'}}>×</button></div>)}</div><div style={{fontSize:11.5,color:'var(--ink-faint)',marginTop:6}}>{inspirationPhotos.length}/10 photos</div></div>
          </>}
          {step==='information'&&<>
          {sessionType.id !== 'maternity' && (
            <div className="field">
              <label>Baby's gender<span style={{ color: 'var(--rust)', fontWeight: 700 }}> (Compulsory)</span></label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {[['boy', '👦 Boy'], ['girl', '👧 Girl']].map(([val, label]) => (
                  <button key={val} type="button" className={`chip ${babyGender === val ? 'selected' : ''}`} onClick={() => setBabyGender(val)}>{label}</button>
                ))}
              </div>
            </div>
          )}
          <div className="field">
            <label>Will a sibling be joining the photoshoot?<span style={{ color: 'var(--rust)', fontWeight: 700 }}> (Compulsory)</span></label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {[['yes', 'Yes'], ['no', 'No']].map(([val, label]) => (
                <button key={val} type="button" className={`chip ${siblingJoining === val ? 'selected' : ''}`} onClick={() => {setSiblingJoining(val);if(val==='no')setSiblingCount('');}}>{label}</button>
              ))}
            </div>
            {siblingJoining==='yes'&&<div style={{marginTop:9,maxWidth:220}}><label>How many siblings?</label><input type="number" min="1" step="1" value={siblingCount} onChange={event=>setSiblingCount(event.target.value)} placeholder="1"/></div>}
            <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 6 }}>Sibling participation is free. The additional family / grandparents add-on is charged separately.</div>
          </div>
          <div className="field"><label>Notes (optional)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know?" /></div>
          </>}
          {step==='information'&&<WizardNav back={goBack} next={goNext} error={stepErrors.information}/>}
          {step==='setup'&&<WizardNav back={goBack} next={goNext}/>}
          {step==='addons'&&<><div className="card" style={{marginTop:14}}><div className="ticket-row"><span>Additional charges</span><b>${pricing ? pricing.total-sessionType.price : 0}</b></div><div className="ticket-total"><span>Estimated total</span><span className="amt">${pricing?.total||sessionType.price}</span></div></div><WizardNav back={goBack} next={goNext}/></>}
        </div>
      )}

      {/* Step 4: review */}
      {sessionType && selectedSlot && pricing && step==='review' && (
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

          <div className="card booking-review-card">
            {/* Session details */}
            <div className="ticket-row"><span>Package <button type="button" onClick={()=>setStep('package')} style={{border:0,background:'none',color:'var(--gold-deep)',textDecoration:'underline'}}>Edit</button></span><b>{sessionType.name}</b></div>
            <div className="ticket-row"><span>Date &amp; time <button type="button" onClick={()=>setStep('calendar')} style={{border:0,background:'none',color:'var(--gold-deep)',textDecoration:'underline'}}>Edit</button></span><b>{fmtDatePretty(selectedSlot.date)}, {fmtTime12(selectedSlot.startTime)}</b></div>
            <div className="ticket-row"><span>Your information <button type="button" onClick={()=>setStep('information')} style={{border:0,background:'none',color:'var(--gold-deep)',textDecoration:'underline'}}>Edit</button></span><b>{firstName} {lastName}</b></div>
            <div className="ticket-row"><span>Setups <button type="button" onClick={()=>setStep('setup')} style={{border:0,background:'none',color:'var(--gold-deep)',textDecoration:'underline'}}>Edit</button></span><b>{activeSetupCount} · {inspirationPhotos.length} inspiration</b></div>
            <div className="ticket-row"><span>Add-ons <button type="button" onClick={()=>setStep('addons')} style={{border:0,background:'none',color:'var(--gold-deep)',textDecoration:'underline'}}>Edit</button></span><b>{Object.values(addOns).reduce((sum,q)=>sum+q,0)}</b></div>
            <div className="ticket-row"><span>Sibling joining</span><b>{siblingJoining === 'yes' ? `Yes · ${siblingCount}` : 'No'}</b></div>

            {sessionType.isBundle ? (<>
              {/* Bundle: deposit due now — surcharge on session balance, shown in schedule */}
              <div style={{ borderTop: '1px dashed var(--line)', margin: '10px 0' }} />
              <div className="ticket-total" style={{ marginTop: 0, marginBottom: 12 }}>
                <span style={{ fontWeight: 700 }}>Deposit due now</span>
                <span className="amt">${pricing.depositAmount}</span>
              </div>
              <div style={{ padding: '12px 14px', background: 'var(--cream)', borderRadius: 8, border: '1px dashed var(--line)', fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-soft)' }}>Bundle Payment Schedule</div>
                <div style={{ lineHeight: 2, color: 'var(--ink)' }}>
                  <div>Deposit to secure booking: <b>$100</b></div>
                  <div>Balance after Session 1: <b>$330</b></div>
                  <div>Balance after Session 2: <b>$330</b></div>
                  <div>Balance after Session 3: <b>$328</b></div>
                  <div style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 6 }}>Total: <b>$1,088</b></div>
                </div>
              </div>
            </>) : (<>
              {/* Non-bundle: full price breakdown */}
              <div style={{ borderTop: '1px dashed var(--line)', margin: '10px 0' }} />
              <div className="ticket-row"><span>Session price</span><b>${pricing.sessionPrice}</b></div>
              {Object.entries(addOns).filter(([, q]) => q > 0).map(([id, q]) => (
                <div className="ticket-row" key={id}><span>{ADDONS[id].name} ×{q}</span><b>+${ADDONS[id].price * q}</b></div>
              ))}
              {pricing.weekendFee > 0 && <div className="ticket-row"><span>Weekend / PH surcharge</span><b>+${pricing.weekendFee}</b></div>}
              {pricing.discountAmount > 0 && <div className="ticket-row" style={{ color: 'var(--sage)' }}><span>Discount ({appliedDiscount?.code})</span><b style={{ color: 'var(--sage)' }}>−${pricing.discountAmount}</b></div>}
              <div style={{ borderTop: '1.5px solid var(--ink)', margin: '10px 0' }} />
              <div className="ticket-row" style={{ fontWeight: 700 }}><span>Total</span><b>${pricing.total}</b></div>
              <div style={{ borderTop: '1px dashed var(--line)', margin: '14px 0 10px' }} />
              <div className="ticket-total" style={{ marginTop: 0, marginBottom: 8 }}><span style={{ fontWeight: 700 }}>Deposit due now</span><span className="amt">${pricing.depositAmount}</span></div>
              <div className="ticket-row" style={{ color: 'var(--ink-soft)' }}><span>Balance due after session</span><b style={{ color: 'var(--ink-soft)' }}>${pricing.balanceDue}</b></div>
            </>)}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:16}}><button type="button" className="btn btn-ghost" onClick={goBack}>Back</button><button className="btn btn-primary" disabled={submitting} onClick={submitBooking}>
            {submitting ? (uploading ? 'Uploading photos…' : 'Creating booking…') : 'Generate payment QR'}
          </button></div>
          {missingFields.length > 0 && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--rust-pale)', borderRadius: 8, border: '1px solid #e7c3a8' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--rust)', marginBottom: 4 }}>Please fill in the following before continuing:</div>
              {missingFields.map((f) => (
                <div key={f} style={{ fontSize: 13, color: 'var(--rust)', paddingLeft: 8 }}>• {f}</div>
              ))}
            </div>
          )}
          {submitError && <div className="error-text">{submitError}</div>}
        </div>
      )}
    </div>
  );
}

function WizardNav({back,next,nextDisabled,error}:{back?:()=>void;next:()=>void;nextDisabled?:boolean;error?:string}){
  return <div style={{marginTop:22}}>{error&&<div className="error-text" style={{marginBottom:10}}>{error}</div>}<div style={{display:'grid',gridTemplateColumns:back?'1fr 1fr':'1fr',gap:10}}>{back&&<button type="button" className="btn btn-ghost" onClick={back}>Back</button>}<button type="button" className="btn btn-primary" disabled={nextDisabled} onClick={next}>Next Step</button></div></div>;
}
