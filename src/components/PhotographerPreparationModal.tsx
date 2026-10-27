'use client';

import { useEffect, useState } from 'react';
import { fmtDatePretty, fmtTime12 } from '@/lib/format';
import { bookingLocationLabel } from '@/lib/location';

type PreparationBooking = {
  clientName: string;
  sessionLabel: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  address?: string;
  notes: string;
  ref?: string;
  referencePhotoUrls?: string[];
  setupSelections?: { slot:number; referencePhotoUrls:string[]; note?:string; outfitSource?:'mamamiyo'|'own'|null }[];
};

function bookingDetails(notes: string) {
  let comments = notes || '';
  const gender = comments.match(/Baby gender:\s*([^\n·]+)/i)?.[1]?.trim() || 'Not specified';
  comments = comments
    .replace(/Baby gender:\s*[^\n·]+/i, ' ')
    .replace(/Sibling joining:\s*(yes|no)/ig, ' ')
    .replace(/Number of siblings:\s*\d+/ig, ' ')
    .split(/\n+|·/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' · ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { gender, comments: comments || 'No customer comments.' };
}

export default function PhotographerPreparationModal({ booking, onClose }: { booking: PreparationBooking; onClose: () => void }) {
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function buildImage() {
      const details = bookingDetails(booking.notes);
      const rawSetups = booking.setupSelections?.length
        ? booking.setupSelections
        : booking.referencePhotoUrls?.length
          ? [{ slot: 1, referencePhotoUrls: booking.referencePhotoUrls, note: '', outfitSource: null }]
          : [];
      const setups = [...rawSetups].sort((a, b) => a.slot - b.slot);
      const width = 1600;
      const margin = 80;
      const contentWidth = width - margin * 2;
      const infoHeight = 540;
      const setupImageGap = 28;
      const loadImage = async (url:string) => {
        try {
          const response=await fetch(url); if(!response.ok)return null;
          const objectUrl=URL.createObjectURL(await response.blob()); const image=new Image(); image.src=objectUrl;
          await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('Image failed to load'));});
          return {image,objectUrl};
        } catch { return null; }
      };
      const setupPhotos = await Promise.all(setups.map((setup) =>
        Promise.all((setup.referencePhotoUrls || []).slice(0,3).map(loadImage))
      ));
      const setupImageHeights = setupPhotos.map((photos) => photos.map((item) =>
        item ? Math.round(contentWidth * item.image.naturalHeight / item.image.naturalWidth) : 700
      ));
      const setupHeights = setupImageHeights.map((photoHeights) =>
        photoHeights.length ? 90 + photoHeights.reduce((sum,value)=>sum+value,0) + (photoHeights.length-1)*setupImageGap + 30 : 260
      );
      const height = Math.max(1200, 230 + infoHeight + setupHeights.reduce((sum, value) => sum + value, 0) + 130);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const roundedRect = (x:number,y:number,w:number,h:number,r:number) => {
        ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
        ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
        ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
      };
      const wrap = (text:string,maxWidth:number) => {
        const words=text.split(/\s+/); const lines:string[]=[]; let line='';
        words.forEach((word)=>{const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word;}else line=next;});
        if(line)lines.push(line); return lines;
      };
      ctx.fillStyle='#fffaf5'; ctx.fillRect(0,0,width,height);
      ctx.fillStyle='#3a302b'; ctx.fillRect(0,0,width,210);
      ctx.textAlign='center'; ctx.fillStyle='#d8b18d'; ctx.font='700 30px Arial'; ctx.fillText('MAMAMIYO PHOTOGRAPHY',width/2,70);
      ctx.fillStyle='#ffffff'; ctx.font='700 62px Georgia'; ctx.fillText('Photographer Preparation',width/2,145);
      ctx.font='28px Arial'; ctx.fillText(`${booking.clientName} · ${booking.sessionLabel}`,width/2,187);

      const genderLower=details.gender.toLowerCase();
      const gender=genderLower.includes('girl')?'Girl':genderLower.includes('boy')?'Boy':'Not specified';
      const genderColour=genderLower.includes('girl')?'#ef9db7':genderLower.includes('boy')?'#78aee5':'#b9a88d';
      let y=250;
      ctx.fillStyle='#ffffff'; roundedRect(margin,y,contentWidth,infoHeight-30,28); ctx.fill();
      ctx.strokeStyle='#e5d7ca'; ctx.lineWidth=3; ctx.stroke();
      ctx.textAlign='left'; ctx.fillStyle='#5e5147'; ctx.font='700 28px Arial'; ctx.fillText('DATE & TIME',margin+38,y+55);
      ctx.fillStyle='#2e2a22'; ctx.font='700 48px Arial'; ctx.fillText(`${fmtDatePretty(booking.date)} · ${fmtTime12(booking.startTime)}–${fmtTime12(booking.endTime)}`,margin+38,y+112);
      ctx.fillStyle='#5e5147'; ctx.font='700 27px Arial'; ctx.fillText('TYPE OF ADDRESS',margin+38,y+175);
      ctx.fillStyle='#2e2a22'; ctx.font='700 48px Arial';
      ctx.fillText(bookingLocationLabel(booking.location),margin+38,y+232);
      ctx.fillStyle='#5e5147'; ctx.font='700 27px Arial'; ctx.fillText('ADDRESS',margin+38,y+282);
      ctx.fillStyle='#2e2a22'; ctx.font='700 48px Arial';
      wrap(booking.address||'Not provided',contentWidth-76).slice(0,2).forEach((line,index)=>ctx.fillText(line,margin+38,y+339+index*55));
      ctx.fillStyle=genderColour; roundedRect(width-420,y+42,300,118,24); ctx.fill();
      ctx.textAlign='center'; ctx.fillStyle='#ffffff'; ctx.font='700 44px Arial'; ctx.fillText(gender,width-270,y+116);
      ctx.textAlign='left'; ctx.fillStyle='#5e5147'; ctx.font='700 27px Arial'; ctx.fillText('CUSTOMER COMMENTS',margin+38,y+450);
      ctx.fillStyle='#2e2a22'; ctx.font='29px Arial';
      wrap(details.comments,contentWidth-76).slice(0,2).forEach((line,index)=>ctx.fillText(line,margin+38,y+492+index*36));

      y += infoHeight;
      for (const [setupIndex, setup] of setups.entries()) {
        const outfit=setup.outfitSource==='mamamiyo'?'Mamamiyo Outfit':setup.outfitSource==='own'?"Client's Own Outfit":'Outfit Not Selected';
        ctx.textAlign='left'; ctx.fillStyle='#8c6d3f'; ctx.font='700 36px Arial'; ctx.fillText(`SETUP ${setup.slot}: ${outfit}`,margin,y+42);
        if(setup.note){ctx.textAlign='right';ctx.fillStyle='#6b6152';ctx.font='25px Arial';ctx.fillText(setup.note.slice(0,72),width-margin,y+42);}
        const photos=(setup.referencePhotoUrls||[]).slice(0,3);
        if(!photos.length){ctx.textAlign='left';ctx.fillStyle='#8f877b';ctx.font='28px Arial';ctx.fillText('No setup photos uploaded',margin,y+110);y+=setupHeights[setupIndex];continue;}
        const imageWidth=contentWidth; const loaded=setupPhotos[setupIndex];
        let imageTop=y+70;
        loaded.forEach((item,index)=>{
          const imageHeight=setupImageHeights[setupIndex][index];
          const x=margin; const top=imageTop;
          ctx.fillStyle='#ffffff';ctx.fillRect(x,top,imageWidth,imageHeight);ctx.strokeStyle='#d8c9bc';ctx.lineWidth=3;ctx.strokeRect(x,top,imageWidth,imageHeight);
          if(item){ctx.drawImage(item.image,x,top,imageWidth,imageHeight);URL.revokeObjectURL(item.objectUrl);}
          imageTop+=imageHeight+setupImageGap;
        });
        y += setupHeights[setupIndex];
      }
      ctx.textAlign='center';ctx.fillStyle='#8c6d3f';ctx.font='24px Arial';ctx.fillText(`Booking reference: ${booking.ref||'—'}`,width/2,height-55);
      if(!cancelled)setImageDataUrl(canvas.toDataURL('image/png'));
    }
    buildImage().catch(()=>{if(!cancelled)setMessage('Could not generate the preparation image.');});
    return()=>{cancelled=true;};
  },[booking]);

  async function saveOrShare(){
    if(!imageDataUrl)return;
    const safe=(booking.ref||booking.clientName).replace(/[^A-Za-z0-9_-]+/g,'-');
    const blob=await fetch(imageDataUrl).then((response)=>response.blob());
    const file=new File([blob],`Photographer-Preparation-${safe}.png`,{type:'image/png'});
    if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){try{await navigator.share({title:'Photographer Preparation',files:[file]});return;}catch(error){if((error as Error).name==='AbortError')return;}}
    const url=URL.createObjectURL(file);const link=document.createElement('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);setMessage('Image downloaded.');
  }

  return <div style={{position:'fixed',inset:0,background:'rgba(46,42,34,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}} onClick={onClose}>
    <div className="card" style={{maxWidth:560,width:'100%',maxHeight:'88vh',overflowY:'auto',padding:20}} onClick={(event)=>event.stopPropagation()}>
      <div style={{fontWeight:700,fontSize:18,marginBottom:12}}>摄影师准备清单</div>
      {imageDataUrl?<img className="invoice-image-preview" src={imageDataUrl} alt={`Photographer preparation for ${booking.clientName}`}/>:<div className="notice">Generating the clear preparation image…</div>}
      <button className="btn btn-primary" style={{width:'100%',justifyContent:'center',marginTop:12}} disabled={!imageDataUrl} onClick={saveOrShare}>Save / Share Image</button>
      {message&&<div style={{fontSize:12.5,color:'var(--ink-soft)',marginTop:8}}>{message}</div>}
      <button className="btn btn-ghost" style={{width:'100%',marginTop:8}} onClick={onClose}>Close</button>
    </div>
  </div>;
}
