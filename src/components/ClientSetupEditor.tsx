'use client';

import { useState } from 'react';
import { uploadPhotoFromBrowser } from '@/lib/uploadClient';

type Setup = { slot:number; referencePhotoUrls:string[]; note?:string; outfitSource?:string|null };
type Booking = { id:string; setupSelections?:Setup[]; referencePhotoUrls?:string[]; inspirationReferencePhotoUrls?:string[] };
type Pending = { file:File; preview:string };

export function ClientSetupEditor({ booking, email, setupCount, onSaved }: { booking:Booking; email:string; setupCount:number; onSaved:(booking:any)=>void }) {
  const legacy = booking.setupSelections?.length ? booking.setupSelections : [{ slot:1, referencePhotoUrls:booking.referencePhotoUrls || [] }];
  const count = Math.max(1, Math.min(3, setupCount));
  const [editing,setEditing]=useState(false);
  const [existing,setExisting]=useState<string[][]>(()=>Array.from({length:count},(_,i)=>legacy[i]?.referencePhotoUrls || []));
  const [pending,setPending]=useState<Pending[][]>(()=>Array.from({length:count},()=>[]));
  const [notes,setNotes]=useState<string[]>(()=>Array.from({length:count},(_,i)=>legacy[i]?.note || ''));
  const [outfits,setOutfits]=useState<(string|null)[]>(()=>Array.from({length:count},(_,i)=>legacy[i]?.outfitSource || null));
  const [inspirationExisting,setInspirationExisting]=useState(booking.inspirationReferencePhotoUrls || []);
  const [inspirationPending,setInspirationPending]=useState<Pending[]>([]);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  function addFiles(slot:number, files:FileList|null) {
    if(!files)return;
    setPending(current=>current.map((items,index)=>index===slot?[...items,...Array.from(files).slice(0,Math.max(0,3-existing[slot].length-items.length)).map(file=>({file,preview:URL.createObjectURL(file)}))]:items));
  }
  function addInspiration(files:FileList|null){if(!files)return;setInspirationPending(current=>[...current,...Array.from(files).slice(0,Math.max(0,10-inspirationExisting.length-current.length)).map(file=>({file,preview:URL.createObjectURL(file)}))]);}
  async function save(){
    setSaving(true);setError('');
    try{
      const setupSelections = await Promise.all(Array.from({ length: count }, async (_, i) => ({
        slot: i + 1,
        note: notes[i].trim(),
        outfitSource: outfits[i],
        referencePhotoUrls: [
          ...existing[i],
          ...await Promise.all(pending[i].map(item => uploadPhotoFromBrowser(item.file))),
        ],
      })));
      const inspirationReferencePhotoUrls=[...inspirationExisting,...await Promise.all(inspirationPending.map(item=>uploadPhotoFromBrowser(item.file)))];
      const response=await fetch(`/api/bookings/${booking.id}/setup-choice`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,setupSelections,inspirationReferencePhotoUrls})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not save setup choices.');
      setPending(Array.from({length:count},()=>[]));setInspirationPending([]);setEditing(false);onSaved(data.booking);
    }catch(e){setError((e as Error).message);}finally{setSaving(false);}
  }
  if(!editing)return <button className="btn btn-primary" style={{marginTop:12}} onClick={()=>setEditing(true)}>Edit setup &amp; upload photos</button>;
  const thumb=(url:string,onRemove:()=>void)=><div key={url} style={{position:'relative'}}><img src={url} alt="Reference" style={{width:82,height:82,objectFit:'cover',borderRadius:9}}/><button type="button" aria-label="Remove photo" onClick={onRemove} style={{position:'absolute',right:3,top:3,border:0,borderRadius:20,width:24,height:24,background:'#fff',cursor:'pointer'}}>×</button></div>;
  return <div style={{marginTop:12}}>
    {Array.from({length:count},(_,i)=><div key={i} style={{padding:'12px 0',borderTop:'1px solid var(--line)'}}>
      <b>Setup {i+1}</b>
      <div style={{display:'flex',gap:8,margin:'8px 0',flexWrap:'wrap'}}>{[['mamamiyo','Mamamiyo outfit'],['own','Own outfit']].map(([value,label])=><button type="button" key={value} className={outfits[i]===value?'btn btn-primary':'btn btn-ghost'} onClick={()=>setOutfits(v=>v.map((x,n)=>n===i?value:x))}>{label}</button>)}</div>
      <input value={notes[i]} maxLength={300} onChange={e=>setNotes(v=>v.map((x,n)=>n===i?e.target.value:x))} placeholder="Setup or outfit notes (optional)" style={{width:'100%',padding:'10px 12px',border:'1.5px solid var(--line)',borderRadius:9}}/>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:9}}>{existing[i].map(url=>thumb(url,()=>setExisting(v=>v.map((x,n)=>n===i?x.filter(item=>item!==url):x))))}{pending[i].map(item=>thumb(item.preview,()=>setPending(v=>v.map((x,n)=>n===i?x.filter(p=>p!==item):x))))}</div>
      {existing[i].length+pending[i].length<3&&<label className="btn btn-ghost" style={{display:'inline-block',marginTop:9,cursor:'pointer'}}>Upload setup photos<input type="file" accept="image/*" multiple hidden onChange={e=>{addFiles(i,e.target.files);e.currentTarget.value='';}}/></label>}
      <div style={{fontSize:12,color:'var(--ink-soft)',marginTop:5}}>Up to 3 photos for this setup.</div>
    </div>)}
    <div style={{padding:'12px 0',borderTop:'1px solid var(--line)'}}><b>Inspirational reference photos</b><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:9}}>{inspirationExisting.map(url=>thumb(url,()=>setInspirationExisting(v=>v.filter(item=>item!==url))))}{inspirationPending.map(item=>thumb(item.preview,()=>setInspirationPending(v=>v.filter(p=>p!==item))))}</div>{inspirationExisting.length+inspirationPending.length<10&&<label className="btn btn-ghost" style={{display:'inline-block',marginTop:9,cursor:'pointer'}}>Upload inspiration photos<input type="file" accept="image/*" multiple hidden onChange={e=>{addInspiration(e.target.files);e.currentTarget.value='';}}/></label>}<div style={{fontSize:12,color:'var(--ink-soft)',marginTop:5}}>Up to 10 photos.</div></div>
    {error&&<div className="error-text">{error}</div>}
    <div style={{display:'flex',gap:8,marginTop:10}}><button className="btn btn-ghost" disabled={saving} onClick={()=>setEditing(false)}>Cancel</button><button className="btn btn-primary" disabled={saving} onClick={save}>{saving?'Uploading & saving…':'Save setup choices'}</button></div>
  </div>;
}
