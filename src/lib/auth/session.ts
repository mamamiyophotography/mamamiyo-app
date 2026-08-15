// A single-admin app doesn't need a full auth library — this is a small,
// properly-signed session cookie instead. The cookie payload is
// base64url(JSON) + "." + an HMAC-SHA256 signature over that payload using
// ADMIN_SESSION_SECRET, so a client can't forge or tamper with it without
// knowing the secret.
//
// Deliberately uses only the Web Crypto API (crypto.subtle), not Node's
// `crypto` module or `Buffer` — this file is imported from middleware.ts,
// which Next.js runs in the Edge Runtime by default, and Edge doesn't have
// Node's built-ins. This was caught by actually running `next build`
// (which compiles middleware separately) rather than assumed away.

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 days
export const SESSION_COOKIE_NAME = 'mamamiyo_admin_session';

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('ADMIN_SESSION_SECRET must be set in .env to a long random string (16+ chars).');
  }
  return secret;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}
function textToBase64Url(text: string): string {
  return toBase64Url(new TextEncoder().encode(text));
}
function base64UrlToText(b64: string): string {
  return new TextDecoder().decode(fromBase64Url(b64));
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(getSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(payload: string): Promise<string> {
  const key = await getKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(sig));
}

export async function createSessionToken(): Promise<string> {
  const payload = textToBase64Url(JSON.stringify({ sub: 'admin', exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 }));
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const key = await getKey();
  let sigBytes: Uint8Array;
  try {
    sigBytes = fromBase64Url(signature);
  } catch {
    return false;
  }
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes as BufferSource, new TextEncoder().encode(payload));
  if (!valid) return false;

  try {
    const data = JSON.parse(base64UrlToText(payload));
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
};
