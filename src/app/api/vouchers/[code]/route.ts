import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { voucherUsability } from '@/lib/giftVoucher';

export async function GET(_:Request,{params}:{params:Promise<{code:string}>}) {
  const {code}=await params;
  const voucher=await db.giftVoucher.findUnique({where:{code:code.toUpperCase()}});
  if(!voucher) return NextResponse.json({error:'Voucher not recognised.'},{status:404});
  const error=voucherUsability(voucher);
  if(error) return NextResponse.json({error},{status:409});
  return NextResponse.json({code:voucher.code,sessionTypeId:voucher.sessionTypeId,sessionLabel:voucher.sessionLabel,amount:voucher.amount,recipientName:voucher.recipientName,expiresAt:voucher.expiresAt});
}
