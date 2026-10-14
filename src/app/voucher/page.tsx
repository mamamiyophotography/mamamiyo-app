'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {SESSION_TYPES} from '@/lib/constants';
import {VOUCHER_SHORT_TERMS,VOUCHER_TERMS} from '@/lib/voucherTerms';

type AppliedDiscount={code:string;amount:number;description:string};

export default function VoucherPage(){
  const [form,setForm]=useState({purchaserName:'',purchaserEmail:'',purchaserPhone:'',recipientName:'',recipientEmail:'',recipientPhone:'',senderName:'',sessionTypeId:'newborn',message:'',discountCode:''});
  const [discountInput,setDiscountInput]=useState('');
  const [appliedDiscount,setAppliedDiscount]=useState<AppliedDiscount|null>(null);
  const [discountError,setDiscountError]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [termsAccepted,setTermsAccepted]=useState(false);
  const [result,setResult]=useState<any>(null),[qr,setQr]=useState('');
  useEffect(()=>{if(result?.payNowPayload)QRCode.toDataURL(result.payNowPayload,{margin:1,width:240}).then(setQr);},[result]);
  const session=SESSION_TYPES.find(item=>item.id===form.sessionTypeId)!;
  const discountAmount=Math.min(appliedDiscount?.amount||0,session.price);
  const paymentAmount=Math.max(0,session.price-discountAmount);

  async function applyDiscount(){
    setDiscountError('');const code=discountInput.trim().toUpperCase();if(!code)return;
    const res=await fetch(`/api/discounts/${encodeURIComponent(code)}`);const data=await res.json();
    if(!res.ok||!data.valid){setAppliedDiscount(null);setForm(current=>({...current,discountCode:''}));setDiscountError('Discount code not recognised.');return;}
    setAppliedDiscount(data);setForm(current=>({...current,discountCode:data.code}));
  }
  async function submit(){setBusy(true);setError('');try{const res=await fetch('/api/vouchers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,termsAccepted})});const data=await res.json();if(!res.ok)throw new Error(data.error);setResult(data);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}

  if(result)return <div className="voucher-page"><div className="wrap"><h1>Gift Voucher</h1><div className="card" style={{textAlign:'center'}}><h2>Voucher request created</h2><p><b>{result.voucher.sessionLabel}</b> · Voucher value ${result.voucher.amount}</p>{result.voucher.discountAmount>0&&<p>Discount {result.voucher.discountCode}: −${result.voucher.discountAmount}</p>}<p>Full payment due: <b>${result.voucher.paymentAmount}</b></p><p>Reference: <b>{result.voucher.code}</b></p>{qr&&<img src={qr} alt="PayNow QR" style={{maxWidth:240}}/>}<p>Pay the full amount using this reference. The voucher becomes available after Mamamiyo confirms payment.</p><details className="voucher-terms"><summary>View Gift Voucher Terms</summary><ol>{VOUCHER_TERMS.map(term=><li key={term}>{term}</li>)}</ol></details><Link href="/" className="btn btn-ghost">Back to home</Link></div></div></div>;
  const field=(key:keyof typeof form,label:string,type='text')=><div className="field"><label>{label}</label><input type={type} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></div>;
  return <div className="voucher-page"><div className="wrap"><div style={{fontSize:12,textTransform:'uppercase',color:'var(--gold-deep)'}}>Mamamiyo Photography</div><h1>Purchase a Gift Voucher</h1><p style={{color:'var(--ink-soft)'}}>The purchaser pays in full. The recipient chooses the photoshoot date later.</p>
    <div className="card"><h2 style={{fontSize:19}}>Purchaser details</h2>{field('purchaserName','Purchaser name')}{field('purchaserEmail','Purchaser email','email')}{field('purchaserPhone','Purchaser WhatsApp number','tel')}</div>
    <div className="card"><h2 style={{fontSize:19}}>Recipient and voucher details</h2>{field('recipientName','Recipient name')}{field('recipientEmail','Recipient email — optional','email')}{field('recipientPhone','Recipient WhatsApp number — optional','tel')}{field('senderName','Name shown after “From” — optional')}<div className="field"><label>Voucher package</label><select value={form.sessionTypeId} onChange={e=>setForm({...form,sessionTypeId:e.target.value})}>{SESSION_TYPES.map(item=><option key={item.id} value={item.id}>{item.name} — ${item.price}</option>)}</select></div><div className="field"><label>Personal message — optional</label><textarea value={form.message} onChange={e=>setForm({...form,message:e.target.value})} placeholder="Best wishes to you and your growing family!"/></div>
      <div className="field"><label>Discount code — optional</label><div className="voucher-discount-row"><input value={discountInput} onChange={e=>setDiscountInput(e.target.value.toUpperCase())} placeholder="Enter code" disabled={!!appliedDiscount}/>{appliedDiscount?<button className="btn btn-ghost" type="button" onClick={()=>{setAppliedDiscount(null);setDiscountInput('');setForm(current=>({...current,discountCode:''}));}}>Remove</button>:<button className="btn btn-ghost" type="button" onClick={applyDiscount}>Apply</button>}</div>{appliedDiscount&&<div className="voucher-discount-success">{appliedDiscount.code} applied · −${discountAmount}</div>}{discountError&&<div className="error-text">{discountError}</div>}</div>
      <div className="ticket-row"><span>Voucher value</span><b>${session.price}</b></div>{discountAmount>0&&<div className="ticket-row voucher-discount-success"><span>Discount</span><b>−${discountAmount}</b></div>}<div className="ticket-total"><span>Total due now</span><span className="amt">${paymentAmount}</span></div></div>
    <div className="card"><details className="voucher-terms"><summary>Gift Voucher Terms</summary><ol>{VOUCHER_TERMS.map(term=><li key={term}>{term}</li>)}</ol></details><p className="voucher-short-terms">{VOUCHER_SHORT_TERMS}</p><label className="voucher-terms-agree"><input type="checkbox" checked={termsAccepted} onChange={event=>setTermsAccepted(event.target.checked)}/><span>I have read and agree to the Gift Voucher Terms.</span></label></div>
    {error&&<div className="error-text">{error}</div>}<button className="btn btn-primary" onClick={submit} disabled={busy||!termsAccepted}>{busy?'Creating voucher…':'Generate full-payment QR'}</button>
  </div></div>;
}
