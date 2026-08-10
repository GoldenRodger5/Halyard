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
    expect(loadKey(randomBytes(32).toString('base64'))).toHaveLength(32);
  });

  it('says what to do when the key is absent', () => {
    // `loadKey()` defaults to process.env, so this only means anything with the
    // variable genuinely unset. Reading the ambient environment made this test
    // pass or fail depending on whether the developer had a key in their shell,
    // which is the opposite of what a test should do.
    const original = process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    try {
      expect(() => loadKey()).toThrow(/TOKEN_ENCRYPTION_KEY is not set/);
      // The message has to carry the command, because this is the first thing
      // that fails on a fresh install.
      expect(() => loadKey()).toThrow(/openssl rand -base64 32/);
    } finally {
      if (original === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
      else process.env.TOKEN_ENCRYPTION_KEY = original;
    }
  });

  it('tolerates the mangling an env file inflicts, because base64 decoding does', () => {
    // Node's base64 decoder skips whitespace, quotes and anything else outside
    // the alphabet, so a key that picked up a stray space or got quoted on its
    // way into .env still decodes to the same 32 bytes. Worth asserting rather
    // than assuming: it is the difference between a key that works and a
    // support question.
    const key = randomBytes(32).toString('base64');
    for (const mangled of [
      `${key.slice(0, 20)} ${key.slice(20)}`,
      `${key}\n`,
      `"${key}"`,
    ]) {
      expect(loadKey(mangled)).toHaveLength(32);
      expect(loadKey(mangled).equals(loadKey(key))).toBe(true);
    }
  });

  it('is the length check that actually guards this, not the decoder', () => {
    // Because decoding is so permissive, a truncated or wrong-format key comes
    // back as the wrong number of bytes rather than as an error. Without the
    // explicit length check that would silently construct a weaker cipher.
    expect(() => loadKey(randomBytes(24).toString('base64'))).toThrow(/got 24/);
    expect(() => loadKey(randomBytes(64).toString('base64'))).toThrow(/got 64/);
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
