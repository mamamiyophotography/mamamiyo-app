import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;const body=await req.json();const urls=body.referencePhotoUrls;
    if(!Array.isArray(urls)||urls.length>5||urls.some((url:unknown)=>typeof url!=='string'||url.length>2000))return NextResponse.json({error:'Up to 5 valid Setup choice images are allowed.'},{status:400});
    const booking=await prisma.booking.findUniqueOrThrow({where:{id}});
    if(!['pending','confirmed'].includes(booking.status))return NextResponse.json({error:'Setup choice can only be changed before the session is marked done.'},{status:409});
    const updated=await prisma.booking.update({where:{id},data:{referencePhotoUrls:urls,version:{increment:1}}});
    await prisma.bookingAuditLog.create({data:{bookingId:id,action:'update_setup_choice',before:{referencePhotoUrls:booking.referencePhotoUrls},after:{referencePhotoUrls:urls}}});
    return NextResponse.json({booking:updated});
  }catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
}
