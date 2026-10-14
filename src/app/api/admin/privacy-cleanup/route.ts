import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db/client';

export async function GET(){
  const galleries=await db.galleryInbox.findMany({where:{privacyGalleryDeletedAt:{not:null},privacyLocalDeletedAt:null},select:{galleryId:true,bookingId:true,expiresAt:true}});
  const jobs=[];
  for(const gallery of galleries){
    const booking=await db.booking.findUnique({where:{id:gallery.bookingId},select:{id:true,ref:true,date:true,clientName:true,sessionTypeId:true,sessionLabel:true,bundleSessionNumber:true,photoSharingConsent:true}});
    if(booking?.photoSharingConsent==='private')jobs.push({...gallery,booking});
  }
  return NextResponse.json({jobs});
}

export async function POST(req:NextRequest){
  try{
    const {galleryId}=await req.json() as {galleryId?:string};
    if(!galleryId)throw new Error('Gallery ID is required.');
    const gallery=await db.galleryInbox.findUniqueOrThrow({where:{galleryId}});
    const booking=await db.booking.findUniqueOrThrow({where:{id:gallery.bookingId}});
    if(booking.photoSharingConsent!=='private'||!gallery.privacyGalleryDeletedAt)throw new Error('This folder is not eligible for privacy cleanup.');
    if(!gallery.privacyLocalDeletedAt)await db.$transaction([
      db.galleryInbox.update({where:{galleryId},data:{privacyLocalDeletedAt:new Date()}}),
      db.bookingAuditLog.create({data:{bookingId:booking.id,action:'private_local_folder_deleted',before:{galleryId},after:{deletedAt:new Date()}}}),
    ]);
    return NextResponse.json({ok:true});
  }catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
}
