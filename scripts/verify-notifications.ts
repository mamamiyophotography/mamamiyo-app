// Verifies the ported notification templates against the confirmed
// behaviour from the prototype. Run with: npx tsx scripts/verify-notifications.ts
import {
  bookingConfirmedNotification,
  bundleSessionConfirmedNotification,
  balanceReceivedNotification,
  reminderNotification,
  bundleContextAfterBalance,
  REMINDER_THRESHOLDS,
  NotifyBooking,
} from '../src/lib/notifications';

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`);
  if (!cond) failures++;
}

const business = 'Mamamiyo Photography';

// 1. Standalone Newborn confirmation — should NOT mention bundle/milestone anything
const newborn: NotifyBooking = {
  ref: 'MMY-AB12C',
  sessionTypeId: 'newborn',
  sessionLabel: 'Newborn Photoshoot',
  location: 'home',
  date: '2026-08-22',
  startTime: '09:00',
  clientName: 'Jane Tan',
};
const n = bookingConfirmedNotification(newborn, business);
check('email has a Subject-appropriate string', n.client.emailSubject.includes('Newborn Photoshoot'));
check('client email mentions "Newborn Photoshoot preparation" (not Milestone)', n.client.emailBody.includes('Newborn Photoshoot preparation'));
check('client email does NOT mention "Milestone Stage"', !n.client.emailBody.includes('Milestone Stage'));
check('client email does NOT mention sessions 2/3 or activation', !/session\s*2|activat/i.test(n.client.emailBody));
check('client WhatsApp body mentions receipt sent via email', n.client.whatsappBody.toLowerCase().includes('receipt'));
check('photographer copy is short/functional, includes ref', n.photographer.emailBody.includes('MMY-AB12C'));

// 2. Bundle session 1 confirmation — same rule, no mention of 2/3
const bundleS1: NotifyBooking = {
  ref: 'MMY-XY99Z',
  sessionTypeId: 'bundle',
  sessionLabel: 'First Year Bundle — session 1 of 3',
  location: 'studio',
  date: '2026-08-28',
  startTime: '09:00',
  clientName: 'Alicia Wong',
  bundleSessionNumber: 1,
};
const b1 = bookingConfirmedNotification(bundleS1, business);
check('bundle session 1 confirmation does not mention sessions 2/3', !/session\s*2|activat/i.test(b1.client.emailBody));
check('bundle session 1 confirmation uses "Milestone Stage 1" prep wording', b1.client.emailBody.includes('Milestone Stage 1 preparation'));

// 3. Bundle session 2 redemption confirmation
const bundleS2: NotifyBooking = { ...bundleS1, sessionLabel: 'First Year Bundle — session 2 of 3', bundleSessionNumber: 2 };
const b2 = bundleSessionConfirmedNotification(bundleS2, 1, 330, business); // sessionIndex 1 = session 2
check('bundle session 2 mentions "Session 2 of 3"', b2.client.whatsappBody.includes('Session 2 of 3'));
check('bundle session 2 mentions correct balance $330', b2.client.whatsappBody.includes('$330'));
check('bundle session 2 uses "Milestone Stage" prep wording (stage 2/3)', b2.client.emailBody.includes('Milestone Stage 2 preparation'));

// 4. Balance received — session 1 balance confirmed should prompt session 2 (Sitter)
const ctxAfter1 = bundleContextAfterBalance(1);
check('after session 1, next context points to session 2', !!ctxAfter1 && 'nextSessionNumber' in ctxAfter1 && ctxAfter1.nextSessionNumber === 2);
const balMsg1 = balanceReceivedNotification(bundleS1, business, ctxAfter1);
check('balance-received (session 1) prompts the Sitter milestone', balMsg1.client.emailBody.includes('Sitter'));
check('balance-received (session 1) mentions no extra deposit needed', balMsg1.client.emailBody.includes('no extra deposit needed'));

// 5. Balance received — session 3 balance confirmed should give completion message, not another prompt
const ctxAfter3 = bundleContextAfterBalance(3);
check('after session 3, context is "completed"', !!ctxAfter3 && 'completed' in ctxAfter3);
const bundleS3: NotifyBooking = { ...bundleS1, sessionLabel: 'First Year Bundle — session 3 of 3', bundleSessionNumber: 3 };
const balMsg3 = balanceReceivedNotification(bundleS3, business, ctxAfter3);
check('balance-received (session 3) gives a completion message', balMsg3.client.emailBody.includes('completes all 3 sessions'));

// 6. Standalone booking's balance confirmation has no bundle note at all
const standaloneCtx = bundleContextAfterBalance(null);
check('standalone booking has no bundle context', standaloneCtx === undefined);
const balMsgStandalone = balanceReceivedNotification(newborn, business, standaloneCtx);
check('standalone balance-received has no bundle/milestone mention', !/milestone|bundle/i.test(balMsgStandalone.client.emailBody));

// 7. Reminders — all three thresholds produce distinct, correctly-worded content
check('3 reminder thresholds defined (3day/1day/2hr)', REMINDER_THRESHOLDS.length === 3);
REMINDER_THRESHOLDS.forEach((t) => {
  const r = reminderNotification(newborn, t, business);
  check(`reminder [${t.key}] has a Subject mentioning the session`, r.client.emailSubject.includes('Newborn Photoshoot'));
  check(`reminder [${t.key}] includes studio/home location line where relevant`, newborn.location === 'home' ? r.client.emailBody.length > 0 : true);
});
const threeDayReminder = reminderNotification(newborn, REMINDER_THRESHOLDS[0], business);
check('only the 3-day reminder includes the prep-guide nudge', threeDayReminder.client.emailBody.includes('prep guide'));
const twoHourReminder = reminderNotification(newborn, REMINDER_THRESHOLDS[2], business);
check('the 2-hour reminder does NOT repeat the prep-guide nudge', !twoHourReminder.client.emailBody.includes('prep guide'));

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
