import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;const body=await req.json();const urls=body.referencePhotoUrls;const notes=typeof body.setupChoiceNotes==='string'?body.setupChoiceNotes.trim():'';
    if(!Array.isArray(urls)||urls.length>5||urls.some((url:unknown)=>typeof url!=='string'||url.length>2000))return NextResponse.json({error:'Up to 5 valid Setup choice images are allowed.'},{status:400});
    if(notes.length>1000)return NextResponse.json({error:'Setup notes must be 1,000 characters or fewer.'},{status:400});
    const booking=await db.booking.findUniqueOrThrow({where:{id}});
    if(!['pending','confirmed'].includes(booking.status))return NextResponse.json({error:'Setup choice can only be changed before the session is marked done.'},{status:409});
    const updated=await db.booking.update({where:{id},data:{referencePhotoUrls:urls,setupChoiceNotes:notes,version:{increment:1}}});
    await db.bookingAuditLog.create({data:{bookingId:id,action:'update_setup_choice',before:{referencePhotoUrls:booking.referencePhotoUrls,setupChoiceNotes:booking.setupChoiceNotes},after:{referencePhotoUrls:urls,setupChoiceNotes:notes}}});
    return NextResponse.json({booking:updated});
  }catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
}
