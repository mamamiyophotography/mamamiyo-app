import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSettings } from '@/lib/db/bookingService';
import { buildPayNowPayload } from '@/lib/paynow';
import { giftVoucherCode, voucherExpiry, voucherPackage } from '@/lib/giftVoucher';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const purchaserName=String(body.purchaserName||'').trim(), purchaserEmail=String(body.purchaserEmail||'').trim();
    const purchaserPhone=String(body.purchaserPhone||'').trim(), recipientName=String(body.recipientName||'').trim();
    if(!purchaserName||!purchaserEmail||!purchaserPhone||!recipientName) return NextResponse.json({error:'Complete the purchaser and recipient details.'},{status:400});
    const session=voucherPackage(String(body.sessionTypeId||''));
    let code=giftVoucherCode();
    while(await db.giftVoucher.findUnique({where:{code}})) code=giftVoucherCode();
    const voucher=await db.giftVoucher.create({data:{
      code,purchaserName,purchaserEmail,purchaserPhone,recipientName,
      recipientEmail:String(body.recipientEmail||'').trim(),recipientPhone:String(body.recipientPhone||'').trim(),
      senderName:String(body.senderName||purchaserName).trim(),message:String(body.message||'').trim().slice(0,500),
      sessionTypeId:session.id,sessionLabel:session.name,amount:session.price,expiresAt:voucherExpiry(),
    }});
    const settings=await getSettings(db); let payNowPayload:null|string=null;
    const mobile=(settings.paynowMobile||'').replace(/\D/g,'').slice(-8);
    if(mobile.length===8) payNowPayload=buildPayNowPayload({mobile8:mobile,amount:voucher.amount,refNumber:voucher.code,merchantName:settings.businessName});
    return NextResponse.json({voucher:{code:voucher.code,sessionLabel:voucher.sessionLabel,amount:voucher.amount,status:voucher.status},payNowPayload},{status:201});
  } catch(error) { return NextResponse.json({error:(error as Error).message},{status:400}); }
}
