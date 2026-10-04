import { db } from '../src/lib/db/client';
// Approved scheduled task: removes only analytics data older than 90 days.
async function prune(){
 if(process.env.ANALYTICS_DB_ENABLED!=='true')return;
 const cutoff=new Date(Date.now()-90*86400000);
 await (db as any).$transaction(async(tx:any)=>{
  await tx.analyticsOutbox.deleteMany({where:{createdAt:{lt:cutoff}}});
  await tx.booking.updateMany({where:{createdAt:{lt:cutoff},analyticsReference:{not:null}},data:{analyticsAttribution:require('@prisma/client').Prisma.DbNull,analyticsReference:null}});
 });
}
prune().finally(()=>(db as any).$disconnect());
