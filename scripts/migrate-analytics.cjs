// Apply only the reviewed additive analytics migration, after the approved backup.
const fs=require('node:fs');
require('dotenv').config({path:'.env.local',quiet:true});
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
async function main(){
  if(!fs.readdirSync('.private-backups').some(n=>n.endsWith('.encrypted.json')))throw new Error('BACKUP_REQUIRED');
  const sql=fs.readFileSync('prisma/migrations/20261004000000_conversion_attribution/migration.sql','utf8');
  const result=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(460046)');
    const existing=await tx.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Booking' AND column_name IN ('analyticsReference','analyticsAttribution')");
    if(existing.length)throw new Error('ANALYTICS_SCHEMA_ALREADY_PRESENT');
    const before=await tx.$queryRawUnsafe('SELECT COUNT(*)::text AS count FROM "Booking"');
    for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
    const after=await tx.$queryRawUnsafe('SELECT COUNT(*)::text AS count FROM "Booking"');
    if(before[0].count!==after[0].count)throw new Error('COUNT_MISMATCH');
    return {migration:'20261004000000_conversion_attribution',bookingCountUnchanged:true,sqlSha256:require('node:crypto').createHash('sha256').update(sql).digest('hex'),appliedAt:new Date().toISOString()};
  },{timeout:30000});
  fs.writeFileSync('.private-backups/analytics-migration-receipt.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}
main().catch(e=>{console.error('Migration failed',e.code||e.name);process.exitCode=1}).finally(()=>db.$disconnect());
