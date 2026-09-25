// Ported directly from the tested prototype (mamamiyo-booking-app.html).
// This is the confirmed business catalog — session types, add-ons, studio
// details, and prep-guide links. Changing prices/wording here is a code
// change; see the requirements doc's Phase-2 note about eventually moving
// this into an editable database table instead of a hardcoded file.

export type SessionType = {
  id: 'newborn' | 'fullmonth' | 'baby' | 'maternity' | 'bundle';
  name: string;
  price: number;
  durationMin: number;
  location: 'studio' | 'home';
  meta: string;
  highlights?: string[];
  addOns: string[];
  referenceSetups?: number;  // how many setup looks to choose
  icon: string;
  swatch: string;
  note?: string;
  isBundle?: boolean;
  bundleSessions?: number;
  intro?: string;
  milestones?: { label: string; age: string }[];
};

export const SESSION_TYPES: SessionType[] = [
  {
    id: 'newborn',
    name: 'Newborn Photoshoot',
    price: 588,
    durationMin: 120,
    location: 'home',
    meta: '2 hours · At your home · 3 setups',
    highlights: [
      '3 beautifully styled setups — 2 baby solo + 1 family portrait',
      'Approximately 70 softcopy photos with basic editing',
      '10 photos with detailed retouching',
    ],
    addOns: ['extraSetup', 'headcount', 'album8x8', 'album10x10', 'album12x12', 'canvas11x14', 'canvas16x24', 'plaque5x7', 'plaque6x8'],
    referenceSetups: 2,  // 2 baby solo setups
    icon: 'N',
    swatch: '#C98B7A',
  },
  {
    id: 'fullmonth',
    name: 'Full Month Baby Photoshoot',
    price: 388,
    durationMin: 60,
    location: 'studio',
    meta: '1 hour · At the studio · 2 setups',
    highlights: [
      '2 setups — 1 baby solo + 1 family portrait (baby outfit provided)',
      '50+ softcopy photos with basic editing',
      '10 photos with detailed retouching',
    ],
    addOns: ['extraSetup', 'headcount', 'album8x8', 'album10x10', 'album12x12', 'canvas11x14', 'canvas16x24', 'plaque5x7', 'plaque6x8'],
    referenceSetups: 1,  // 1 baby solo setup
    icon: 'F',
    swatch: '#8A9A78',
    note: 'Best within 10 days after baby\u2019s full month',
  },
  {
    id: 'baby',
    name: 'Baby & Family Photoshoot',
    price: 388,
    durationMin: 60,
    location: 'studio',
    meta: '1 hour · At the studio · 2 setups',
    highlights: [
      '2 setups — 1 baby solo + 1 family portrait (baby outfit provided)',
      'Approximately 70 softcopy photos with basic editing',
      '10 photos with detailed retouching',
    ],
    addOns: ['extraSetup', 'headcount', 'album8x8', 'album10x10', 'album12x12', 'canvas11x14', 'canvas16x24', 'plaque5x7', 'plaque6x8'],
    referenceSetups: 1,  // 1 baby solo setup
    icon: 'B',
    swatch: '#B08D57',
  },
  {
    id: 'maternity',
    name: 'Maternity Photoshoot',
    price: 388,
    durationMin: 60,
    location: 'studio',
    meta: '1 hour · At the studio · 2 outfit changes',
    highlights: [
      '2 outfit changes (outfit provided for mummy)',
      'Approximately 50 softcopy photos with basic editing',
      '10 photos with detailed retouching',
    ],
    addOns: ['extraOutfit', 'headcount', 'album8x8', 'album10x10', 'album12x12', 'canvas11x14', 'canvas16x24', 'plaque5x7', 'plaque6x8'],
    referenceSetups: 2,  // 2 outfit changes
    icon: 'M',
    swatch: '#9B7B93',
  },
  {
    id: 'bundle',
    name: 'The First Year Bundle',
    price: 1088,
    durationMin: 60,
    location: 'studio',
    meta: '3 sessions · At the studio · 1 setup each',
    addOns: ['extraSetup', 'headcount', 'album8x8', 'album10x10', 'album12x12', 'canvas11x14', 'canvas16x24', 'plaque5x7', 'plaque6x8'],
    referenceSetups: 1,  // 1 setup per session
    icon: '\u2605',
    swatch: '#8C6D3F',
    isBundle: true,
    bundleSessions: 3,
    intro: 'Capture your baby\u2019s first year with 3 milestone sessions, timed around the stages that matter most:',
    milestones: [
      { label: 'Full Month', age: '4\u20136 weeks' },
      { label: 'Sitter', age: '4\u20137 months' },
      { label: '1st Birthday', age: '10\u201312 months' },
    ],
  },
];

// $100 deposit up front, then this amount invoiced after each of the 3
// redeemed sessions (330 + 330 + 328 = 1088 - 100).
export const BUNDLE_SESSION_BALANCES = [330, 330, 328];

