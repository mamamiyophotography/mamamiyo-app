import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db/client';
import {sessionById} from '@/lib/constants';
import {recalculateForAddOns} from '@/lib/pricing';

type SetupGroup={slot:number;referencePhotoUrls:string[];note?:string};

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;const body=await req.json();
    const notes=typeof body.setupChoiceNotes==='string'?body.setupChoiceNotes.trim():'';
    const setupSelectionCount=Number(body.setupSelectionCount??0);
    const setupSelections=body.setupSelections as SetupGroup[];
    if(notes.length>1000)throw new Error('Setup notes must be 1,000 characters or fewer.');
    if(!Number.isSafeInteger(setupSelectionCount)||setupSelectionCount<1||setupSelectionCount>3)throw new Error('Choose between 1 and 3 Setups.');
    if(!Array.isArray(setupSelections)||setupSelections.length!==setupSelectionCount||setupSelections.some((group,index)=>group?.slot!==index+1||!Array.isArray(group.referencePhotoUrls)||group.referencePhotoUrls.length>3||group.referencePhotoUrls.some(url=>typeof url!=='string'||url.length>2000)||(group.note!==undefined&&(typeof group.note!=='string'||group.note.length>300))))throw new Error('Each Setup may contain up to 3 valid reference photos and a short note.');
    const referencePhotoUrls=setupSelections.flatMap(group=>group.referencePhotoUrls);
    const prisma=db as any;const booking=await prisma.booking.findUniqueOrThrow({where:{id}});
    if(!['pending','confirmed'].includes(booking.status))throw new Error('Setup choice can only be changed before the session is marked done.');
    const session=sessionById(booking.sessionTypeId);if(!session)throw new Error('Unknown session type.');
    const included=session.referenceSetups||1;const addOnKey=booking.sessionTypeId==='maternity'?'extraOutfit':'extraSetup';
    const addOns={...((booking.addOns||{}) as Record<string,number>)};const additional=Math.max(0,setupSelectionCount-included);
    if(additional)addOns[addOnKey]=additional;else delete addOns[addOnKey];
    const recalculated=recalculateForAddOns(booking,addOns);
    const updated=await prisma.$transaction(async(tx:any)=>{
      const result=await tx.booking.update({where:{id},data:{referencePhotoUrls,setupSelections,setupSelectionCount,setupChoiceNotes:notes,addOns,subtotal:recalculated.subtotal,total:recalculated.total,balanceDue:recalculated.balanceDue,invoiceStale:Boolean(booking.invoiceRef),version:{increment:1}}});
      await tx.bookingAuditLog.create({data:{bookingId:id,action:'update_setup_choice',before:{referencePhotoUrls:booking.referencePhotoUrls,setupSelections:booking.setupSelections,setupSelectionCount:booking.setupSelectionCount,setupChoiceNotes:booking.setupChoiceNotes,addOns:booking.addOns},after:{referencePhotoUrls,setupSelections,setupSelectionCount,setupChoiceNotes:notes,addOns}}});
      return result;
    });
    return NextResponse.json({booking:updated});
  }catch(error){return NextResponse.json({error:(error as Error).message},{status:400});}
}
