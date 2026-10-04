// Synthetic, developer-filtered MP check. No booking records or notifications.
const fs=require('node:fs'),crypto=require('node:crypto');
async function main(){
 const secret=fs.readFileSync('.vercel/ga4-secret.tmp','utf8').trim();
 const client=JSON.parse(fs.readFileSync('.vercel/ga4-debug-client.json','utf8'));
 const payload={client_id:client.clientId,consent:{ad_user_data:'DENIED',ad_personalization:'DENIED'},events:[{name:'booking_confirmed',params:{debug_mode:true,session_id:client.sessionId,engagement_time_msec:1,booking_reference:crypto.randomUUID(),package_type:'newborn',value:0,currency:'SGD',value_basis:'synthetic_test',source:'direct',medium:'none',landing_page:'/package'}}]};
 const url=`https://www.google-analytics.com/debug/mp/collect?measurement_id=G-46ZYQWWCYP&api_secret=${encodeURIComponent(secret)}`;
 const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,validation_behavior:'ENFORCE_RECOMMENDATIONS'}),signal:AbortSignal.timeout(10000)});
 const data=await res.json();
 console.log(JSON.stringify({validationStatus:res.status,validationMessages:data.validationMessages}));
 if(data.validationMessages?.length)throw new Error('VALIDATION_FAILED');
 const live=await fetch(url.replace('/debug/mp/','/mp/'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
 console.log(JSON.stringify({syntheticDebugSendStatus:live.status,noDatabaseWrites:true,noNotifications:true}));
 fs.writeFileSync('docs/analytics/mp-validation-result.json',JSON.stringify({checkedAt:new Date().toISOString(),validationStatus:res.status,validationMessages:data.validationMessages,syntheticDebugSendStatus:live.status,realBookingCreated:false},null,2));
}
main().catch(e=>{console.error('GA4 verification failed',e.name);process.exitCode=1}).finally(()=>{try{fs.unlinkSync('.vercel/ga4-secret.tmp')}catch{}});
