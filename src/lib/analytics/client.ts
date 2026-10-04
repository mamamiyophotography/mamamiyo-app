'use client';
import { Attribution, cleanAttribution, MEASUREMENT_ID, PACKAGES, PUBLIC_PATHS, safeReferrer, safeCampaign } from './shared';
declare global { interface Window { dataLayer?: unknown[]; gtag?: (...args: any[]) => void; } }
const CONSENT='mm_analytics_consent_v1', ATTR='mm_attribution_v1';
export function isDebug() { return new URLSearchParams(location.search).get('analytics_debug')==='1'; }
export function allowed() { return PUBLIC_PATHS.includes(location.pathname) && process.env.NEXT_PUBLIC_ANALYTICS_ENABLED==='true'; }
export function consented() { try { return allowed() && localStorage.getItem(CONSENT)==='granted'; } catch { return false; } }
export function isTest() { return location.hostname==='localhost' || location.hostname==='127.0.0.1' || ![process.env.NEXT_PUBLIC_ANALYTICS_HOST,'book.mamamiyo-photography.com','mamamiyo-app.vercel.app'].includes(location.hostname) || sessionStorage.getItem('mm_analytics_test')==='true'; }
export function setConsent(grant:boolean) {
  try { localStorage.setItem(CONSENT,grant?'granted':'denied'); if(!grant) { clearAnalyticsCookies(); void withdraw(); sessionStorage.removeItem(ATTR); window.gtag?.('consent','update',{analytics_storage:'denied'}); } } catch { /* blocked storage keeps tracking off */ }
}
export function bootAnalytics() {
  if(!consented()) return;
  if(new URLSearchParams(location.search).get('analytics_test')==='1') sessionStorage.setItem('mm_analytics_test','true');
  // Test traffic is local-only. Never loads Google's production tag.
  if(isTest()) { window.dispatchEvent?.(new Event('mm:analytics-ready')); return; }
  if(document.getElementById('mm-ga4')) { window.dispatchEvent?.(new Event('mm:analytics-ready')); return; }
  window.dataLayer=window.dataLayer||[];
  window.gtag=function(){window.dataLayer!.push(arguments);};
  window.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  window.gtag('js',new Date());
  window.gtag('config',MEASUREMENT_ID,{...safeCampaign(location.search),...(isDebug()?{debug_mode:true}:{}),send_page_view:false,page_location:location.origin+location.pathname,page_referrer:safeReferrer(document.referrer||''),page_title:'Mamamiyo Booking',cookie_expires:60*86400,allow_google_signals:false,allow_ad_personalization_signals:false});
  const script=document.createElement('script'); script.id='mm-ga4'; script.async=true; script.src=`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`; document.head.appendChild(script);
  event('page_view');
  window.dispatchEvent?.(new Event('mm:analytics-ready'));
  if(isDebug()) window.gtag('get',MEASUREMENT_ID,'client_id',async(value:string)=>{
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
    console.info('[analytics:debug identity]',Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join(''));
  });
}
export function event(name:'page_view'|'package_view'|'booking_start'|'booking_submit', params:{package_type?:string;booking_reference?:string}={}, once?:string) {
  if(!consented()) return;
  try {
    if(once && Date.now()-Number(sessionStorage.getItem('mm_event_'+once)||0)<30*60*1000) return;
    const safe:Record<string,unknown>={...(isDebug()?{debug_mode:true}:{}),page_location:location.origin+location.pathname,page_referrer:safeReferrer(document.referrer||''),page_title:'Mamamiyo Booking',send_to:MEASUREMENT_ID};
    if(params.package_type && PACKAGES.includes(params.package_type)) safe.package_type=params.package_type;
    if(params.booking_reference && /^[0-9a-f-]{36}$/.test(params.booking_reference)) safe.booking_reference=params.booking_reference;
    if(isTest()) console.info('[analytics:test]',name,safe); else {if(!window.gtag)return;window.gtag('event',name,safe);}
    if(once) sessionStorage.setItem('mm_event_'+once,String(Date.now()));
  } catch { /* Analytics must never prevent a booking */ }
}
export async function attribution():Promise<Attribution|null> {
  if(!consented()) return null;
  try {
    const q=new URLSearchParams(location.search);
    const previous=JSON.parse(sessionStorage.getItem(ATTR)||'null');
    const a=cleanAttribution(previous)||cleanAttribution({consent:true,capturedAt:Date.now(),source:q.get('mm_source')||q.get('utm_source')||'unknown',medium:q.get('mm_medium')||q.get('utm_medium')||'unknown',landingPage:q.get('mm_landing')||location.pathname,test:isTest()});
    if(!a) return null;
    if(!isTest() && window.gtag) {
      const get=(field:string)=>new Promise<string|undefined>(resolve=>{const timer=setTimeout(()=>resolve(undefined),600);window.gtag!('get',MEASUREMENT_ID,field,(value:string)=>{clearTimeout(timer);resolve(value);});});
      a.clientId=await get('client_id'); a.sessionId=await get('session_id');
    }
    a.test=isTest()||isDebug(); sessionStorage.setItem(ATTR,JSON.stringify(a)); return cleanAttribution(a);
  } catch {return null;}
}

export function rememberBooking(reference:unknown){
 if(typeof reference!=='string'||! /^[0-9a-f-]{36}$/.test(reference))return;
 try{const refs=JSON.parse(localStorage.getItem('mm_analytics_bookings')||'[]');localStorage.setItem('mm_analytics_bookings',JSON.stringify([...new Set([...refs,reference])].slice(-20)));}catch{}
}
export async function withdraw(){
 try{const references=JSON.parse(localStorage.getItem('mm_analytics_bookings')||'[]');if(!references.length)return;const res=await fetch('/api/analytics/withdraw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({references}),keepalive:true});if(res.ok)localStorage.removeItem('mm_analytics_bookings');}catch{/* Contact studio if offline withdrawal cannot be completed. */}
}

function clearAnalyticsCookies(){
 const host=location.hostname;
 for(const entry of (document.cookie||'').split(';')){const key=entry.trim().split('=')[0];if(!/^_ga($|_)/.test(key))continue;
  document.cookie=key+'=; Max-Age=0; Path=/';
  document.cookie=key+'=; Max-Age=0; Path=/; Domain='+host;
  if(host.endsWith('.mamamiyo-photography.com'))document.cookie=key+'=; Max-Age=0; Path=/; Domain=mamamiyo-photography.com';
 }
}
