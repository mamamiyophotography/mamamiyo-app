'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { allowed, bootAnalytics, setConsent } from '@/lib/analytics/client';
export default function AnalyticsConsent() {
  const path=usePathname(); const [show,setShow]=useState(false);
  useEffect(()=>{ if(!allowed()) return; bootAnalytics(); try {setShow(!localStorage.getItem('mm_analytics_consent_v1'));}catch{setShow(true);} },[path]);
  if(!['/','/book'].includes(path)||process.env.NEXT_PUBLIC_ANALYTICS_ENABLED!=='true') return null;
  function choose(grant:boolean){setConsent(grant);setShow(false);if(grant)bootAnalytics();else location.reload();}
  return <aside style={{padding:16,background:'#fff8ed',fontSize:13}} aria-label="Analytics privacy">
    {show ? <><p>With your permission, we use Google Analytics cookies to understand visits and booking steps across our website and booking app. Analytics excludes your name, phone, email, address and photos. Booking works without analytics. Google processes data overseas; see our <a href="/privacy">privacy notice</a>.</p><button type="button" onClick={()=>choose(true)}>Allow analytics</button> <button type="button" onClick={()=>choose(false)}>Decline</button></> : <button type="button" onClick={()=>setShow(true)}>Analytics preferences</button>}
  </aside>;
}