export const ADDONS: Record<string, { name: string; price: number }> = {
  // Service add-ons
  extraSetup: { name: 'Additional Setup', price: 100 },
  extraOutfit: { name: 'Additional Outfit', price: 100 },
  headcount: { name: 'Additional Family / Grandparents', price: 30 },
  // Photo Album (layflat, rigid paper)
  album8x8: { name: 'Layflat Photo Album\n8in × 8in / 20cm × 20cm\n20 pages, up to 30 images\nIncludes 20 Bonus Further Retouch', price: 108 },
  album10x10: { name: 'Layflat Photo Album\n10in × 10in / 25cm × 25cm\n20 pages, up to 30 images\nIncludes 20 Bonus Further Retouch', price: 138 },
  album12x12: { name: 'Layflat Photo Album\n12in × 12in / 30cm × 30cm\n20 pages, up to 30 images\nIncludes 20 Bonus Further Retouch', price: 158 },
  // Canvas
  canvas11x14: { name: 'Canvas 11×14in / 28×35cm\nIncludes 5 Bonus Further Retouch', price: 88 },
  canvas16x24: { name: 'Canvas 16×24in / 40×60cm\nIncludes 5 Bonus Further Retouch', price: 128 },
  // Wooden / Crystal Plaque
  plaque5x7: { name: 'Wooden/Crystal Plaque 5×7in / 12×17cm\nIncludes 2 Bonus Further Retouch', price: 58 },
  plaque6x8: { name: 'Wooden/Crystal Plaque 6×8in / 15×20cm\nIncludes 2 Bonus Further Retouch', price: 68 },
};

export const PHYSICAL_PRODUCT_IDS = new Set([
  'album8x8', 'album10x10', 'album12x12',
  'canvas11x14', 'canvas16x24',
  'plaque5x7', 'plaque6x8',
]);

export function hasBookedPhysicalProduct(addOns: unknown): boolean {
  if (!addOns || typeof addOns !== 'object' || Array.isArray(addOns)) return false;
  return Object.entries(addOns as Record<string, unknown>)
    .some(([id, quantity]) => PHYSICAL_PRODUCT_IDS.has(id) && Number(quantity) > 0);
}

export const STUDIO_INFO = {
  name: 'Home Studio @ K-Lodge',
  addressLines: ['32 Lorong K Telok Kurau', '#01-01', 'Singapore 425641'],
  access: 'Press 0101 \ud83d\udd14 at intercom to enter',
  parkingOk: 'You can park in Lot 6',
  parkingWarn: 'Do NOT park in other slots',
};

export const PREP_URLS = {
  stage1: 'https://www.mamamiyo-photography.com/newbornprep',
  maternity: 'https://www.mamamiyo-photography.com/maternityprep',
  stage23: 'https://www.mamamiyo-photography.com/babyprep',
};

export function sessionById(id: string): SessionType | undefined {
  return SESSION_TYPES.find((s) => s.id === id);
}

export function prepLinkFor(booking: {
  sessionTypeId: string;
  sessionLabel: string;
  bundleSessionNumber?: number | null;
}): { note: string; url: string } | null {
  // "Milestone Stage" phrasing is reserved for actual bundle sessions — a
  // standalone booking gets plain, package-specific wording, since that
  // client isn't necessarily in a 3-stage plan.
  if (booking.sessionTypeId === 'newborn' || booking.sessionTypeId === 'fullmonth') {
    return { note: `${booking.sessionLabel} preparation`, url: PREP_URLS.stage1 };
  }
  if (booking.sessionTypeId === 'maternity') {
    return { note: `${booking.sessionLabel} preparation`, url: PREP_URLS.maternity };
  }
  if (booking.sessionTypeId === 'baby') {
    return { note: `${booking.sessionLabel} preparation`, url: PREP_URLS.stage23 };
  }
  if (booking.sessionTypeId === 'bundle') {
    const isStage1 = booking.bundleSessionNumber === 1;
    return {
      note: `Milestone Stage ${booking.bundleSessionNumber || 1} preparation`,
      url: isStage1 ? PREP_URLS.stage1 : PREP_URLS.stage23,
    };
  }
  return null;
}

// Booking status lifecycle, in order. Statuses are plain strings on the
// Booking model (not a Prisma enum) — this array is the single source of
// truth for ordering and for admin "advance to next stage" logic.
export const STATUS_ORDER = [
  'pending',
  'confirmed',
  'pending_balance',
  'pending_basic_retouch',
  'basic_retouch',
  'further_retouch',
  'soft_copy_delivered',
  'completed',
] as const;

export type BookingStatusValue = typeof STATUS_ORDER[number] | 'cancelled';

export const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending:         { label: '1. Pending deposit',     color: '#8A7F2F', bg: '#F4E4C1' },
  confirmed:       { label: '2. Booking confirmed',   color: '#FFFFFF', bg: '#7A9D8F' },
  pending_balance:      { label: '3. Pending basic retouch',  color: '#FFFFFF', bg: '#8FB4D4' }, // legacy records
  pending_basic_retouch:{ label: '3. Pending basic retouch',  color: '#FFFFFF', bg: '#8FB4D4' },
  basic_retouch:        { label: '4. Awaiting client selection', color: '#FFFFFF', bg: '#7898AA' },
  further_retouch:      { label: '5. Further retouch',        color: '#FFFFFF', bg: '#5FA89A' },
  soft_copy_delivered:  { label: '6. Soft Copy Delivered',    color: '#4E5F48', bg: '#DCE9D5' },
  completed:            { label: '7. Photoshoot complete',    color: '#5A4B7A', bg: '#D0C4DD' },
  cancelled:       { label: 'Cancelled',              color: '#7A6F62', bg: '#E4DED6' },
};

export function closingLineFor(booking: { sessionTypeId: string }): string {
  return booking.sessionTypeId === 'maternity'
    ? 'Looking forward to capturing this beautiful chapter with you and your bump.'
    : 'Looking forward to capturing these special moments with you and your little one.';
}
