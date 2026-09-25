import {NextRequest,NextResponse} from 'next/server';
import {PrismaClient} from '@prisma/client';

const prisma=new PrismaClient();
const galleryBase=process.env.GALLERY_PUBLIC_URL||'https://mamamiyo-gallery.mamamiyo-gallery.workers.dev';
function config(){const secret=process.env.GALLERY_SYNC_SECRET;if(!secret)return null;return {headers:{Authorization:`Bearer ${secret}`}}}
async function owned(bookingId:string,galleryId:string){
  return prisma.galleryInbox.findFirst({where:{bookingId,galleryId}});
}
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const galleryId=req.nextUrl.searchParams.get('galleryId')||'';const cfg=config();
  if(!cfg)return NextResponse.json({error:'Gallery connection is not configured.'},{status:503});
  if(!await owned(id,galleryId))return NextResponse.json({error:'Gallery not found for this booking.'},{status:404});
  const photoId=req.nextUrl.searchParams.get('photoId');
  const path=photoId?`manage-preview/${encodeURIComponent(photoId)}`:'manage';
  const response=await fetch(`${galleryBase}/api/${galleryId}/${path}`,{headers:cfg.headers,cache:'no-store'});
  if(photoId)return new NextResponse(response.body,{status:response.status,headers:{'Content-Type':response.headers.get('content-type')||'image/jpeg','Cache-Control':'no-store'}});
  const body=await response.json();return NextResponse.json(body,{status:response.status});
}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const galleryId=req.nextUrl.searchParams.get('galleryId')||'';const cfg=config();
  if(!cfg)return NextResponse.json({error:'Gallery connection is not configured.'},{status:503});
  if(!await owned(id,galleryId))return NextResponse.json({error:'Gallery not found for this booking.'},{status:404});
  const input=await req.json();
  const response=await fetch(`${galleryBase}/api/${galleryId}/manage-delete`,{method:'POST',headers:{...cfg.headers,'Content-Type':'application/json'},body:JSON.stringify(input)});
  const body=await response.json();
  if(response.ok&&body.deletedGallery)await prisma.galleryInbox.delete({where:{galleryId}});
  return NextResponse.json(body,{status:response.status});
}
