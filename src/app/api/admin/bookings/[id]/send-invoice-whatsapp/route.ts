import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db/client';
import {sendWhatsAppImage} from '@/lib/whatsapp';
import {finishNotification,reserveNotification} from '@/lib/notificationCooldown';

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const {imageDataUrl,caption}=await req.json() as {imageDataUrl?:string;caption?:string};
    if(!imageDataUrl?.startsWith('data:image/png;base64,'))throw new Error('A valid invoice image is required.');
    if(imageDataUrl.length>8_000_000)throw new Error('The invoice image is too large to send by WhatsApp.');
    if(!caption?.trim())throw new Error('The WhatsApp message is required.');
    if(!process.env.WHAPI_TOKEN)throw new Error('WHAPI_TOKEN is missing, so the invoice was not sent.');
    const booking=await db.booking.findUniqueOrThrow({where:{id},select:{clientPhone:true}});
    if(!booking.clientPhone)throw new Error('Client phone is required.');
    const reservation=await reserveNotification(db,id,'invoice_whatsapp');
    try{
      await sendWhatsAppImage(booking.clientPhone,imageDataUrl,caption);
      await finishNotification(db,reservation.id,'sent','Invoice image and caption sent by WhatsApp');
    }catch(error){await finishNotification(db,reservation.id,'failed',(error as Error).message);throw error;}
    return NextResponse.json({ok:true});
  }catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
}
