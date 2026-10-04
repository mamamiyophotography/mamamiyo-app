import { NextRequest,NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return new NextResponse(null,{status:403});
 if(process.env.ANALYTICS_DB_ENABLED!=='true')return new NextResponse(null,{status:204});
 let references:unknown;try{references=(await req.json()).references;}catch{return new NextResponse(null,{status:400});}
 if(!Array.isArray(references)||references.length>20||references.some(ref=>typeof ref!=='string'||! /^[0-9a-f-]{36}$/.test(ref)))return new NextResponse(null,{status:400});
 await (db as any).$transaction(async(tx:any)=>{
  const bookings=await tx.booking.findMany({where:{analyticsReference:{in:references}},select:{id:true}});
  await tx.analyticsOutbox.deleteMany({where:{bookingId:{in:bookings.map((b:{id:string})=>b.id)}}});
  await tx.booking.updateMany({where:{analyticsReference:{in:references}},data:{analyticsAttribution:require('@prisma/client').Prisma.DbNull}});
 });
 // No existence oracle, order information or cookie ID returned.
 return new NextResponse(null,{status:204});
}
