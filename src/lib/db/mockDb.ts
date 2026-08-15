// A minimal in-memory implementation of the Db interface, used ONLY for
// local verification (see scripts/verify-booking-service.ts). This is not
// a replacement for testing against real Postgres before launch — it
// exists because this sandbox can't reach binaries.prisma.sh to generate
// a real Prisma client. It exercises the exact same service-layer code
// that will run in production, just against plain arrays instead of SQL.

import { Db, Settings, Booking, Bundle, AvailabilityBlock, PublicHoliday, DiscountCode } from './types';

let idCounter = 0;
function newId(): string {
  idCounter++;
  return `id_${idCounter}`;
}

export function createMockDb(seed: {
  settings?: Partial<Settings>;
  availability?: Omit<AvailabilityBlock, 'id'>[];
  publicHolidays?: Omit<PublicHoliday, 'id'>[];
  discountCodes?: Omit<DiscountCode, 'id'>[];
} = {}): Db {
  let settings: Settings | null = seed.settings
    ? {
        id: 1,
        businessName: 'Mamamiyo Photography',
        paynowMobile: '97600798',
        depositAmount: 100,
        weekendSurcharge: 50,
        bufferStudioMin: 60,
        bufferHomeMin: 120,
        minNoticeHours: 24,
        maxBookingMonths: 6,
        holdWindowMinutes: 45,
        ...seed.settings,
      }
    : null;
  const availability: AvailabilityBlock[] = (seed.availability || []).map((a) => ({ id: newId(), ...a }));
  const publicHolidays: PublicHoliday[] = (seed.publicHolidays || []).map((h) => ({ id: newId(), ...h }));
  const discountCodes: DiscountCode[] = (seed.discountCodes || []).map((d) => ({ id: newId(), ...d }));
  const bookings: Booking[] = [];
  const bundles: Bundle[] = [];

  function matchOverlap(where: any, b: Booking): boolean {
    if (where?.date !== undefined && b.date !== where.date) return false;
    if (where?.startTime?.lt !== undefined && !(b.startTime < where.startTime.lt)) return false;
    if (where?.endTime?.gt !== undefined && !(b.endTime > where.endTime.gt)) return false;
    if (where?.NOT?.status !== undefined && b.status === where.NOT.status) return false;
    if (where?.OR !== undefined) {
      const ok = where.OR.some((cond: any) => {
        if (cond.status?.not !== undefined) return b.status !== cond.status.not;
        if (cond.holdExpiresAt?.gt !== undefined) return b.holdExpiresAt !== null && b.holdExpiresAt > cond.holdExpiresAt.gt;
        return false;
      });
      if (!ok) return false;
    }
    if (where?.status !== undefined && typeof where.status === 'string' && b.status !== where.status) return false;
    if (where?.status?.not !== undefined && b.status === where.status.not) return false;
    if (where?.bundleParentId !== undefined && b.bundleParentId !== where.bundleParentId) return false;
    if (where?.holdExpiresAt?.lt !== undefined && (!b.holdExpiresAt || !(b.holdExpiresAt < where.holdExpiresAt.lt))) return false;
    return true;
  }

  const db: Db = {
    settings: {
      async findUnique() {
        return settings;
      },
      async create(args) {
        settings = args.data as Settings;
        return settings;
      },
      async update(args) {
        if (!settings) throw new Error('Settings not initialised');
        Object.assign(settings, args.data);
        return settings;
      },
    },
    availabilityBlock: {
      async findMany(args) {
        if (args?.where?.location) return availability.filter((a) => a.location === args.where!.location);
        return availability;
      },
      async create(args) {
        const block = { id: newId(), ...args.data };
        availability.push(block);
        return block;
      },
      async delete(args) {
        const idx = availability.findIndex((a) => a.id === args.where.id);
        if (idx >= 0) availability.splice(idx, 1);
      },
    },
    publicHoliday: {
      async findMany() {
        return publicHolidays;
      },
      async create(args) {
        const holiday = { id: newId(), ...args.data };
        publicHolidays.push(holiday);
        return holiday;
      },
      async delete(args) {
        const idx = publicHolidays.findIndex((h) => h.id === args.where.id);
        if (idx >= 0) publicHolidays.splice(idx, 1);
      },
    },
    discountCode: {
      async findUnique(args) {
        return discountCodes.find((d) => d.code === args.where.code) || null;
      },
      async findMany() {
        return discountCodes;
      },
      async create(args) {
        const code = { id: newId(), ...args.data };
        discountCodes.push(code);
        return code;
      },
      async delete(args) {
        const idx = discountCodes.findIndex((d) => d.id === args.where.id);
        if (idx >= 0) discountCodes.splice(idx, 1);
      },
    },
    booking: {
      async findFirst(args) {
        return bookings.find((b) => matchOverlap(args.where, b)) || null;
      },
      async findMany(args) {
        let result = bookings.filter((b) => matchOverlap(args?.where, b));
        if ((args as any)?.orderBy?.date === 'desc') result = [...result].sort((a, b) => b.date.localeCompare(a.date));
        return result;
      },
      async findUniqueOrThrow(args) {
        const b = bookings.find((x) => x.id === args.where.id);
        if (!b) throw new Error('Booking not found');
        return b;
      },
      async create(args) {
        const data = args.data as any;
        const booking: Booking = {
          id: newId(),
          notes: '',
          discountCode: null,
          discountAmount: 0,
          extraLineItems: [],
          invoiceRef: null,
          invoiceGeneratedAt: null,
          holdExpiresAt: null,
          depositRef: null,
          remindersSent: [],
          createdAt: new Date(),
          ...data,
        };
        bookings.push(booking);
        return booking;
      },
      async update(args) {
        const b = bookings.find((x) => x.id === args.where.id);
        if (!b) throw new Error('Booking not found');
        Object.assign(b, args.data);
        return b;
      },
      async updateMany(args) {
        const matched = bookings.filter((b) => matchOverlap(args.where, b));
        matched.forEach((b) => Object.assign(b, args.data));
        return { count: matched.length };
      },
      async count(args) {
        return bookings.filter((b) => matchOverlap(args.where, b)).length;
      },
    },
    bundle: {
      async findUnique(args) {
        return bundles.find((x) => x.id === args.where.id) || null;
      },
      async findUniqueOrThrow(args) {
        const bd = bundles.find((x) => x.id === args.where.id);
        if (!bd) throw new Error('Bundle not found');
        return bd;
      },
      async findMany(args) {
        const where = args?.where as any;
        if (where?.depositStatus) return bundles.filter((b) => b.depositStatus === where.depositStatus);
        return bundles;
      },
      async create(args) {
        const data = args.data as any;
        const bundle: Bundle = {
          id: newId(),
          creditsTotal: 3,
          activated: false,
          activatedAt: null,
          createdAt: new Date(),
          depositStatus: 'pending',
          ...data,
        };
        bundles.push(bundle);
        return bundle;
      },
      async update(args) {
        const bd = bundles.find((x) => x.id === args.where.id);
        if (!bd) throw new Error('Bundle not found');
        Object.assign(bd, args.data);
        return bd;
      },
    },
    async $transaction(fn) {
      // No real atomicity in-memory, but the same clash-check code path
      // still runs — that's what we're actually verifying here.
      return fn(db);
    },
  };

  return db;
}
