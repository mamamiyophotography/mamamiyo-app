'use client';

import {useEffect,useMemo,useState} from 'react';

type Photo={id:string;filename:string;code:string};
type GalleryData={title:string;photos:Photo[];canDelete:boolean;reason:string};

export default function ManageGalleryModal({bookingId,galleryId,onClose,onChanged}:{bookingId:string;galleryId:string;onClose:()=>void;onChanged:()=>Promise<void>}){
  const [data,setData]=useState<GalleryData|null>(null);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const endpoint=`/api/admin/bookings/${bookingId}/gallery?galleryId=${galleryId}`;
  async function load(){
    setError('');const response=await fetch(endpoint);const body=await response.json();
    if(!response.ok)throw new Error(body.error||'Could not load this Gallery.');
    setData(body);setSelected(new Set());
  }
  useEffect(()=>{load().catch(e=>setError(e.message));},[bookingId,galleryId]);
  const allSelected=Boolean(data?.photos.length)&&selected.size===data?.photos.length;
  const toggleAll=()=>setSelected(allSelected?new Set():new Set(data?.photos.map(p=>p.id)));
  const remove=async(deleteAll:boolean)=>{
    const count=deleteAll?data?.photos.length||0:selected.size;
    if(!count||!data)return;
    const message=deleteAll
      ? 'Delete this entire Gallery and all uploaded photos? The client link will stop working and Create Gallery will appear again.'
      : `Delete ${count} selected photo${count===1?'':'s'}? The Basic Retouch ZIP will need to be created again.`;
    if(!window.confirm(message))return;
    setBusy(true);setError('');
    try{
      const photoIds=deleteAll?data.photos.map(p=>p.id):[...selected];
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({photoIds,deleteAll})});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not delete the photos.');
      await onChanged();
      if(deleteAll)onClose();else await load();
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  };
  const selectedLabel=useMemo(()=>selected.size?`${selected.size} selected`:'Select photos to delete',[selected]);
  return <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(46,42,34,.55)',display:'grid',placeItems:'center',padding:16}}>
    <section onClick={e=>e.stopPropagation()} style={{background:'#fbf8f2',width:'min(760px,100%)',maxHeight:'90vh',overflow:'auto',borderRadius:18,padding:20,boxShadow:'0 20px 60px rgba(0,0,0,.25)'}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'start'}}>
        <div><h2 style={{margin:0,color:'#3a2e28'}}>Manage Gallery</h2><p style={{margin:'6px 0 16px',color:'#75695f'}}>Delete individual photos, or remove the full Gallery and create it again.</p></div>
        <button type="button" onClick={onClose} style={{border:'1px solid #cfc5b8',background:'#fff',borderRadius:999,width:36,height:36,fontSize:22}}>×</button>
      </div>
      {error&&<div style={{padding:10,background:'#f8dfd9',color:'#8b3f35',borderRadius:8,marginBottom:12}}>{error}</div>}
      {!data&&!error&&<p>Loading Gallery…</p>}
      {data&&<>
        {!data.canDelete&&<div style={{padding:12,background:'#fff0d8',color:'#74572d',borderRadius:8,marginBottom:14}}>{data.reason} Photos cannot be deleted here.</div>}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:12}}>
          <b>{selectedLabel}</b>
          <button type="button" onClick={toggleAll} disabled={!data.canDelete||busy} style={{border:'1px solid #638a82',background:'#fff',color:'#3a2e28',borderRadius:8,padding:'8px 12px'}}>{allSelected?'Clear selection':'Select all'}</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(105px,1fr))',gap:10}}>
          {data.photos.map(photo=><label key={photo.id} style={{position:'relative',cursor:data.canDelete?'pointer':'default',border:selected.has(photo.id)?'3px solid #5e8d83':'1px solid #ddd3c7',borderRadius:10,overflow:'hidden',background:'#fff'}}>
            <img src={`${endpoint}&photoId=${encodeURIComponent(photo.id)}`} alt={photo.filename} style={{width:'100%',aspectRatio:'1',objectFit:'cover',display:'block'}}/>
            <input type="checkbox" checked={selected.has(photo.id)} disabled={!data.canDelete||busy} onChange={()=>setSelected(current=>{const next=new Set(current);next.has(photo.id)?next.delete(photo.id):next.add(photo.id);return next})} style={{position:'absolute',top:7,left:7,width:20,height:20}}/>
            <div style={{fontSize:11,padding:'7px 6px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{photo.filename}</div>
          </label>)}
        </div>
        {!data.photos.length&&<p style={{textAlign:'center',padding:30,color:'#75695f'}}>No photos remain in this Gallery.</p>}
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:18}}>
          <button type="button" disabled={!data.canDelete||!selected.size||busy} onClick={()=>remove(false)} style={{border:'2px solid #b9695a',background:'#fff',color:'#3a2e28',borderRadius:9,padding:'11px 16px',fontWeight:700}}>Delete Selected Photos</button>
          <button type="button" disabled={!data.canDelete||!data.photos.length||busy} onClick={()=>remove(true)} style={{border:'2px solid #8f3f35',background:'#8f3f35',color:'#fff',borderRadius:9,padding:'11px 16px',fontWeight:700}}>Delete Entire Gallery</button>
        </div>
      </>}
    </section>
  </div>
}
