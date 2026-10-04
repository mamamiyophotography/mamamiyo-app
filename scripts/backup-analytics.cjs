// User-approved encrypted production backup. Never print records or credentials.
const fs=require('node:fs');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
require('dotenv').config({path:'.env.local',quiet:true});
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
async function main(){
  const tables=await db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const columns=await db.$queryRawUnsafe("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position");
  const data={createdAt:new Date().toISOString(),columns,tables:{}};
  for(const {tablename} of tables){
    const name=tablename.replaceAll('"','""');
    data.tables[tablename]=await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM public."${name}" t`);
  }
  const plain=Buffer.from(JSON.stringify(data,(_,v)=>typeof v==='bigint'?v.toString():v));
  const key=crypto.randomBytes(32),iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);
  const ps=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName System.Security; $k=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($k,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))"],{input:key.toString('base64'),encoding:'utf8'});
  if(ps.status!==0||!ps.stdout.trim())throw new Error('KEY_PROTECTION_FAILED');
  const check=crypto.createDecipheriv('aes-256-gcm',key,iv); check.setAuthTag(cipher.getAuthTag());
  if(!Buffer.concat([check.update(encrypted),check.final()]).equals(plain))throw new Error('VERIFY_FAILED');
  fs.mkdirSync('.private-backups',{recursive:true});
  const path=`.private-backups/production-${Date.now()}.encrypted.json`;
  fs.writeFileSync(path,JSON.stringify({format:1,algorithm:'aes-256-gcm',keyProtection:'Windows DPAPI CurrentUser',protectedKey:ps.stdout.trim(),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')}),{flag:'wx'});
  console.log(JSON.stringify({backup:path,tables:tables.length,encryptionVerified:true})); key.fill(0);plain.fill(0);
}
main().catch(e=>{console.error('Backup failed',e.code||e.name);process.exitCode=1}).finally(()=>db.$disconnect());
