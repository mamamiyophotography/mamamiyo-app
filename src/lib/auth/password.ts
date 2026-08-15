import crypto from 'crypto';

export async function verifyAdminCredentials(email: string, password: string): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!adminEmail || !passwordHash) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD_HASH must be set.');
  }
  if (email.trim().toLowerCase() !== adminEmail.trim().toLowerCase()) return false;
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(passwordHash));
}