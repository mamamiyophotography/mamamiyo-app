import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.availabilityBlock.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
