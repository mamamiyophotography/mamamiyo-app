import crypto from 'crypto';

const password = process.argv[2];
if (!password) {
  console.error('Usage: npx tsx scripts/hash-password.ts "your-chosen-password"');
  process.exit(1);
}

const hash = crypto.createHash('sha256').update(password).digest('hex');
console.log('\nAdd this line to your .env.local file:\n');
console.log(`ADMIN_PASSWORD_HASH="${hash}"\n`);