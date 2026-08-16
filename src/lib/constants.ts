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
  headcount: { name: 'Additional Headcount', price: 30 },
  // Photo Album (layflat, rigid paper)
  album8x8: { name: 'Photo Album 8×8in / 20×20cm (20 pages, up to 30 images)', price: 108 },
  album10x10: { name: 'Photo Album 10×10in / 25×25cm (20 pages, up to 30 images)', price: 138 },
  album12x12: { name: 'Photo Album 12×12in / 30×30cm (20 pages, up to 30 images)', price: 158 },
  // Canvas
  canvas11x14: { name: 'Canvas 11×14in / 28×35cm', price: 88 },
  canvas16x24: { name: 'Canvas 16×24in / 40×60cm', price: 128 },
  // Wooden / Crystal Plaque
  plaque5x7: { name: 'Wooden/Crystal Plaque 5×7in / 12×17cm', price: 58 },
  plaque6x8: { name: 'Wooden/Crystal Plaque 6×8in / 15×20cm', price: 68 },
};

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

export function closingLineFor(booking: { sessionTypeId: string }): string {
  return booking.sessionTypeId === 'maternity'
    ? 'Looking forward to capturing this beautiful chapter with you and your bump.'
    : 'Looking forward to capturing these special moments with you and your little one.';
}
