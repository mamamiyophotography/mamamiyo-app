// PayNow QR payload builder (SGQR / EMVCo Merchant-Presented Mode).
// Ported unchanged from the prototype, where it was verified to produce a
// correctly-structured payload (checked field-by-field against the spec,
// and test-scanned as part of the prototype phase). Do not "simplify" the
// TLV construction — the field order and lengths are exact per the spec.

function crc16ccitt(str: string): number {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value;
}

export function balancePaymentReference(clientName: string, photoshootDate: string): string {
  const cleanName = clientName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim() || 'Client';
  const [year = '', month = '', day = ''] = photoshootDate.split('-');
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1] || '';
  const datePart = monthName && day && year ? `${day}${monthName}${year.slice(-2)}` : photoshootDate.replace(/[^0-9]/g, '').slice(0, 8);
  const suffix = `-${datePart || 'Session'}`;
  return `${cleanName.slice(0, Math.max(1, 25 - suffix.length)).trim()}${suffix}`;
}

export function buildPayNowPayload({
  mobile8,
  amount,
  refNumber,
  merchantName,
}: {
  mobile8: string; // 8-digit SG mobile number, no country code, e.g. "91234567"
  amount: number;
  refNumber: string;
  merchantName: string;
}): string {
  let mai = '';
  mai += tlv('00', 'SG.PAYNOW');
  mai += tlv('01', '0'); // 0 = mobile proxy
  mai += tlv('02', '+65' + mobile8);
  mai += tlv('03', '1'); // amount editable flag (we always set a fixed amount)

  let p = '';
  p += tlv('00', '01'); // payload format indicator
  p += tlv('01', '12'); // point of initiation: dynamic QR
  p += tlv('26', mai);
  p += tlv('52', '0000'); // merchant category code
  p += tlv('53', '702'); // SGD
  p += tlv('54', amount.toFixed(2));
  p += tlv('58', 'SG');
  p += tlv('59', merchantName.slice(0, 25));
  p += tlv('60', 'Singapore');
  p += tlv('62', tlv('01', refNumber.slice(0, 25)));
  p += '6304';

  const crc = crc16ccitt(p).toString(16).toUpperCase().padStart(4, '0');
  return p + crc;
}
