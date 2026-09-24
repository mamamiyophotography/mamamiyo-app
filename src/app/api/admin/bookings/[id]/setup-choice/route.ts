import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db/client';
import {sessionById} from '@/lib/constants';
import {recalculateForAddOns} from '@/lib/pricing';

type SetupGroup={slot:number;referencePhotoUrls:string[];note?:string;outfitSource?:'mamamiyo'|'own'|null};

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;const body=await req.json();
    const notes=typeof body.setupChoiceNotes==='string'?body.setupChoiceNotes.trim():'';
    const setupSelectionCount=Number(body.setupSelectionCount??0);
    const setupSelections=body.setupSelections as SetupGroup[];
    const inspirationReferencePhotoUrls=Array.isArray(body.inspirationReferencePhotoUrls)?body.inspirationReferencePhotoUrls:[];
    if(notes.length>1000)throw new Error('Setup notes must be 1,000 characters or fewer.');
    if(!Number.isSafeInteger(setupSelectionCount)||setupSelectionCount<1||setupSelectionCount>3)throw new Error('Choose between 1 and 3 Setups.');
    if(!Array.isArray(setupSelections)||setupSelections.length!==setupSelectionCount||setupSelections.some((group,index)=>group?.slot!==index+1||!Array.isArray(group.referencePhotoUrls)||group.referencePhotoUrls.length>3||group.referencePhotoUrls.some(url=>typeof url!=='string'||url.length>2000)||(group.note!==undefined&&(typeof group.note!=='string'||group.note.length>300))||![undefined,null,'mamamiyo','own'].includes(group.outfitSource)))throw new Error('Each Setup may contain up to 3 valid reference photos, an outfit source and a short note.');
    if(inspirationReferencePhotoUrls.length>10||inspirationReferencePhotoUrls.some((url:unknown)=>typeof url!=='string'||url.length>2000))throw new Error('Inspirational Reference may contain up to 10 photos.');
    const referencePhotoUrls=setupSelections.flatMap(group=>group.referencePhotoUrls);
    const prisma=db as any;const booking=await prisma.booking.findUniqueOrThrow({where:{id}});
    if(!['pending','confirmed'].includes(booking.status))throw new Error('Setup choice can only be changed before the session is marked done.');
    const session=sessionById(booking.sessionTypeId);if(!session)throw new Error('Unknown session type.');
    const included=session.referenceSetups||1;const addOnKey=booking.sessionTypeId==='maternity'?'extraOutfit':'extraSetup';
    const addOns={...((booking.addOns||{}) as Record<string,number>)};const additional=Math.max(0,setupSelectionCount-included);
    if(additional)addOns[addOnKey]=additional;else delete addOns[addOnKey];
    const recalculated=recalculateForAddOns(booking,addOns);
    const updated=await prisma.$transaction(async(tx:any)=>{
      const result=await tx.booking.update({where:{id},data:{referencePhotoUrls,setupSelections,inspirationReferencePhotoUrls,setupSelectionCount,setupChoiceNotes:notes,addOns,subtotal:recalculated.subtotal,total:recalculated.total,balanceDue:recalculated.balanceDue,invoiceStale:Boolean(booking.invoiceRef),version:{increment:1}}});
      await tx.bookingAuditLog.create({data:{bookingId:id,action:'update_setup_choice',before:{referencePhotoUrls:booking.referencePhotoUrls,setupSelections:booking.setupSelections,inspirationReferencePhotoUrls:booking.inspirationReferencePhotoUrls,setupSelectionCount:booking.setupSelectionCount,setupChoiceNotes:booking.setupChoiceNotes,addOns:booking.addOns},after:{referencePhotoUrls,setupSelections,inspirationReferencePhotoUrls,setupSelectionCount,setupChoiceNotes:notes,addOns}}});
      return result;
    });
    return NextResponse.json({booking:updated});
  }catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
}
