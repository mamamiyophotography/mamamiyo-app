// The service layer depends on this interface rather than the literal
// PrismaClient type. A real PrismaClient satisfies it structurally (no
// adapter code needed in production), and a lightweight in-memory mock can
// satisfy it too — which is how this service layer gets tested in this
// sandbox, since `prisma generate` needs to download engine binaries from
// binaries.prisma.sh, a domain outside this sandbox's network allowlist.
// On a real machine (or Vercel's build), `prisma generate` works normally
// and none of this matters — it's purely a testability seam.

export type Settings = {
  id: number;
  businessName: string;
  paynowMobile: string;
  depositAmount: number;
  weekendSurcharge: number;
  bufferStudioMin: number;
  bufferHomeMin: number;
  minNoticeHours: number;
  maxBookingMonths: number;
  holdWindowMinutes: number;
};

export type Booking = {
  id: string;
  ref: string;
  sessionTypeId: string;
  sessionLabel: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
  isWeekend: boolean;
  addOns: Record<string, number>;
  notes: string;
  referencePhotoUrls: string[];
  address: string;
  discountCode: string | null;
  discountAmount: number;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  subtotal: number;
  total: number;
  depositAmount: number;
  balanceDue: number;
  extraLineItems: { description: string; amount: number }[];
  invoiceRef: string | null;
  invoiceGeneratedAt: Date | null;
  status: string;
  holdExpiresAt: Date | null;
  depositRef: string | null;
  depositStatus: string;
  balanceStatus: string;
  bundleParentId: string | null;
  bundleSessionNumber: number | null;
  remindersSent: string[];
  createdAt: Date;
};

export type Bundle = {
  id: string;
  ref: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  depositAmount: number;
  depositStatus: string;
  creditsTotal: number;
  activated: boolean;
  activatedAt: Date | null;
  createdAt: Date;
};

export type AvailabilityBlock = { id: string; date: string; startTime: string; endTime: string; location: string };
export type PublicHoliday = { id: string; date: string; label: string };
export type DiscountCode = { id: string; code: string; description: string; amount: number };

export interface Db {
  settings: {
    findUnique(args: { where: { id: number } }): Promise<Settings | null>;
    create(args: { data: Partial<Settings> & { id: number } }): Promise<Settings>;
    update(args: { where: { id: number }; data: Partial<Settings> }): Promise<Settings>;
  };
  availabilityBlock: {
    findMany(args?: { where?: { location?: string } }): Promise<AvailabilityBlock[]>;
    create(args: { data: Omit<AvailabilityBlock, 'id'> }): Promise<AvailabilityBlock>;
    delete(args: { where: { id: string } }): Promise<AvailabilityBlock | void>;
  };
  publicHoliday: {
    findMany(): Promise<PublicHoliday[]>;
    create(args: { data: Omit<PublicHoliday, 'id'> }): Promise<PublicHoliday>;
    delete(args: { where: { id: string } }): Promise<PublicHoliday | void>;
  };
  discountCode: {
    findUnique(args: { where: { code: string } }): Promise<DiscountCode | null>;
    findMany(): Promise<DiscountCode[]>;
    create(args: { data: Omit<DiscountCode, 'id'> }): Promise<DiscountCode>;
    delete(args: { where: { id: string } }): Promise<DiscountCode | void>;
  };
  booking: {
    findFirst(args: { where: unknown }): Promise<Booking | null>;
    findMany(args?: { where?: unknown; select?: unknown; orderBy?: unknown }): Promise<Booking[]>;
    findUniqueOrThrow(args: { where: { id: string } }): Promise<Booking>;
    create(args: { data: unknown }): Promise<Booking>;
    update(args: { where: { id: string }; data: Partial<Booking> }): Promise<Booking>;
    updateMany(args: { where: unknown; data: Partial<Booking> }): Promise<{ count: number }>;
    delete(args: { where: { id: string } }): Promise<Booking | void>;
    count(args: { where: unknown }): Promise<number>;
  };
  bundle: {
    findUnique(args: { where: { id: string } }): Promise<Bundle | null>;
    findUniqueOrThrow(args: { where: { id: string } }): Promise<Bundle>;
    findMany(args?: { where?: unknown }): Promise<Bundle[]>;
    create(args: { data: unknown }): Promise<Bundle>;
    update(args: { where: { id: string }; data: Partial<Bundle> }): Promise<Bundle>;
  };
  $transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
