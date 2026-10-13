import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
export async function GET(){return NextResponse.json({vouchers:await db.giftVoucher.findMany({orderBy:{createdAt:'desc'},include:{booking:{select:{ref:true,clientName:true}}}})});}
