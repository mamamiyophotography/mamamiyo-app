// Ported from the prototype. Verified there against: the $1,088 bundle total
// (100 deposit + 330 + 330 + 328), and various add-on/discount/surcharge
// combinations. Keep this file the single source of truth for money math —
// don't recompute totals inline elsewhere.

import { ADDONS, BUNDLE_SESSION_BALANCES, SessionType } from './constants';

export function computeAddOnsTotal(addOns: Record<string, number> | null | undefined): number {
  return Object.entries(addOns || {}).reduce(
    (sum, [id, qty]) => sum + (ADDONS[id] && qty > 0 ? ADDONS[id].price * qty : 0),
    0
  );
}

export function currentBalanceDue(booking: {
  balanceDue: number;
  extraLineItems?: { description: string; amount: number }[] | null;
}): number {
  const extra = (booking.extraLineItems || []).reduce((sum, item) => sum + item.amount, 0);
  return booking.balanceDue + extra;
}

export type PricingInput = {
  sessionType: SessionType;
  addOns: Record<string, number>;
  isWeekend: boolean; // weekend OR listed public holiday — see availability.ts
  weekendSurchargeAmount: number;
  depositAmount: number;
  discount?: { code: string; amount: number } | null;
};

export type PricingResult = {
  sessionPrice: number; // for a bundle, this is BUNDLE_SESSION_BALANCES[0] + depositAmount
  addOnsTotal: number;
  weekendFee: number;
  subtotal: number;
  discountAmount: number;
  total: number;
  depositAmount: number;
  balanceDue: number;
};

/** Session 1 of the bundle prices exactly like any other package (see the
 *  requirements doc §4.2) — sessions 2 & 3 use computeBundleRedemptionPricing
 *  instead, since they carry no deposit. */
export function computeBookingPricing(input: PricingInput): PricingResult {
  const sessionPrice = input.sessionType.isBundle
    ? BUNDLE_SESSION_BALANCES[0] + input.depositAmount
    : input.sessionType.price;
  const addOnsTotal = computeAddOnsTotal(input.addOns);
  const weekendFee = input.isWeekend ? input.weekendSurchargeAmount : 0;
  const subtotal = sessionPrice + addOnsTotal + weekendFee;
  const discountAmount = input.discount ? Math.min(input.discount.amount, subtotal) : 0;
  const total = subtotal - discountAmount;
  const balanceDue = Math.max(0, total - input.depositAmount);
  return {
    sessionPrice,
    addOnsTotal,
    weekendFee,
    subtotal,
    discountAmount,
    total,
    depositAmount: input.depositAmount,
    balanceDue,
  };
}

/** sessionIndex is 0-based: 0 = redeeming session 2 (bundle's 2nd credit),
 *  1 = redeeming session 3. (Session 1 always goes through
 *  computeBookingPricing since it's booked with a deposit, not redeemed.) */
export function computeBundleRedemptionPricing(
  sessionIndex: number,
  addOns: Record<string, number>,
  isWeekend: boolean,
  weekendSurchargeAmount: number
) {
  const baseBalance = BUNDLE_SESSION_BALANCES[sessionIndex] || 0;
  const addOnsTotal = computeAddOnsTotal(addOns);
  const weekendFee = isWeekend ? weekendSurchargeAmount : 0;
  const balanceDue = baseBalance + addOnsTotal + weekendFee;
  return { baseBalance, addOnsTotal, weekendFee, balanceDue };
}
