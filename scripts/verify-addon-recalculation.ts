import { recalculateForAddOns } from '../src/lib/pricing';

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) failures++;
}

const base = { subtotal: 756, total: 756, balanceDue: 656, addOns: { headcount: 1, album10x10: 1 } };
let result = recalculateForAddOns(base, { headcount: 2, album10x10: 1 });
check('increasing headcount adds $30', result.total === 786 && result.balanceDue === 686);

result = recalculateForAddOns(base, { album10x10: 1 });
check('removing headcount subtracts $30', result.total === 726 && result.balanceDue === 626);

result = recalculateForAddOns(base, {});
check('removing all add-ons preserves the package/deposit base', result.total === 588 && result.balanceDue === 488);

const bundle = { subtotal: 498, total: 498, balanceDue: 498, addOns: { album10x10: 1, headcount: 1 } };
result = recalculateForAddOns(bundle, { headcount: 2 });
check('bundle keeps its session balance and replaces add-on difference', result.balanceDue === 390);

const lowBalance = { subtotal: 100, total: 100, balanceDue: 20, addOns: { headcount: 1 } };
result = recalculateForAddOns(lowBalance, {});
check('balance due never becomes negative', result.balanceDue === 0);

if (failures) process.exit(1);
