import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET(_req: NextRequest, {params}: {params: Promise<{code:string}>}) {
  const {code} = await params;
  if (!/^[a-f0-9]{12}$/.test(code)) return new NextResponse('Gallery not found', {status:404});
  const matches = await db.galleryInbox.findMany({
    where:{galleryId:{startsWith:code}},
    select:{clientUrl:true},
    take:2,
  });
  if (matches.length !== 1 || !matches[0].clientUrl) return new NextResponse('Gallery not found', {status:404});
  return NextResponse.redirect(matches[0].clientUrl, 302);
}
