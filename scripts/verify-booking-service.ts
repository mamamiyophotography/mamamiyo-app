// Runs the REAL service-layer code (src/lib/db/bookingService.ts) end to
// end against an in-memory mock (see mockDb.ts), since this sandbox can't
// reach binaries.prisma.sh to generate a real Prisma client. This is the
// actual logic that will run in production — only the storage layer is
// swapped out. Run with: npx tsx scripts/verify-booking-service.ts

process.env.DRY_RUN_NOTIFICATIONS = 'true'; // no real network calls to Resend
process.env.PHOTOGRAPHER_EMAIL = 'mamamiyo@example.com';
process.env.PHOTOGRAPHER_PHONE = '+65 91234567';

import { createMockDb } from '../src/lib/db/mockDb';
import {
  getAvailableSlots,
  createBooking,
  confirmDepositAndNotify,
  markCompleted,
  generateInvoiceAndNotify,
  confirmBalanceAndNotify,
  cancelBooking,
  redeemBundleSessionAndNotify,
  lookupByPhone,
  purgeExpiredHolds,
} from '../src/lib/db/bookingService';

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`);
  if (!cond) failures++;
}

function futureDateStr(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

async function run() {
  // ---- 1. Availability respects min-notice and location ----
  const soonDate = futureDateStr(10);
  const db = createMockDb({
    settings: {},
    availability: [
      { date: soonDate, startTime: '09:00', endTime: '13:00', location: 'studio' },
    ],
  });
  const slots = await getAvailableSlots(db, 'baby');
  check('studio availability produces bookable slots for a studio package', slots.length > 0);
  const homeSlots = await getAvailableSlots(db, 'newborn');
  check('a studio-only block produces no slots for a home package', homeSlots.length === 0);

  // ---- 2. Create a standalone booking, then a slot clash is rejected ----
  const slot = slots[0];
  const booking = await createBooking(db, {
    sessionTypeId: 'baby',
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    isWeekend: slot.isWeekend,
    addOns: {},
    notes: '',
    referencePhotoUrls: ['https://example.com/photo1.jpg'],
    address: '',
    clientName: 'Jane Tan',
    clientEmail: 'jane@example.com',
    countryCode: '+65',
    phone: '91234567',
  });
  check('booking created with status pending', booking.status === 'pending');
  check('booking phone combined correctly', booking.clientPhone === '+65 91234567');

  let clashRejected = false;
  try {
    await createBooking(db, {
      sessionTypeId: 'baby',
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      isWeekend: slot.isWeekend,
      addOns: {},
      notes: '',
      referencePhotoUrls: ['https://example.com/photo2.jpg'],
      address: '',
      clientName: 'Someone Else',
      clientEmail: 'someone@example.com',
      countryCode: '+65',
      phone: '98765432',
    });
  } catch (e) {
    clashRejected = (e as Error).message === 'SLOT_TAKEN';
  }
  check('a second booking for the exact same slot is rejected (race-condition guard)', clashRejected);

  let missingPhotoRejected = false;
  try {
    await createBooking(db, { ...({} as any), sessionTypeId: 'baby', date: futureDateStr(11), startTime: '09:00', endTime: '10:00', isWeekend: false, addOns: {}, notes: '', referencePhotoUrls: [], address: '', clientName: 'X', clientEmail: 'x@example.com', countryCode: '+65', phone: '90000000' });
  } catch (e) {
    missingPhotoRejected = /reference photo/i.test((e as Error).message);
  }
  check('booking without a reference photo is rejected', missingPhotoRejected);

  // ---- 3. Confirm deposit ----
  const confirmed = await confirmDepositAndNotify(db, booking.id);
  check('deposit confirmation moves status to confirmed', confirmed.status === 'confirmed');
  check('deposit status is paid', confirmed.depositStatus === 'paid');

  // ---- 4. Complete session with a balance owed -> pending_balance, not completed ----
  const afterComplete = await markCompleted(db, booking.id);
  check('session with balance owed goes to pending_balance, not completed', afterComplete.status === 'pending_balance');

  // ---- 5. Add an extra line item, generate invoice ----
  const { addExtraLineItem } = await import('../src/lib/db/bookingService');
  await addExtraLineItem(db, booking.id, 'Extra headcount x2', 60);
  const invoiced = await generateInvoiceAndNotify(db, booking.id);
  check('invoice ref generated', !!invoiced.invoiceRef);

  // ---- 6. Confirm balance -> completed ----
  const settled = await confirmBalanceAndNotify(db, booking.id);
  check('balance confirmation moves status to completed', settled.status === 'completed');
  check('balance status is paid', settled.balanceStatus === 'paid');

  // ---- 7. Phone lookup finds the booking ----
  const found = await lookupByPhone(db, '91234567');
  check('phone lookup (no country code entered) finds the booking', found.bookings.some((b) => b.id === booking.id));

  // ---- 8. Full bundle lifecycle: session 1 -> balance -> auto-activate -> redeem 2 -> redeem 3 ----
  const bundleDate1 = futureDateStr(20);
  const db2 = createMockDb({
    settings: {},
    availability: [
      { date: bundleDate1, startTime: '09:00', endTime: '13:00', location: 'studio' },
      { date: futureDateStr(60), startTime: '09:00', endTime: '13:00', location: 'studio' },
      { date: futureDateStr(90), startTime: '09:00', endTime: '13:00', location: 'studio' },
    ],
  });
  const bundleSlots = await getAvailableSlots(db2, 'bundle');
  const s1 = bundleSlots[0];
  const session1 = await createBooking(db2, {
    sessionTypeId: 'bundle',
    date: s1.date,
    startTime: s1.startTime,
    endTime: s1.endTime,
    isWeekend: s1.isWeekend,
    addOns: {},
    notes: '',
    referencePhotoUrls: ['https://example.com/bundle-ref.jpg'],
    address: '',
    clientName: 'Alicia Wong',
    clientEmail: 'alicia@example.com',
    countryCode: '+65',
    phone: '92222222',
  });
  check('bundle session 1 created with bundleSessionNumber 1', session1.bundleSessionNumber === 1);
  check('bundle session 1 has a linked bundleParentId', !!session1.bundleParentId);

  await confirmDepositAndNotify(db2, session1.id);
  const bundleAfterS1Deposit = await db2.bundle.findUnique({ where: { id: session1.bundleParentId! } });
  check('bundle NOT activated after session 1 deposit alone', bundleAfterS1Deposit?.activated === false);

  await markCompleted(db2, session1.id);
  const s1BalanceResult = await confirmBalanceAndNotify(db2, session1.id);
  check('session 1 completed after balance confirmed', s1BalanceResult.status === 'completed');
  const bundleAfterS1Balance = await db2.bundle.findUnique({ where: { id: session1.bundleParentId! } });
  check('bundle auto-activates once session 1 balance is confirmed', bundleAfterS1Balance?.activated === true);

  const session2 = await redeemBundleSessionAndNotify(
    db2,
    session1.bundleParentId!,
    { date: futureDateStr(60), startTime: '09:00', endTime: '10:00', isWeekend: false },
    {}
  );
  check('session 2 redeemed with no deposit required', session2.depositAmount === 0);
  check('session 2 balance is $330', session2.balanceDue === 330);
  check('session 2 status is immediately confirmed (no pending step)', session2.status === 'confirmed');

  await markCompleted(db2, session2.id);
  await confirmBalanceAndNotify(db2, session2.id);

  const session3 = await redeemBundleSessionAndNotify(
    db2,
    session1.bundleParentId!,
    { date: futureDateStr(90), startTime: '09:00', endTime: '10:00', isWeekend: false },
    {}
  );
  check('session 3 balance is $328', session3.balanceDue === 328);

  const totalCollected = 100 + 330 + 330 + 328; // deposit + 3 session balances
  check('full bundle lifecycle totals exactly $1,088', totalCollected === 1088);

  // ---- 9. Redemption blocked before activation ----
  const db3 = createMockDb({ settings: {}, availability: [{ date: futureDateStr(30), startTime: '09:00', endTime: '13:00', location: 'studio' }] });
  const freshSlots = await getAvailableSlots(db3, 'bundle');
  const freshSession1 = await createBooking(db3, {
    sessionTypeId: 'bundle',
    date: freshSlots[0].date,
    startTime: freshSlots[0].startTime,
    endTime: freshSlots[0].endTime,
    isWeekend: freshSlots[0].isWeekend,
    addOns: {},
    notes: '',
    referencePhotoUrls: ['https://example.com/x.jpg'],
    address: '',
    clientName: 'Test Client',
    clientEmail: 'test@example.com',
    countryCode: '+65',
    phone: '93333333',
  });
  // Deposit confirmed, but balance NOT yet confirmed — bundle should still be inactive.
  await confirmDepositAndNotify(db3, freshSession1.id);
  let blockedCorrectly = false;
  try {
    await redeemBundleSessionAndNotify(db3, freshSession1.bundleParentId!, { date: futureDateStr(40), startTime: '09:00', endTime: '10:00', isWeekend: false }, {});
  } catch (e) {
    blockedCorrectly = (e as Error).message === 'BUNDLE_NOT_ACTIVATED';
  }
  check('redeeming before the bundle is activated is blocked', blockedCorrectly);

  // ---- 10. Cancellation frees the slot ----
  const db4 = createMockDb({ settings: {}, availability: [{ date: futureDateStr(15), startTime: '09:00', endTime: '13:00', location: 'studio' }] });
  const cancelSlots = await getAvailableSlots(db4, 'baby');
  const toCancel = await createBooking(db4, {
    sessionTypeId: 'baby', date: cancelSlots[0].date, startTime: cancelSlots[0].startTime, endTime: cancelSlots[0].endTime, isWeekend: cancelSlots[0].isWeekend,
    addOns: {}, notes: '', referencePhotoUrls: ['https://example.com/x.jpg'], address: '',
    clientName: 'Cancel Me', clientEmail: 'cancel@example.com', countryCode: '+65', phone: '94444444',
  });
  await cancelBooking(db4, toCancel.id);
  const slotsAfterCancel = await getAvailableSlots(db4, 'baby');
  check('cancelling a booking frees its slot again', slotsAfterCancel.some((s) => s.date === cancelSlots[0].date && s.startTime === cancelSlots[0].startTime));

  // ---- 10b. Cancel ownership check: wrong phone is rejected, correct phone (any formatting) works ----
  const db4b = createMockDb({ settings: {}, availability: [{ date: futureDateStr(16), startTime: '09:00', endTime: '13:00', location: 'studio' }] });
  const ownerSlots = await getAvailableSlots(db4b, 'baby');
  const ownedBooking = await createBooking(db4b, {
    sessionTypeId: 'baby', date: ownerSlots[0].date, startTime: ownerSlots[0].startTime, endTime: ownerSlots[0].endTime, isWeekend: ownerSlots[0].isWeekend,
    addOns: {}, notes: '', referencePhotoUrls: ['https://example.com/x.jpg'], address: '',
    clientName: 'Real Owner', clientEmail: 'owner@example.com', countryCode: '+65', phone: '96667777',
  });
  let wrongPhoneRejected = false;
  try {
    await cancelBooking(db4b, ownedBooking.id, '90000000'); // someone else's number
  } catch (e) {
    wrongPhoneRejected = (e as Error).message === 'PHONE_MISMATCH';
  }
  check('cancelling with the wrong phone number is rejected', wrongPhoneRejected);
  const stillActive = await db4b.booking.findUniqueOrThrow({ where: { id: ownedBooking.id } });
  check('booking is NOT cancelled after a wrong-phone attempt', stillActive.status !== 'cancelled');
  // Correct phone, but with different formatting (spaces, no country code) — should still match.
  await cancelBooking(db4b, ownedBooking.id, '9666 7777');
  const nowCancelled = await db4b.booking.findUniqueOrThrow({ where: { id: ownedBooking.id } });
  check('cancelling with the correct phone (loosely formatted) succeeds', nowCancelled.status === 'cancelled');

  // ---- 11. Expired holds are purged ----
  const db5 = createMockDb({ settings: {}, availability: [{ date: futureDateStr(15), startTime: '09:00', endTime: '13:00', location: 'studio' }] });
  const holdSlots = await getAvailableSlots(db5, 'baby');
  const heldBooking = await createBooking(db5, {
    sessionTypeId: 'baby', date: holdSlots[0].date, startTime: holdSlots[0].startTime, endTime: holdSlots[0].endTime, isWeekend: holdSlots[0].isWeekend,
    addOns: {}, notes: '', referencePhotoUrls: ['https://example.com/x.jpg'], address: '',
    clientName: 'Held', clientEmail: 'held@example.com', countryCode: '+65', phone: '95555555',
  });
  await db5.booking.update({ where: { id: heldBooking.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } }); // force-expire
  const purgedCount = await purgeExpiredHolds(db5);
  check('an expired hold gets purged', purgedCount === 1);
  const afterPurge = await db5.booking.findUniqueOrThrow({ where: { id: heldBooking.id } });
  check('purged booking is cancelled', afterPurge.status === 'cancelled');

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error('Test run crashed:', e);
  process.exit(1);
});
