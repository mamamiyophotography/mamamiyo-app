import { sessionById } from './constants';

export function giftVoucherCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let i = 0; i < 8; i += 1) value += chars[Math.floor(Math.random() * chars.length)];
  return `GIFT-${value}`;
}

export function voucherExpiry(): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date;
}

export function voucherPackage(sessionTypeId: string) {
  const session = sessionById(sessionTypeId);
  if (!session) throw new Error('Please select a valid voucher package.');
  return session;
}

export function voucherUsability(voucher: {status:string;paymentStatus:string;expiresAt:Date|null;redeemedAt:Date|null}) {
  if (voucher.paymentStatus !== 'paid' || voucher.status === 'pending_payment') return 'This voucher is awaiting payment confirmation.';
  if (voucher.redeemedAt || voucher.status === 'redeemed') return 'This voucher has already been redeemed.';
  if (voucher.status === 'cancelled') return 'This voucher has been cancelled.';
  if (voucher.expiresAt && voucher.expiresAt.getTime() < Date.now()) return 'This voucher has expired.';
  return null;
}
