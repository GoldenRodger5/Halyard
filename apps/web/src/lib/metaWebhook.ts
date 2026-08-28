/**
 * The decidable parts of Meta's webhook: the signature and the payload shape.
 *
 * Separated from the route handler because both are pure and both are worth
 * testing directly — the route itself pulls in the database, and a test of an
 * HMAC should not need one. Same split as `oauthRedirect.ts`.
 */
import { createHmac } from 'node:crypto';
import { safeEqual } from '@halyard/core';

/** Meta signs the raw body with the app secret. `sha256=<hex>`. */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
  return safeEqual(header, expected);
}

/**
 * The Instagram media ids a payload refers to.
 *
 * Read defensively — this is untrusted input from the network, and the shape is
 * whatever arrives, not whatever is documented. Anything unrecognised yields no
 * ids rather than an exception.
 */
export function mediaIdsFrom(payload: unknown): string[] {
  const ids = new Set<string>();
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return [];

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: unknown })?.value as
        | { media?: { id?: unknown }; media_id?: unknown }
        | undefined;
      if (!value) continue;
      const nested = value.media?.id;
      if (typeof nested === 'string' && nested) ids.add(nested);
      if (typeof value.media_id === 'string' && value.media_id) ids.add(value.media_id);
    }
  }
  return [...ids];
}

/**
 * Meta's `signed_request`, used by the deauthorize and data-deletion callbacks.
 *
 * §183. A different mechanism from the webhook signature above, and easy to
 * conflate. Webhooks sign the raw body and put the digest in an
 * `x-hub-signature-256` header; these two callbacks instead POST a form field
 * named `signed_request` shaped `<base64url signature>.<base64url payload>`,
 * where the signature is an HMAC-SHA256 **of the encoded payload string** — not
 * of the decoded JSON, and not of the whole body.
 *
 * Verified against every candidate secret rather than one. An app configured for
 * Instagram Login signs with the Instagram app secret, while the same app's
 * Facebook-side callbacks sign with the Meta app secret; accepting either is
 * what lets one endpoint serve both without asking the caller to declare which
 * product it came from. Comparison is constant-time and a bad payload yields
 * null rather than throwing.
 */
export function verifySignedRequest(
  signedRequest: string | null | undefined,
  secrets: Array<string | undefined>,
): { userId: string | null; issuedAt: number | null } | null {
  if (!signedRequest || !signedRequest.includes('.')) return null;

  const [encodedSig, encodedPayload] = signedRequest.split('.', 2);
  if (!encodedSig || !encodedPayload) return null;

  const usable = secrets.filter((s): s is string => Boolean(s && s.trim().length > 0));
  if (usable.length === 0) return null;

  const matches = usable.some((secret) => {
    const expected = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    return safeEqual(encodedSig, expected);
  });
  if (!matches) return null;

  try {
    const json = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
      user_id?: unknown;
      issued_at?: unknown;
    };
    return {
      userId: typeof json.user_id === 'string' ? json.user_id : null,
      issuedAt: typeof json.issued_at === 'number' ? json.issued_at : null,
    };
  } catch {
    /* Signed but unparseable. Authentic and useless is still not trustworthy. */
    return null;
  }
}
