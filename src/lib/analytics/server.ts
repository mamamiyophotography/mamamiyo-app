import { randomUUID } from 'node:crypto';
import { cleanAttribution, MEASUREMENT_ID } from './shared';
export function bookingAnalytics(input:unknown) {
  if(process.env.ANALYTICS_DB_ENABLED!=='true') return {};
  const attribution=cleanAttribution(input);
  return attribution ? {analyticsReference:randomUUID(),analyticsAttribution:attribution} : {};
}
// Confirmation and its durable event are committed together. The unique key survives repeated admin actions.
export async function confirmWithAnalytics(db:any, id:string) {
  if(process.env.ANALYTICS_DB_ENABLED!=='true') return db.booking.update({where:{id},data:{status:'confirmed',depositStatus:'paid'}});
  return db.$transaction(async(tx:any)=>{
    const before=await tx.booking.findUniqueOrThrow({where:{id}});
    const booking=await tx.booking.update({where:{id},data:{status:'confirmed',depositStatus:'paid'}});
    const a=cleanAttribution(before.analyticsAttribution, before.analyticsAttribution?.capturedAt || Date.now());
    const fresh=a && Date.now()-a.capturedAt < 90*86400000;
    if(before.depositStatus!=='paid' && fresh && a && !a.test && a.clientId && before.analyticsReference) {
      await tx.analyticsOutbox.upsert({where:{eventKey:`confirmed:${id}`},update:{},create:{eventKey:`confirmed:${id}`,bookingId:id,payload:{client_id:a.clientId,timestamp_micros:Date.now()*1000,consent:{ad_user_data:'DENIED',ad_personalization:'DENIED'},events:[{name:'booking_confirmed',params:{booking_reference:before.analyticsReference,package_type:before.sessionTypeId,value:before.depositAmount,currency:'SGD',value_basis:'deposit_received',source:a.source,medium:a.medium,landing_page:a.landingPage,engagement_time_msec:1,...(a.sessionId && Date.now()-a.capturedAt<24*60*60*1000?{session_id:a.sessionId}:{})}}]}}});
    }
    return booking;
  });
}
// Explicit command/worker only: never runs as a side effect of rendering or a test.
// Claim before send gives at-most-once attempts. Uncertain delivery is reconciled manually, not blindly retried.
export async function deliverOutbox(db:any, fetcher:typeof fetch=fetch) {
  if(process.env.ANALYTICS_SEND_ENABLED!=='true'||!process.env.GA4_API_SECRET) return {disabled:true};
  const rows=await db.analyticsOutbox.findMany({where:{claimedAt:null},take:50,orderBy:{createdAt:'asc'}});
  let attempted=0;
  for(const row of rows){
    if(Date.now()-new Date(row.createdAt).getTime()>72*3600000){await db.analyticsOutbox.updateMany({where:{id:row.id,claimedAt:null},data:{claimedAt:new Date(),deliveryStatus:'expired'}});continue;}
    const claim=await db.analyticsOutbox.updateMany({where:{id:row.id,claimedAt:null},data:{claimedAt:new Date(),deliveryStatus:'uncertain'}});
    if(claim.count!==1)continue;
    attempted++;
    try{
      const res=await fetcher(`https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${encodeURIComponent(process.env.GA4_API_SECRET)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row.payload),signal:AbortSignal.timeout(5000)});
      await db.analyticsOutbox.update({where:{id:row.id},data:{deliveryStatus:res.ok?'accepted':'rejected'}});
    }catch{ /* Keep uncertain; no credentials or payload in logs. */ }
  }
  return {attempted};
}

export function privateAnalyticsReplacer(key:string,value:unknown) {return key==='analyticsAttribution'?undefined:value;}
export function withoutPrivateAnalytics<T>(value:T):T {return JSON.parse(JSON.stringify(value,privateAnalyticsReplacer));}
