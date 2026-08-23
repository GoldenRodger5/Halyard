/**
 * The webhook's two decidable properties: the signature and the payload shape.
 *
 * The E2E spec proves the route refuses what it should through the real HTTP
 * path. These prove the parts that need a configured secret, which the dev
 * environment does not have — so they are exercised directly rather than
 * pretended at.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mediaIdsFrom, verifySignature } from './metaWebhook.js';

const SECRET = 'test-app-secret';
const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;

describe('the webhook signature', () => {
  const body = JSON.stringify({ object: 'instagram', entry: [] });

  it('accepts a signature over exactly these bytes', () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a signature made with a different secret', () => {
    expect(verifySignature(body, sign(body, 'someone-elses-secret'), SECRET)).toBe(false);
  });

  it('rejects a signature over different bytes', () => {
    /**
     * The reason the route reads `request.text()` rather than `request.json()`:
     * parsing and re-serialising changes the bytes, and the signature is over
     * what Meta actually sent. A whitespace difference is enough.
     */
    expect(verifySignature(body, sign(`${body} `), SECRET)).toBe(false);
  });

  it('rejects a missing or malformed header rather than throwing', () => {
    expect(verifySignature(body, null, SECRET)).toBe(false);
    expect(verifySignature(body, '', SECRET)).toBe(false);
    expect(verifySignature(body, 'sha256=', SECRET)).toBe(false);
    expect(verifySignature(body, 'deadbeef', SECRET)).toBe(false);
    // No `sha1=` fallback: Meta's v1 signature is deprecated and accepting it
    // would widen what counts as authenticated.
    expect(verifySignature(body, `sha1=${'a'.repeat(40)}`, SECRET)).toBe(false);
  });
});

describe('reading media ids out of an untrusted payload', () => {
  it('finds them in the documented shape', () => {
    expect(
      mediaIdsFrom({
        object: 'instagram',
        entry: [{ changes: [{ field: 'comments', value: { media: { id: '17900000000000001' } } }] }],
      }),
    ).toEqual(['17900000000000001']);
  });

  it('also reads the flat form Meta sends for some fields', () => {
    expect(
      mediaIdsFrom({ entry: [{ changes: [{ value: { media_id: '17900000000000002' } }] }] }),
    ).toEqual(['17900000000000002']);
  });

  it('deduplicates, because one burst arrives as several changes', () => {
    expect(
      mediaIdsFrom({
        entry: [
          { changes: [{ value: { media: { id: 'abc' } } }, { value: { media_id: 'abc' } }] },
          { changes: [{ value: { media: { id: 'abc' } } }] },
        ],
      }),
    ).toEqual(['abc']);
  });

  it('yields nothing for anything unrecognised, rather than throwing', () => {
    /**
     * This is network input from outside. Every one of these reached the parser
     * in some form during development of the shape above, and an exception here
     * would be a 500 on a route Meta retries.
     */
    for (const payload of [
      null,
      undefined,
      'a string',
      42,
      {},
      { entry: 'not an array' },
      { entry: [null] },
      { entry: [{ changes: 'not an array' }] },
      { entry: [{ changes: [null] }] },
      { entry: [{ changes: [{ value: null }] }] },
      { entry: [{ changes: [{ value: { media: 'not an object' } }] }] },
      { entry: [{ changes: [{ value: { media: { id: 12345 } } }] }] },
      { entry: [{ changes: [{ value: { media_id: '' } }] }] },
    ]) {
      expect(() => mediaIdsFrom(payload)).not.toThrow();
      expect(mediaIdsFrom(payload)).toEqual([]);
    }
  });
});
