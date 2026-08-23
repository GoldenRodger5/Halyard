/**
 * Where an OAuth provider should send the user back to.
 *
 * ## Why this is a function and not an inline `??`
 *
 * Both OAuth routes previously read:
 *
 *     const base = process.env.OAUTH_REDIRECT_BASE_URL ?? request.nextUrl.origin;
 *
 * `??` falls back only on `null` and `undefined`. `.env.example` ships
 * `OAUTH_REDIRECT_BASE_URL=` with an inline comment, which dotenv parses to the
 * **empty string** — so `base` became `''` and the redirect URI came out as the
 * relative `/api/oauth/x/callback`. Every OAuth provider requires an absolute
 * URI, so the handshake fails before consent, on a fresh clone, with an error
 * that points nowhere near the cause.
 *
 * A trailing slash is stripped for the same reason the providers care: the
 * registered callback must match character for character, and
 * `https://host//api/...` is not the same string as `https://host/api/...`.
 */
export function resolveRedirectBase(configured: string | undefined, origin: string): string {
  const trimmed = configured?.trim();
  const base = trimmed && trimmed.length > 0 ? trimmed : origin;
  return base.replace(/\/+$/, '');
}

/** The full callback URI for one platform. Absolute, always. */
export function callbackUrl(
  configured: string | undefined,
  origin: string,
  platform: string,
): string {
  return `${resolveRedirectBase(configured, origin)}/api/oauth/${platform}/callback`;
}
