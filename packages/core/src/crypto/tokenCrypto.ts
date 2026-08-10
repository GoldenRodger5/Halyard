/**
 * Platform token sealing.
 *
 * v1 §7 says "encrypt with pgsodium at rest". Build pack §5 lists a
 * TOKEN_ENCRYPTION_KEY environment variable, which implies application-level
 * sealing. We follow the build pack:
 *
 *   · pgsodium and Supabase Vault are deprecated for new Supabase projects, so a
 *     pgsodium-based design would be built on a retiring primitive.
 *   · Sealing in the application means the ciphertext is opaque to PostgREST, so
 *     even a mis-scoped RLS policy leaks bytes rather than credentials.
 *   · It keeps the migrations portable to plain Postgres, which is what CI runs.
 *
 * AES-256-GCM. Layout: version(1) ‖ iv(12) ‖ tag(16) ‖ ciphertext.
 * The version byte exists so a key rotation can be staged rather than
 * flag-day'd.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export class TokenCryptoError extends Error {}

export function loadKey(raw = process.env.TOKEN_ENCRYPTION_KEY): Buffer {
  if (!raw) {
    throw new TokenCryptoError(
      'TOKEN_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new TokenCryptoError(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}.`,
    );
  }
  return key;
}

/** Seal a plaintext token. Returns the bytes to store in a bytea column. */
export function sealToken(plaintext: string, key: Buffer = loadKey()): Buffer {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new TokenCryptoError('Refusing to seal an empty token.');
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, ciphertext]);
}

/** Open a sealed token. Throws if the payload was tampered with. */
export function openToken(sealed: Buffer | Uint8Array | string, key: Buffer = loadKey()): string {
  const buf = toBuffer(sealed);
  if (buf.length < 1 + IV_BYTES + TAG_BYTES) {
    throw new TokenCryptoError('Sealed token is too short to be valid.');
  }
  const version = buf[0];
  if (version !== VERSION) {
    throw new TokenCryptoError(`Unsupported token seal version ${version}.`);
  }
  const iv = buf.subarray(1, 1 + IV_BYTES);
  const tag = buf.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(1 + IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new TokenCryptoError('Sealed token failed authentication. Wrong key, or tampered.');
  }
}

/**
 * Postgres hands bytea back as `\x...` hex when it comes through PostgREST.
 * Accept every shape rather than making callers remember which one they have.
 */
function toBuffer(value: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex');
  return Buffer.from(value, 'base64');
}

/**
 * Redaction helper for logs and error reports. Sentry breadcrumbs are the most
 * common way a token escapes a server, so nothing prints a token whole.
 */
export function redactToken(token: string | null | undefined): string {
  if (!token) return '(none)';
  if (token.length <= 8) return '***';
  return `${token.slice(0, 4)}…${token.slice(-4)} (${token.length} chars)`;
}

/** Constant-time comparison, used for the cron shared secret and OAuth state. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
