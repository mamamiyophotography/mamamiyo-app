import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;const {orderId}=await req.json();
    const order=await prisma.additionalOrder.findUniqueOrThrow({where:{id:String(orderId)}});
    if(order.bookingId!==id)throw new Error('Order does not belong to this booking');
    if(order.status==='paid')return NextResponse.json({order});
    const base=(process.env.GALLERY_PUBLIC_URL||'https://mamamiyo-gallery.mamamiyo-gallery.workers.dev').replace(/\/$/,'');
    const secret=process.env.GALLERY_SYNC_SECRET||'';
    if(!secret)throw new Error('Gallery sync is not configured');
    const response=await fetch(`${base}/api/${order.galleryId}/order-paid`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${secret}`},body:JSON.stringify({invoiceRef:order.invoiceRef,bonusRetouches:order.bonusRetouches})});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'Gallery could not be updated');}
    const updated=await prisma.additionalOrder.update({where:{id:order.id},data:{status:'paid',paidAt:new Date()}});
    return NextResponse.json({order:updated});
  }catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
}
