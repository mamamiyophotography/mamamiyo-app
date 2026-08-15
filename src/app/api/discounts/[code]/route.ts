import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const found = await db.discountCode.findUnique({ where: { code: code.toUpperCase() } });
  if (!found) {
    return NextResponse.json({ valid: false }, { status: 404 });
  }
  return NextResponse.json({ valid: true, code: found.code, amount: found.amount, description: found.description });
}
