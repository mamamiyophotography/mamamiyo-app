import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

const STEPS = {
  basic: new Set(['folders', 'lightroom', 'codex', 'photoshop']),
  further: new Set(['selection', 'pixelcake', 'photoshop']),
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const workflow = body.workflow === 'further' ? 'further' : 'basic';
    if (!STEPS[workflow].has(body.step) || typeof body.completed !== 'boolean') throw new Error('Invalid retouch step.');
    await db.booking.findUniqueOrThrow({ where: { id } });
    await db.bookingAuditLog.create({ data: {
      bookingId: id,
      action: `${workflow}_retouch_progress`,
      before: {},
      after: { step: body.step, completed: body.completed },
    } });
    return NextResponse.json({ step: body.step, completed: body.completed });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
