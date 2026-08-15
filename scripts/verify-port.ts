// Sanity-checks the ported lib/ code against the same cases already
// verified in the prototype, to catch any porting mistakes before this
// becomes the system of record. Run with: npx tsx scripts/verify-port.ts
import { buildPayNowPayload } from '../src/lib/paynow';
import { computeAddOnsTotal, computeBookingPricing, computeBundleRedemptionPricing } from '../src/lib/pricing';
import { generateCandidateSlots, isSurchargeDate } from '../src/lib/availability';
import { SESSION_TYPES, BUNDLE_SESSION_BALANCES, sessionById, prepLinkFor } from '../src/lib/constants';

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`);
  if (!cond) failures++;
}

// 1. PayNow payload — same case verified in the prototype
const payload = buildPayNowPayload({ mobile8: '97600798', amount: 100, refNumber: 'MMY-TEST1', merchantName: 'Mamamiyo Photography' });
check('PayNow payload encodes mobile with +65 prefix', payload.includes('+6597600798'));
check('PayNow payload encodes amount 100.00', payload.includes('54061'));
check('PayNow payload ends with 4-char CRC', /[0-9A-F]{4}$/.test(payload));

// 2. Add-on totals
check('add-on total (2 setups + 3 headcount)', computeAddOnsTotal({ extraSetup: 2, headcount: 3 }) === 290);

// 3. Bundle math — must total exactly $1,088
const bundleTotal = 100 + BUNDLE_SESSION_BALANCES[0] + BUNDLE_SESSION_BALANCES[1] + BUNDLE_SESSION_BALANCES[2];
check('bundle deposit + 3 balances = $1,088', bundleTotal === 1088);

// 4. Session 1 of bundle pricing (matches the $430/$330/$100 screenshot case)
const bundleType = sessionById('bundle')!;
const s1 = computeBookingPricing({
  sessionType: bundleType,
  addOns: {},
  isWeekend: false,
  weekendSurchargeAmount: 50,
  depositAmount: 100,
});
check('bundle session 1 price = $430', s1.sessionPrice === 430);
check('bundle session 1 total = $430', s1.total === 430);
check('bundle session 1 balance = $330', s1.balanceDue === 330);
check('bundle session 1 deposit = $100', s1.depositAmount === 100);

// 5. Bundle redemption pricing for sessions 2 and 3
const r2 = computeBundleRedemptionPricing(1, {}, false, 50); // sessionIndex 1 = session 2
check('bundle session 2 balance = $330', r2.balanceDue === 330);
const r3 = computeBundleRedemptionPricing(2, {}, false, 50); // sessionIndex 2 = session 3
check('bundle session 3 balance = $328', r3.balanceDue === 328);

// 6. Weekend/PH surcharge detection
const publicHolidays = [{ date: '2026-12-25' }];
check('Saturday is a surcharge date', isSurchargeDate('2026-08-22', new Date('2026-08-22T00:00:00').getDay(), publicHolidays));
check('listed PH weekday is a surcharge date', isSurchargeDate('2026-12-25', new Date('2026-12-25T00:00:00').getDay(), publicHolidays));
check('ordinary weekday is not a surcharge date', !isSurchargeDate('2026-08-19', new Date('2026-08-19T00:00:00').getDay(), publicHolidays));

// 7. Prep link wording — "Milestone Stage" only for bundle sessions
const newbornLink = prepLinkFor({ sessionTypeId: 'newborn', sessionLabel: 'Newborn Photoshoot' });
check('standalone Newborn uses plain wording, not "Milestone Stage"', !!newbornLink && !newbornLink.note.includes('Milestone'));
const bundleLink1 = prepLinkFor({ sessionTypeId: 'bundle', sessionLabel: 'x', bundleSessionNumber: 1 });
check('bundle session 1 uses "Milestone Stage 1" wording', bundleLink1?.note === 'Milestone Stage 1 preparation');

// 8. Availability generation — a studio block should yield a slot for a studio package
const settings = { bufferStudioMin: 60, bufferHomeMin: 120, minNoticeHours: 24, maxBookingMonths: 6 };
const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 10);
const dateStr = futureDate.toISOString().slice(0, 10);
const slots = generateCandidateSlots(
  sessionById('baby')!,
  settings,
  [{ date: dateStr, startTime: '09:00', endTime: '13:00', location: 'studio' }],
  [],
  []
);
check('studio availability block produces bookable slots', slots.length > 0);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
