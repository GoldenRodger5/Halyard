import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  TokenCryptoError,
  loadKey,
  openToken,
  redactToken,
  safeEqual,
  sealToken,
} from './tokenCrypto.js';

const key = randomBytes(32);

describe('sealToken / openToken', () => {
  it('round-trips a token', () => {
    const token = 'ya29.a0AfH6SMB' + 'x'.repeat(120);
    expect(openToken(sealToken(token, key), key)).toBe(token);
  });

  it('produces different ciphertext for the same plaintext', () => {
    const a = sealToken('same-token', key);
    const b = sealToken('same-token', key);
    expect(a.equals(b)).toBe(false);
  });

  it('rejects a payload sealed with a different key', () => {
    const sealed = sealToken('secret', key);
    expect(() => openToken(sealed, randomBytes(32))).toThrow(TokenCryptoError);
  });

  it('rejects a tampered payload', () => {
    const sealed = sealToken('secret', key);
    sealed[sealed.length - 1] = (sealed[sealed.length - 1] ?? 0) ^ 0xff;
    expect(() => openToken(sealed, key)).toThrow(/failed authentication/i);
  });

  it('accepts the \\x hex form Postgres returns for bytea', () => {
    const sealed = sealToken('secret', key);
    expect(openToken('\\x' + sealed.toString('hex'), key)).toBe('secret');
  });

  it('refuses to seal an empty token', () => {
    expect(() => sealToken('', key)).toThrow(/empty/i);
  });

  it('rejects a truncated payload', () => {
    expect(() => openToken(Buffer.from([1, 2, 3]), key)).toThrow(/too short/i);
  });
});

describe('loadKey', () => {
  it('requires a 32-byte base64 key', () => {
    expect(() => loadKey('c2hvcnQ=')).toThrow(/32 bytes/);
    expect(() => loadKey(undefined)).toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(loadKey(randomBytes(32).toString('base64'))).toHaveLength(32);
  });
});

describe('redactToken', () => {
  it('never prints a token whole', () => {
    const token = 'abcdefghijklmnop';
    const redacted = redactToken(token);
    expect(redacted).not.toContain('efghijklm');
    expect(redacted).toContain('abcd');
    expect(redactToken(null)).toBe('(none)');
    expect(redactToken('short')).toBe('***');
  });
});

describe('safeEqual', () => {
  it('compares without leaking length via early exit', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
