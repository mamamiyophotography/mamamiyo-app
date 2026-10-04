import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db/client';
import { deliverOutbox } from '@/lib/analytics/server';
export const maxDuration=60;
export async function GET(req:NextRequest){
 if(!process.env.CRON_SECRET||req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(process.env.ANALYTICS_DB_ENABLED!=='true')return NextResponse.json({disabled:true});
 try{
  const result=await deliverOutbox(db);
  const cutoff=new Date(Date.now()-90*86400000);
  await (db as any).$transaction(async(tx:any)=>{
   await tx.analyticsOutbox.deleteMany({where:{createdAt:{lt:cutoff}}});
   await tx.booking.updateMany({where:{createdAt:{lt:cutoff},analyticsReference:{not:null}},data:{analyticsAttribution:Prisma.DbNull,analyticsReference:null}});
  });
  return NextResponse.json({ok:true,...result});
 }catch{return NextResponse.json({error:'Analytics maintenance unavailable'},{status:500});}
}
