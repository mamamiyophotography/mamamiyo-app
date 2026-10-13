'use client';
import {useEffect,useState} from 'react';

type Voucher={code:string;recipientName:string;senderName:string;purchaserName:string;message:string;sessionLabel:string;expiresAt:string|null};

export default function GiftVoucherImageModal({voucher,onClose}:{voucher:Voucher;onClose:()=>void}){
  const [image,setImage]=useState('');
  useEffect(()=>{let cancelled=false;async function create(){
    const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1400;const ctx=canvas.getContext('2d');if(!ctx)return;
    const bg=new Image();bg.src='/voucher/floral-reference.jpg';await new Promise<void>((resolve,reject)=>{bg.onload=()=>resolve();bg.onerror=()=>reject();});
    const scale=Math.max(canvas.width/bg.naturalWidth,canvas.height/bg.naturalHeight),w=bg.naturalWidth*scale,h=bg.naturalHeight*scale;
    ctx.drawImage(bg,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
    ctx.fillStyle='rgba(255,255,255,.94)';ctx.beginPath();ctx.roundRect(300,190,1200,1010,42);ctx.fill();
    ctx.strokeStyle='rgba(194,154,124,.42)';ctx.lineWidth=3;ctx.stroke();ctx.textAlign='center';
    ctx.fillStyle='#e7a995';ctx.font='italic 88px Georgia';ctx.fillText('Gift Voucher',900,330);
    ctx.fillStyle='#71856c';ctx.font='700 32px Arial';ctx.fillText('MAMAMIYO PHOTOGRAPHY',900,390);
    ctx.fillStyle='#b08d57';ctx.font='700 52px Arial';ctx.fillText(voucher.sessionLabel,900,510);
    ctx.fillStyle='#5e766f';ctx.font='42px Arial';ctx.fillText(`Dear ${voucher.recipientName},`,900,610);
    const wrap=(text:string,max:number)=>{const words=text.split(/\s+/);const lines:string[]=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>max&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);return lines;};
    ctx.fillStyle='#d99684';ctx.font='36px Arial';wrap(voucher.message||'Wishing you beautiful memories with the people you love.',960).slice(0,3).forEach((line,i)=>ctx.fillText(line,900,690+i*50));
    ctx.fillStyle='#5e766f';ctx.font='32px Arial';ctx.fillText(`From ${voucher.senderName||voucher.purchaserName}`,900,865);
    ctx.fillStyle='#6f6b66';ctx.font='25px Arial';ctx.fillText(`Voucher code: ${voucher.code}`,900,950);
    const expiry=voucher.expiresAt?new Intl.DateTimeFormat('en-SG',{day:'numeric',month:'long',year:'numeric'}).format(new Date(voucher.expiresAt)):'No expiry date';
    ctx.fillText(`Valid until: ${expiry}`,900,990);
    ctx.font='22px Arial';ctx.fillStyle='#7d7872';ctx.fillText('Non-refundable · Transferable · Advance booking is required',900,1065);
    ctx.fillText('www.mamamiyo-photography.com · WhatsApp +65 9760 0798',900,1110);
    if(!cancelled)setImage(canvas.toDataURL('image/jpeg',.94));
  }create();return()=>{cancelled=true};},[voucher]);
  function download(){const a=document.createElement('a');a.href=image;a.download=`Mamamiyo-Gift-Voucher-${voucher.code}.jpg`;a.click();}
  return <div style={{position:'fixed',inset:0,zIndex:1200,background:'rgba(35,30,27,.65)',display:'grid',placeItems:'center',padding:16}} onClick={onClose}><div className="card" style={{width:'min(760px,100%)',maxHeight:'92vh',overflow:'auto'}} onClick={e=>e.stopPropagation()}><h2 style={{fontSize:20}}>电子礼券预览</h2>{image?<img src={image} alt="Gift voucher soft copy" style={{width:'100%',borderRadius:12,border:'1px solid var(--line)'}}/>:<div className="notice">正在生成电子礼券…</div>}<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:12}}><button className="btn btn-primary" disabled={!image} onClick={download}>下载电子礼券</button><button className="btn btn-ghost" onClick={onClose}>关闭</button></div></div></div>;
}
