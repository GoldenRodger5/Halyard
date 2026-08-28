/**
 * Meta's `signed_request`, which is not the webhook signature.
 *
 * §183. Two different mechanisms on the same integration, and conflating them
 * is the easy mistake: webhooks sign the raw body into an `x-hub-signature-256`
 * header, while the deauthorize and data-deletion callbacks POST a form field
 * shaped `<sig>.<payload>` where the HMAC covers the *encoded payload string*
 * — not the decoded JSON, and not the whole body.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySignedRequest } from './metaWebhook';

const IG_SECRET = 'instagram-app-secret';
const META_SECRET = 'meta-app-secret';

function sign(payload: Record<string, unknown>, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${sig}.${encoded}`;
}

const PAYLOAD = { user_id: '17841400000000000', issued_at: 1790000000, algorithm: 'HMAC-SHA256' };

describe('verifySignedRequest', () => {
  it('accepts a request signed with the Instagram app secret', () => {
    expect(verifySignedRequest(sign(PAYLOAD, IG_SECRET), [IG_SECRET, META_SECRET]))
      .toEqual({ userId: '17841400000000000', issuedAt: 1790000000 });
  });

  it('accepts one signed with the Meta app secret', () => {
    /* One endpoint serves both products without the caller declaring which. */
    expect(verifySignedRequest(sign(PAYLOAD, META_SECRET), [IG_SECRET, META_SECRET])?.userId)
      .toBe('17841400000000000');
  });

  it('rejects a request signed with something else', () => {
    expect(verifySignedRequest(sign(PAYLOAD, 'attacker-secret'), [IG_SECRET, META_SECRET])).toBeNull();
  });

  it('rejects a tampered payload that keeps the original signature', () => {
    /* The whole point: swapping the user id must invalidate the signature. */
    const [sig] = sign(PAYLOAD, IG_SECRET).split('.');
    const forged = Buffer.from(JSON.stringify({ ...PAYLOAD, user_id: 'someone-else' })).toString('base64url');
    expect(verifySignedRequest(`${sig}.${forged}`, [IG_SECRET])).toBeNull();
  });

  it('signs the encoded payload, not the decoded JSON', () => {
    /*
     * The specific error this guards. HMAC over the JSON string verifies
     * against nothing Meta sends, and the symptom is every callback silently
     * doing nothing.
     */
    const encoded = Buffer.from(JSON.stringify(PAYLOAD)).toString('base64url');
    const wrong = createHmac('sha256', IG_SECRET).update(JSON.stringify(PAYLOAD)).digest('base64url');
    expect(verifySignedRequest(`${wrong}.${encoded}`, [IG_SECRET])).toBeNull();
  });

  it('refuses when no secret is configured, rather than accepting anything', () => {
    expect(verifySignedRequest(sign(PAYLOAD, IG_SECRET), [undefined, ''])).toBeNull();
  });

  it('handles malformed input without throwing', () => {
    for (const bad of [null, undefined, '', 'no-dot', '.', 'a.b']) {
      expect(verifySignedRequest(bad, [IG_SECRET])).toBeNull();
    }
  });

  it('returns null when the payload is authentic but not JSON', () => {
    const encoded = Buffer.from('not json at all').toString('base64url');
    const sig = createHmac('sha256', IG_SECRET).update(encoded).digest('base64url');
    expect(verifySignedRequest(`${sig}.${encoded}`, [IG_SECRET])).toBeNull();
  });
});
