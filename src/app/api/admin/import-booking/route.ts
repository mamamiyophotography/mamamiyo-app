import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { SESSION_TYPES, BUNDLE_SESSION_BALANCES } from '@/lib/constants';

function refCode(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function endTime(startTime: string, durationMin: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + durationMin;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionTypeId, date, startTime, clientName, clientEmail, phone,
      address, notes, status, isWeekend, bundleSessionsDone } = body;

    const st = SESSION_TYPES.find(s => s.id === sessionTypeId);
    if (!st) return NextResponse.json({ error: 'Unknown session type' }, { status: 400 });

    const weekendFee = isWeekend ? 50 : 0;
    const et = endTime(startTime, st.durationMin || 60);
    const clientPhone = phone.startsWith('+') ? phone : `+65${phone}`;

    if (st.isBundle) {
      const bundleRef = refCode('BDL');
      const bundle = await db.bundle.create({
        data: {
          ref: bundleRef,
          clientName, clientEmail,
          clientPhone,
          depositAmount: 100,
          depositStatus: 'paid',
          activated: true,
        },
      });

      const refs: string[] = [];
      for (let i = 0; i < bundleSessionsDone; i++) {
        const sessionNum = i + 1;
        const isLastSession = i === bundleSessionsDone - 1;

        // All sessions before the last one are always completed.
        // The last session uses the status selected in the import form.
        const sessionStatus = isLastSession ? status : 'completed';

        // balanceStatus: last session follows import status, earlier sessions are paid
        const sessionBalanceStatus = isLastSession
          ? (status === 'completed' ? 'paid' : status === 'pending_balance' ? 'pending' : 'n/a')
          : 'paid';

        const sessionLabel = `First Year Bundle — session ${sessionNum} of 3`;
        const baseBalance = BUNDLE_SESSION_BALANCES[i] || 330;
        const total = sessionNum === 1 ? baseBalance + 100 + weekendFee : baseBalance + weekendFee;
        const depositAmount = sessionNum === 1 ? 100 : 0;

        // balanceDue: 0 if completed or confirmed, full balance if pending_balance
        const balanceDue = (sessionStatus === 'completed' || sessionStatus === 'confirmed') ? 0 : baseBalance + weekendFee;

        const ref = refCode('MMY');
        await db.booking.create({
          data: {
            ref,
            sessionTypeId: 'bundle',
            sessionLabel,
            location: 'studio',
            date,
            startTime,
            endTime: et,
            isWeekend: sessionNum === 1 ? isWeekend : false,
            addOns: {},
            notes,
            referencePhotoUrls: [],
            clientName, clientEmail, clientPhone,
            subtotal: total,
            total,
            depositAmount,
            balanceDue,
            discountCode: null,
            discountAmount: 0,
            status: sessionStatus,
            depositStatus: 'paid',
            balanceStatus: sessionBalanceStatus,
            bundleParentId: bundle.id,
            bundleSessionNumber: sessionNum,
          },
        });
        refs.push(ref);
      }
      return NextResponse.json({ ok: true, ref: refs[0], bundleRef });
    }

    // Non-bundle booking
    const ref = refCode('MMY');
    const depositAmount = 100;
    const sessionPrice = st.price || 0;
    const total = sessionPrice + weekendFee;
    const balanceDue = status === 'completed' ? 0 : total - depositAmount;

    await db.booking.create({
      data: {
        ref,
        sessionTypeId,
        sessionLabel: st.name,
        location: st.location,
        date, startTime,
        endTime: et,
        isWeekend,
        addOns: {},
        notes,
        address: address || '',
        referencePhotoUrls: [],
        clientName, clientEmail, clientPhone,
        subtotal: total,
        total,
        depositAmount,
        balanceDue: status === 'completed' ? 0 : balanceDue,
        discountCode: null,
        discountAmount: 0,
        status,
        depositStatus: 'paid',
        balanceStatus: status === 'completed' ? 'paid' : status === 'pending_balance' ? 'pending' : 'n/a',
        bundleParentId: null,
        bundleSessionNumber: null,
      },
    });

    return NextResponse.json({ ok: true, ref });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
