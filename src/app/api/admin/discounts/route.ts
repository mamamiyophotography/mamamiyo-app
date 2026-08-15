import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET() {
  const codes = await db.discountCode.findMany();
  return NextResponse.json({ codes });
}

export async function POST(req: NextRequest) {
  let body: { code?: string; description?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.code || typeof body.amount !== 'number') {
    return NextResponse.json({ error: 'code and amount are required' }, { status: 400 });
  }
  const existing = await db.discountCode.findUnique({ where: { code: body.code.toUpperCase() } });
  if (existing) {
    return NextResponse.json({ error: 'That code already exists' }, { status: 409 });
  }
  const created = await db.discountCode.create({
    data: { code: body.code.toUpperCase(), description: body.description || '', amount: body.amount },
  });
  return NextResponse.json({ code: created }, { status: 201 });
}
