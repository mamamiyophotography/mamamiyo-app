// Read-only aggregate reconciliation; never exports customer records or identifiers.
const fs = require('node:fs');
require('dotenv').config({ path: '.env.local', quiet: true });
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  const result = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const bookings = await tx.$queryRawUnsafe(`SELECT COUNT(*)::text AS submitted,
      COUNT(*) FILTER (WHERE "analyticsAttribution" IS NOT NULL)::text AS attributed,
      COUNT(*) FILTER (WHERE "depositStatus"='paid' AND "status"<>'cancelled')::text AS confirmed
      FROM "Booking" WHERE "createdAt">='2026-10-04T00:28:00Z'::timestamptz
      AND "bundleSessionNumber" IS DISTINCT FROM 2 AND "bundleSessionNumber" IS DISTINCT FROM 3
      AND COALESCE(("analyticsAttribution"->>'test')::boolean,false)=false`);
    const outbox = await tx.$queryRawUnsafe('SELECT "deliveryStatus",COUNT(*)::text AS count FROM "AnalyticsOutbox" GROUP BY 1');
    return { checkedAt: new Date().toISOString(), since: '2026-10-04T00:28:00Z', bookings: bookings[0], outbox };
  });
  fs.writeFileSync('docs/analytics/reconciliation-summary.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(e => { console.error('Aggregate check failed', e.code || e.name); process.exitCode=1; }).finally(()=>db.$disconnect());
