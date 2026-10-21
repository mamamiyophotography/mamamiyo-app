'use client';

import {useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';

type Photo={id:string;filename:string;code:string};
type GalleryData={title:string;photos:Photo[];canDelete:boolean;reason:string};

export default function ManageGalleryModal({bookingId,galleryId,addPhotosUrl,onClose,onChanged}:{bookingId:string;galleryId:string;addPhotosUrl:string;onClose:()=>void;onChanged:()=>Promise<void>}){
  const [data,setData]=useState<GalleryData|null>(null);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [lightboxIndex,setLightboxIndex]=useState<number|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const endpoint=`/api/admin/bookings/${bookingId}/gallery?galleryId=${galleryId}`;
  async function load(){
    setError('');const response=await fetch(endpoint);const body=await response.json();
    if(!response.ok)throw new Error(body.error||'Could not load this Gallery.');
    setData(body);setSelected(new Set());setLightboxIndex(null);
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
  useEffect(()=>{const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous};},[]);
  useEffect(()=>{
    if(lightboxIndex===null||!data?.photos.length)return;
    const move=(direction:number)=>setLightboxIndex(current=>current===null?null:(current+direction+data.photos.length)%data.photos.length);
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape')setLightboxIndex(null);
      if(event.key==='ArrowLeft')move(-1);
      if(event.key==='ArrowRight')move(1);
    };
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  },[lightboxIndex,data]);
  const lightboxPhoto=lightboxIndex===null?null:data?.photos[lightboxIndex]||null;
  const moveLightbox=(direction:number)=>{
    if(!data?.photos.length)return;
    setLightboxIndex(current=>current===null?null:(current+direction+data.photos.length)%data.photos.length);
  };
  return createPortal(<div onClick={onClose} style={{position:'fixed',inset:0,zIndex:10000,background:'rgba(46,42,34,.55)',display:'grid',placeItems:'center',padding:16}}>
    <section onClick={e=>e.stopPropagation()} style={{background:'#fbf8f2',width:'min(760px,100%)',maxHeight:'90vh',overflow:'auto',borderRadius:18,padding:20,boxShadow:'0 20px 60px rgba(0,0,0,.25)'}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'start'}}>
        <div><h2 style={{margin:0,color:'#3a2e28'}}>Manage Gallery</h2><p style={{margin:'6px 0 16px',color:'#75695f'}}>Add new photos, delete individual photos, or remove the full Gallery and create it again.</p></div>
        <button type="button" onClick={onClose} style={{border:'1px solid #cfc5b8',background:'#fff',borderRadius:999,width:36,height:36,fontSize:22}}>×</button>
      </div>
      {error&&<div style={{padding:10,background:'#f8dfd9',color:'#8b3f35',borderRadius:8,marginBottom:12}}>{error}</div>}
      {!data&&!error&&<p>Loading Gallery…</p>}
      {data&&<>
        {!data.canDelete&&<div style={{padding:12,background:'#fff0d8',color:'#74572d',borderRadius:8,marginBottom:14}}>{data.reason} Photos cannot be deleted here.</div>}
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:18,paddingBottom:16,borderBottom:'1px solid #ddd3c7'}}>
          {data.canDelete&&<a href={addPhotosUrl} target="_blank" rel="noopener noreferrer" style={{border:'2px solid #557970',background:'#557970',color:'#fff',borderRadius:9,padding:'11px 16px',fontWeight:700,textDecoration:'none'}}>Add New Photos</a>}
          <button type="button" disabled={!data.canDelete||!selected.size||busy} onClick={()=>remove(false)} style={{border:'2px solid #b9695a',background:'#fff',color:'#3a2e28',borderRadius:9,padding:'11px 16px',fontWeight:700}}>Delete Selected Photos</button>
          <button type="button" disabled={!data.canDelete||!data.photos.length||busy} onClick={()=>remove(true)} style={{border:'2px solid #8f3f35',background:'#8f3f35',color:'#fff',borderRadius:9,padding:'11px 16px',fontWeight:700}}>Delete Entire Gallery</button>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:12}}>
          <b>{selectedLabel}</b>
          <button type="button" onClick={toggleAll} disabled={!data.canDelete||busy} style={{border:'1px solid #638a82',background:'#fff',color:'#3a2e28',borderRadius:8,padding:'8px 12px'}}>{allSelected?'Clear selection':'Select all'}</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(105px,1fr))',gap:10}}>
          {data.photos.map((photo,index)=><div key={photo.id} style={{position:'relative',border:selected.has(photo.id)?'3px solid #5e8d83':'1px solid #ddd3c7',borderRadius:10,overflow:'hidden',background:'#fff'}}>
            <button type="button" onClick={()=>setLightboxIndex(index)} aria-label={`Enlarge ${photo.filename}`} style={{display:'block',width:'100%',padding:0,border:0,background:'transparent',cursor:'zoom-in'}}>
              <img src={`${endpoint}&photoId=${encodeURIComponent(photo.id)}`} alt={photo.filename} style={{width:'100%',aspectRatio:'1',objectFit:'cover',display:'block'}}/>
            </button>
            <input type="checkbox" checked={selected.has(photo.id)} disabled={!data.canDelete||busy} onChange={()=>setSelected(current=>{const next=new Set(current);next.has(photo.id)?next.delete(photo.id):next.add(photo.id);return next})} style={{position:'absolute',top:7,left:7,width:20,height:20}}/>
            <div style={{fontSize:11,padding:'7px 6px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{photo.filename}</div>
          </div>)}
        </div>
        {!data.photos.length&&<p style={{textAlign:'center',padding:30,color:'#75695f'}}>No photos remain in this Gallery.</p>}
      </>}
    </section>
    {lightboxPhoto&&<div role="dialog" aria-modal="true" aria-label={`Enlarged photo ${lightboxPhoto.filename}`} onClick={event=>{event.stopPropagation();setLightboxIndex(null)}} style={{position:'fixed',inset:0,zIndex:10001,background:'rgba(15,18,17,.94)',display:'grid',gridTemplateColumns:'minmax(52px,90px) minmax(0,1fr) minmax(52px,90px)',gridTemplateRows:'64px minmax(0,1fr) 58px',alignItems:'center'}}>
      <button type="button" onClick={event=>{event.stopPropagation();setLightboxIndex(null)}} aria-label="Close enlarged photo" style={{position:'absolute',top:12,right:14,zIndex:2,border:'1px solid rgba(255,255,255,.55)',background:'rgba(0,0,0,.35)',color:'#fff',borderRadius:999,width:42,height:42,fontSize:28,lineHeight:1,cursor:'pointer'}}>×</button>
      <button type="button" onClick={event=>{event.stopPropagation();moveLightbox(-1)}} aria-label="Previous photo" style={{gridColumn:1,gridRow:2,justifySelf:'center',border:0,background:'rgba(255,255,255,.16)',color:'#fff',borderRadius:999,width:48,height:48,fontSize:36,lineHeight:1,cursor:'pointer'}}>‹</button>
      <img onClick={event=>event.stopPropagation()} src={`${endpoint}&photoId=${encodeURIComponent(lightboxPhoto.id)}`} alt={lightboxPhoto.filename} style={{gridColumn:2,gridRow:2,width:'100%',height:'100%',maxHeight:'calc(100vh - 122px)',objectFit:'contain',display:'block'}}/>
      <button type="button" onClick={event=>{event.stopPropagation();moveLightbox(1)}} aria-label="Next photo" style={{gridColumn:3,gridRow:2,justifySelf:'center',border:0,background:'rgba(255,255,255,.16)',color:'#fff',borderRadius:999,width:48,height:48,fontSize:36,lineHeight:1,cursor:'pointer'}}>›</button>
      <div onClick={event=>event.stopPropagation()} style={{gridColumn:'1 / -1',gridRow:3,textAlign:'center',color:'#fff',padding:'4px 70px 12px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lightboxPhoto.filename} · {(lightboxIndex||0)+1} / {data?.photos.length||0}</div>
    </div>}
  </div>,document.body)
}
