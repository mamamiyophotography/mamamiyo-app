import { SESSION_TYPES } from '../constants';
export const MEASUREMENT_ID = 'G-46ZYQWWCYP';
export const PUBLIC_PATHS = ['/', '/book'];
export const PACKAGES: string[] = SESSION_TYPES.map(p => p.id);
export type Attribution = { consent: true; capturedAt: number; source: string; medium: string; landingPage: string; clientId?: string; sessionId?: string; test: boolean };
// Only controlled campaign codes. Free text, query strings and contact fields never pass this boundary.
export function campaignCode(value: unknown): string | undefined {
  const codes=['google','bing','instagram','facebook','tiktok','xiaohongshu','lemon','chatgpt','direct','unknown','organic','social','referral','cpc','email','none'];
  return typeof value === 'string' && codes.includes(value) ? value : undefined;
}
export function cleanAttribution(input: unknown, now = Date.now()): Attribution | null {
  if (!input || typeof input !== 'object') return null;
  const a = input as Record<string, unknown>;
  if (a.consent !== true || typeof a.capturedAt !== 'number' || a.capturedAt > now || now-a.capturedAt > 30*60*1000) return null;
  const allowedPaths = ['/', '/package', '/contact-us', '/book', '/sensual-maternity', '/cutie-newborn', '/3m-old', '/6m-1-year-old', '/composition', '/with-pets', '/family-siblings', '/floral-simple', '/fantasy-characters', '/lifestyle-occupation'];
  const landingPage = typeof a.landingPage === 'string' && allowedPaths.includes(a.landingPage) ? a.landingPage : '/';
  return {consent:true, capturedAt:a.capturedAt, source:campaignCode(a.source) || 'unknown', medium:campaignCode(a.medium) || 'unknown', landingPage,
    ...(typeof a.clientId==='string' && /^\d{1,20}\.\d{1,20}$/.test(a.clientId) ? {clientId:a.clientId} : {}),
    ...(typeof a.sessionId==='string' && /^\d{1,20}$/.test(a.sessionId) ? {sessionId:a.sessionId} : {}), test:a.test===true};
}

export function safeReferrer(input:string):string {
  try { const u=new URL(input);const hosts=['google.com','www.google.com','google.com.sg','www.google.com.sg','bing.com','www.bing.com','instagram.com','www.instagram.com','facebook.com','www.facebook.com','l.facebook.com','tiktok.com','www.tiktok.com','chatgpt.com','www.mamamiyo-photography.com','mamamiyo-photography.com','book.mamamiyo-photography.com','mamamiyo-app.vercel.app'];return u.protocol==='https:' && hosts.includes(u.hostname)?u.origin+'/':''; } catch{return '';}
}
export function safeCampaign(query:string) {
 const q=new URLSearchParams(query);
 return {campaign_name:'not_set',campaign_id:'not_set',campaign_term:'not_set',campaign_content:'not_set',
   ...(q.has('utm_source') ? {campaign_source:campaignCode(q.get('utm_source'))||'unknown',campaign_medium:campaignCode(q.get('utm_medium'))||'unknown'} : {})};
}
