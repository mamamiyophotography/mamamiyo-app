'use client';

import { useEffect, useMemo, useState } from 'react';
import { ADDONS, SESSION_TYPES } from '@/lib/constants';
import { fmtDatePretty, fmtTime12 } from '@/lib/format';
import { addMonths, CandidateSlot, MonthCalendar, startOfMonth } from '@/components/MonthCalendar';
import { uploadPhotoFromBrowser } from '@/lib/uploadClient';

export type EditableBooking = {
  id: string;
  sessionTypeId: string;
  sessionLabel: string;
  bundleSessionNumber?: number | null;
  date: string;
  startTime: string;
  endTime: string;
  isWeekend: boolean;
  addOns: Record<string, number>;
  address: string;
  notes: string;
  clientName: string;
  referencePhotoUrls?: string[];
  setupSelectionCount?: number;
  setupSelections?: {slot:number;referencePhotoUrls:string[];note?:string}[];
  setupChoiceNotes?: string;
};

export default function EditBookingModal({
  booking,
  onClose,
  onSaved,
}: {
  booking: EditableBooking;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const lockedBundleSession = booking.sessionTypeId === 'bundle' && (booking.bundleSessionNumber || 1) > 1;
  const [sessionTypeId, setSessionTypeId] = useState(booking.sessionTypeId);
  const [slots, setSlots] = useState<CandidateSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<CandidateSlot | null>({
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    isWeekend: booking.isWeekend,
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(booking.date);
  const [calMonth, setCalMonth] = useState(startOfMonth(new Date(`${booking.date}T00:00:00`)));
  const [addOns, setAddOns] = useState<Record<string, number>>(booking.addOns || {});
  const [address, setAddress] = useState(booking.address || '');
  const [siblingJoining, setSiblingJoining] = useState(
    booking.notes.match(/^Sibling joining:\s*(yes|no)$/im)?.[1]?.toLowerCase() || '',
  );
  const [notes, setNotes] = useState(
    (booking.notes || '').split('\n').filter((line) => !/^Sibling joining:/i.test(line.trim())).join('\n').trim(),
  );
  const initialGroups=booking.setupSelections?.length?booking.setupSelections:[{slot:1,referencePhotoUrls:booking.referencePhotoUrls||[],note:''}];
  const includedSetups=SESSION_TYPES.find(item=>item.id===booking.sessionTypeId)?.referenceSetups||1;
  const [setupCount,setSetupCount]=useState(Math.min(3,Math.max(includedSetups,booking.setupSelectionCount||includedSetups)));
  const [setupExisting,setSetupExisting]=useState<string[][]>([1,2,3].map(slot=>initialGroups.find(group=>group.slot===slot)?.referencePhotoUrls||[]));
  const [setupPending,setSetupPending]=useState<{file:File;previewUrl:string}[][]>([[],[],[]]);
  const [setupNotes,setSetupNotes]=useState<string[]>([1,2,3].map(slot=>initialGroups.find(group=>group.slot===slot)?.note||''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionType = SESSION_TYPES.find((item) => item.id === sessionTypeId)!;

  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true);
    fetch(`/api/availability?sessionType=${encodeURIComponent(sessionTypeId)}&excludeBookingId=${encodeURIComponent(booking.id)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load available dates.');
        let nextSlots = (data.slots || []) as CandidateSlot[];
        if (sessionTypeId === booking.sessionTypeId && !nextSlots.some((slot) =>
          slot.date === booking.date && slot.startTime === booking.startTime && slot.endTime === booking.endTime)) {
          nextSlots = [{
            date: booking.date,
            startTime: booking.startTime,
            endTime: booking.endTime,
            isWeekend: booking.isWeekend,
          }, ...nextSlots];
        }
        if (!cancelled) setSlots(nextSlots);
      })
      .catch((err) => { if (!cancelled) setError((err as Error).message); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [booking, sessionTypeId]);

  const slotsByDate = useMemo(() => {
    const grouped: Record<string, CandidateSlot[]> = {};
    slots.forEach((slot) => (grouped[slot.date] = [...(grouped[slot.date] || []), slot]));
    return grouped;
  }, [slots]);

  function changePackage(nextId: string) {
    const nextType = SESSION_TYPES.find((item) => item.id === nextId)!;
    setSessionTypeId(nextId);
    setSelectedSlot(null);
    setSelectedDate(null);
    setAddOns((current) => Object.fromEntries(
      Object.entries(current).filter(([id, qty]) => nextType.addOns.includes(id) && qty > 0),
    ));
    setError(null);
  }

  function setAddOn(id: string, qty: number) {
    setAddOns((current) => {
      const next = { ...current };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  }

  async function save() {
    if (!selectedSlot) {
      setError('Please select an available date and time.');
      return;
    }
    if (sessionType.location === 'home' && !address.trim()) {
      setError('Please enter the client’s home address.');
      return;
    }
    if (!siblingJoining) {
      setError('Please choose whether a sibling will be joining.');
      return;
    }
    const notesWithoutSibling = notes
      .split('\n')
      .filter((line) => !/^Sibling joining:/i.test(line.trim()))
      .join('\n')
      .trim();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bookings/${booking.id}/update-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionTypeId,
          date: selectedSlot.date,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
          addOns,
          address,
          notes: [`Sibling joining: ${siblingJoining}`, notesWithoutSibling].filter(Boolean).join('\n'),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the booking.');
      const setupSelections=await Promise.all([0,1,2].slice(0,setupCount).map(async index=>({slot:index+1,note:setupNotes[index].trim(),referencePhotoUrls:[...setupExisting[index],...await Promise.all(setupPending[index].map(item=>uploadPhotoFromBrowser(item.file)))]})));
      const setupResponse=await fetch(`/api/admin/bookings/${booking.id}/setup-choice`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({setupSelectionCount:setupCount,setupSelections,setupChoiceNotes:booking.setupChoiceNotes||''})});
      const setupData=await setupResponse.json();if(!setupResponse.ok)throw new Error(setupData.error||'Could not update Setup choices.');
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Edit booking" style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center',
      padding: 18, background: 'rgba(46,42,34,.58)', overflowY: 'auto',
    }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="card" style={{ width: 'min(720px, 100%)', maxHeight: 'calc(100vh - 36px)', overflowY: 'auto', margin: 0, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', marginBottom: 18 }}>
          <div>
            <div className="bookings-kicker">{booking.clientName}</div>
            <h2 style={{ margin: 0 }}>Edit booking</h2>
          </div>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Close</button>
        </div>

        {error && <div className="notice warn" style={{ margin: '0 0 16px' }}>{error}</div>}

        <div className="field">
          <label>Package</label>
          <select value={sessionTypeId} disabled={lockedBundleSession} onChange={(event) => changePackage(event.target.value)}>
            {SESSION_TYPES.map((item) => <option key={item.id} value={item.id}>{item.name} — ${item.price}</option>)}
          </select>
          {lockedBundleSession && <div style={{ marginTop: 6, color: 'var(--ink-faint)', fontSize: 12 }}>Bundle sessions 2 and 3 must remain part of the First Year Bundle.</div>}
        </div>

        <div style={{ margin: '20px 0' }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Date and time</div>
          {loadingSlots ? <div style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Loading available dates…</div> : (
            <div className="edit-booking-schedule">
              <MonthCalendar
                monthDate={calMonth}
                slotsByDate={slotsByDate}
                selectedDate={selectedDate}
                onNav={(direction) => setCalMonth((current) => addMonths(current, direction))}
                onSelectDay={(date) => { setSelectedDate(date); setSelectedSlot(null); }}
              />
              <div>
                <div style={{ color: 'var(--ink-soft)', fontSize: 12, marginBottom: 8 }}>
                  {selectedDate ? fmtDatePretty(selectedDate) : 'Choose a date'}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(selectedDate ? slotsByDate[selectedDate] || [] : []).map((slot) => (
                    <button key={`${slot.date}-${slot.startTime}`} type="button"
                      className={`chip ${selectedSlot?.date === slot.date && selectedSlot?.startTime === slot.startTime ? 'selected' : ''}`}
                      onClick={() => setSelectedSlot(slot)}>
                      {fmtTime12(slot.startTime)}{slot.isWeekend ? ' +$50' : ''}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ fontWeight: 700, marginBottom: 8 }}>Add-ons</div>
        <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
          {sessionType.addOns.map((id) => {
            const addOn = ADDONS[id];
            const qty = addOns[id] || 0;
            return (
              <div key={id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                <div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{addOn.name}</div><div style={{ color: 'var(--ink-faint)', fontSize: 12 }}>${addOn.price} each</div></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className="btn btn-ghost" type="button" style={{ padding: '5px 10px' }} onClick={() => setAddOn(id, qty - 1)}>−</button>
                  <strong style={{ minWidth: 18, textAlign: 'center' }}>{qty}</strong>
                  <button className="btn btn-ghost" type="button" style={{ padding: '5px 10px' }} onClick={() => setAddOn(id, qty + 1)}>+</button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{fontWeight:700,margin:'20px 0 6px'}}>Setup choices</div>
        <div style={{fontSize:12,color:'var(--ink-soft)',marginBottom:10}}><b>One Setup = one outfit + one background setting.</b> This package includes {includedSetups} {includedSetups===1?'Setup':'Setups'}; each Additional Setup is $100. Each Setup can contain up to 3 reference photos and its own outfit note.</div>
        <div style={{display:'grid',gap:10,marginBottom:18}}>{[0,1,2].map(index=>{const slot=index+1;const active=slot<=setupCount;const included=slot<=includedSetups;return <div key={slot} style={{border:'1.5px solid var(--line)',borderRadius:9,padding:10}}><div style={{display:'flex',justifyContent:'space-between'}}><b>Setup {slot}</b><span style={{fontSize:11,fontWeight:700,color:included?'var(--ink-soft)':'var(--rust)'}}>{included?'Included':'Additional Setup ($100)'}</span></div>{!active?<button type="button" className="btn btn-ghost" style={{marginTop:8}} onClick={()=>setSetupCount(slot)}>Add Setup {slot} · $100</button>:<><div style={{display:'flex',gap:7,marginTop:8,flexWrap:'wrap'}}>{setupExisting[index].map(url=><div key={url} style={{position:'relative',width:58,height:58}}><img src={url} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:7}}/><button type="button" onClick={()=>setSetupExisting(groups=>groups.map((items,i)=>i===index?items.filter(item=>item!==url):items))} style={{position:'absolute',right:1,top:1,border:0,borderRadius:99,background:'#3a2e28dd',color:'#fff'}}>×</button></div>)}{setupPending[index].map((item,photoIndex)=><div key={item.previewUrl} style={{position:'relative',width:58,height:58}}><img src={item.previewUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:7}}/><button type="button" onClick={()=>setSetupPending(groups=>groups.map((items,i)=>i===index?items.filter((_,p)=>p!==photoIndex):items))} style={{position:'absolute',right:1,top:1,border:0,borderRadius:99,background:'#3a2e28dd',color:'#fff'}}>×</button></div>)}</div><label className="btn btn-ghost" style={{display:'inline-flex',marginTop:8}}>Add reference photos<input hidden type="file" accept="image/*" multiple disabled={setupExisting[index].length+setupPending[index].length>=3} onChange={event=>{const room=3-setupExisting[index].length-setupPending[index].length;const added=Array.from(event.target.files||[]).slice(0,room).map(file=>({file,previewUrl:URL.createObjectURL(file)}));setSetupPending(groups=>groups.map((items,i)=>i===index?[...items,...added]:items));event.target.value='';}}/></label><input value={setupNotes[index]} maxLength={300} onChange={event=>setSetupNotes(values=>values.map((value,i)=>i===index?event.target.value:value))} placeholder="Outfit / Setup note (e.g. Client will bring this outfit)" style={{width:'100%',marginTop:8,padding:'8px 10px',border:'1.5px solid var(--line)',borderRadius:8}}/>{!included&&slot===setupCount&&<button type="button" className="btn btn-ghost" style={{marginTop:8}} onClick={()=>setSetupCount(count=>count-1)}>Remove Additional Setup</button>}</>}</div>})}</div>

        {sessionType.location === 'home' && <div className="field"><label>Client’s home address</label><textarea value={address} onChange={(event) => setAddress(event.target.value)} /></div>}
        <div className="field">
          <label>Will a sibling be joining the photoshoot?</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {[['yes', 'Yes'], ['no', 'No']].map(([value, label]) => (
              <button key={value} type="button" className={`chip ${siblingJoining === value ? 'selected' : ''}`} onClick={() => setSiblingJoining(value)}>{label}</button>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 6 }}>Sibling participation is free. The additional family / grandparents add-on is charged separately.</div>
        </div>
        <div className="field"><label>Notes</label><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></div>

        {selectedSlot && <div className="notice" style={{ marginBottom: 16 }}>
          New session: <strong>{sessionType.name}</strong><br />
          {fmtDatePretty(selectedSlot.date)} at {fmtTime12(selectedSlot.startTime)}
          {selectedSlot.isWeekend ? ' · Weekend/PH surcharge applies' : ''}<br />
          Pricing and the remaining balance will be recalculated automatically.
        </div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" type="button" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" disabled={saving || !selectedSlot} onClick={save}>
            {saving ? 'Saving…' : 'Save changes & email client'}
          </button>
        </div>
      </div>
    </div>
  );
}
