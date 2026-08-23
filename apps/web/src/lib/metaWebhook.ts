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
