import { PrismaClient } from '@prisma/client';

// Standard Next.js pattern: avoid creating a new PrismaClient on every
// hot reload in development, which otherwise exhausts database connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
