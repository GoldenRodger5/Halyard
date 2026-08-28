/**
 * OAuth plumbing shared by all six adapters.
 *
 * The `state` parameter is an HMAC-signed envelope rather than an opaque random
 * string. It carries the account it belongs to and an expiry, so a callback that
 * arrives without a matching server session is still verifiable, and a replayed
 * callback from yesterday is rejected.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from '../crypto/tokenCrypto.js';

export interface OAuthStatePayload {
  productId: string;
  platform: string;
  persona: 'founder' | 'brand';
  nonce: string;
  issuedAt: number;
}

const STATE_TTL_SECONDS = 15 * 60;

function stateSecret(secret = process.env.TOKEN_ENCRYPTION_KEY): string {
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY is required to sign OAuth state.');
  return secret;
}

export function signState(
  payload: Omit<OAuthStatePayload, 'nonce' | 'issuedAt'>,
  secret?: string,
): string {
  const full: OAuthStatePayload = {
    ...payload,
    nonce: randomBytes(12).toString('base64url'),
    issuedAt: Math.floor(Date.now() / 1000),
  };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', stateSecret(secret)).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, secret?: string): OAuthStatePayload {
  const [body, mac] = state.split('.');
  if (!body || !mac) throw new Error('Malformed OAuth state.');
  const expected = createHmac('sha256', stateSecret(secret)).update(body).digest('base64url');
  if (!safeEqual(mac, expected)) throw new Error('OAuth state signature does not verify.');

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
  const age = Math.floor(Date.now() / 1000) - payload.issuedAt;
  if (age > STATE_TTL_SECONDS) throw new Error('OAuth state has expired. Start the connect flow again.');
  if (age < -60) throw new Error('OAuth state is from the future. Check server clocks.');
  return payload;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** RFC 7636 S256. X requires PKCE; the others tolerate it. */
export function createPkcePair(): PkcePair {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthUrl(
  base: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, value);
  }
  return url.toString();
}

export interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string | string[];
  token_type?: string;
  [key: string]: unknown;
}

export function toTokenSet(response: TokenResponse): {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
} {
  if (!response.access_token) {
    throw new Error(`Token response contained no access_token: ${JSON.stringify(response).slice(0, 200)}`);
  }
  const scopes = Array.isArray(response.scope)
    ? response.scope
    : typeof response.scope === 'string'
      ? response.scope.split(/[\s,]+/).filter(Boolean)
      : [];
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    expiresAt: response.expires_in ? new Date(Date.now() + response.expires_in * 1000) : null,
    scopes,
  };
}

/**
 * Tokens are refreshed by cron an hour before expiry (v1 §7). This is the
 * predicate that job uses.
 */
export function needsRefresh(expiresAt: Date | null | undefined, leadMinutes = 60): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - Date.now() < leadMinutes * 60_000;
}

/** Scopes each platform needs, kept beside the adapters that use them. */
export const PLATFORM_SCOPES: Record<string, string[]> = {
  // X: OAuth2 PKCE with refresh tokens (v1 §7).
  x: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  // v2 A.3: publishing needs instagram_business_content_publish, which needs
  // Meta App Review. Dev mode works against your own account immediately.
  instagram: [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_insights',
    'pages_show_list',
    'pages_read_engagement',
    'business_management',
  ],
  threads: ['threads_basic', 'threads_content_publish', 'threads_manage_replies', 'threads_manage_insights'],
  /*
   * §179. Direct Post, and only the scopes that are actually called.
   *
   *   user.info.profile — open_id, username, display_name, avatar_url
   *   user.info.stats   — follower_count, shown on the account card
   *   video.list        — /v2/video/query/, which collectMetrics uses
   *   video.publish     — /v2/post/publish/video/init/, the Direct Post endpoint
   *
   * `video.upload` is gone with the inbox path it served. It was never granted in
   * the developer portal, so the inbox fallback could not have worked, and asking
   * for a scope the integration does not call is the kind of thing app review
   * rejects.
   */
  tiktok: ['user.info.profile', 'user.info.stats', 'video.list', 'video.publish'],
  pinterest: ['boards:read', 'pins:read', 'pins:write', 'user_accounts:read'],
  youtube: [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  ],
};
