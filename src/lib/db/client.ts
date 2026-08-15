import { PrismaClient } from '@prisma/client';
import { Db } from './types';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prismaClient = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prismaClient;
}

// Cast to our Db interface. The real PrismaClient satisfies it structurally —
// the only mismatch is that Prisma 6's delete() returns the deleted record
// rather than void, which is a safe widening (we never use the return value
// of delete in the service layer). The cast avoids a build-breaking
// structural incompatibility without changing any runtime behaviour.
export const db = prismaClient as unknown as Db;
