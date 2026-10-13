import { NextRequest,NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const body=await req.json();
  const existing=await db.giftVoucher.findUnique({where:{id}}); if(!existing)return NextResponse.json({error:'Voucher not found.'},{status:404});
  if(body.action==='confirm_payment') return NextResponse.json({voucher:await db.giftVoucher.update({where:{id},data:{paymentStatus:'paid',status:'active',paidAt:new Date()}})});
  if(body.action==='cancel') return NextResponse.json({voucher:await db.giftVoucher.update({where:{id},data:{status:'cancelled'}})});
  if(body.action==='extend') {const expiresAt=new Date(existing.expiresAt||new Date());expiresAt.setMonth(expiresAt.getMonth()+Number(body.months||3));return NextResponse.json({voucher:await db.giftVoucher.update({where:{id},data:{expiresAt}})});}
  return NextResponse.json({error:'Unknown action.'},{status:400});
}
