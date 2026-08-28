/**
 * The OAuth handshake, checked against what each provider actually requires.
 *
 * §173. Every failure in this pass was a *configuration* failure that the type
 * system was happy with: Threads authenticating as the Meta app, an unversioned
 * Facebook dialog, a redirect URI that did not match what was registered. None of
 * them is catchable by "does it compile" — they are only catchable by asserting
 * the shape of the URL we send against the shape the provider documents.
 *
 * Verified against current provider documentation on 2026-08-23:
 *   X       — https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code
 *   Threads — developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions
 *   Meta    — developers.facebook.com/docs/instagram-platform/overview
 */
import { describe, expect, it } from 'vitest';
import {
  PLATFORM_CLIENT_ENV,
  PLATFORM_SCOPES,
  createPkcePair,
  getAdapter,
  resolvePlatformClient,
  signState,
  verifyState,
} from '../index.js';

const PROD = 'https://halyard-ten.vercel.app';

/* A test secret, passed explicitly. Never the real key, and never read from env. */
const SECRET = 'test-state-secret-not-a-real-key';

function authUrlFor(platform: 'x' | 'instagram' | 'threads', overrides: Record<string, unknown> = {}) {
  const pkce = createPkcePair();
  return new URL(
    getAdapter(platform).getAuthUrl(signState({ productId: 'recipefix', platform, persona: 'brand' }, SECRET), {
      clientId: 'test-client-id',
      clientSecret: 'test-secret',
      redirectUri: `${PROD}/api/oauth/${platform}/callback`,
      codeChallenge: pkce.challenge,
      scopes: PLATFORM_SCOPES[platform],
      ...overrides,
    }),
  );
}

describe('X authorization request', () => {
  const url = authUrlFor('x');

  it('goes to the documented authorize endpoint', () => {
    expect(url.origin + url.pathname).toBe('https://x.com/i/oauth2/authorize');
  });

  it('carries every parameter X documents as required', () => {
    for (const p of ['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'code_challenge', 'code_challenge_method']) {
      expect(url.searchParams.get(p), `missing ${p}`).toBeTruthy();
    }
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('sends the production callback exactly, since X validates it by exact match', () => {
    expect(url.searchParams.get('redirect_uri')).toBe(`${PROD}/api/oauth/x/callback`);
  });

  it('requests offline.access, without which there is no refresh token', () => {
    expect(url.searchParams.get('scope')?.split(' ')).toContain('offline.access');
  });

  it('separates X scopes with spaces, not commas', () => {
    expect(url.searchParams.get('scope')).not.toContain(',');
  });
});

describe('Threads authorization request', () => {
  const url = authUrlFor('threads');

  it('goes to the documented authorize endpoint', () => {
    expect(url.origin + url.pathname).toBe('https://threads.net/oauth/authorize');
  });

  it('authenticates as the Threads app, not the Meta app', () => {
    /*
     * Meta: "For Threads API implementation purposes, use the Threads app ID and
     * its corresponding app secret." Adding the Threads use case to a Meta app
     * mints a separate id, and sending the Meta App ID fails before consent.
     */
    expect(PLATFORM_CLIENT_ENV.threads.id).toBe('THREADS_APP_ID');
    expect(PLATFORM_CLIENT_ENV.threads.secret).toBe('THREADS_APP_SECRET');
    expect(PLATFORM_CLIENT_ENV.threads).not.toEqual(PLATFORM_CLIENT_ENV.instagram);
  });

  it('requests threads_basic, which Threads requires', () => {
    expect(url.searchParams.get('scope')?.split(',')).toContain('threads_basic');
  });
});

describe('Instagram authorization request', () => {
  const url = authUrlFor('instagram');

  it('uses a versioned dialog, so it does not resolve to the oldest live version', () => {
    expect(url.hostname).toBe('www.facebook.com');
    expect(url.pathname).toMatch(/^\/v\d+\.\d+\/dialog\/oauth$/);
  });

  it('pins the dialog to the same Graph version the adapter calls', async () => {
    const { GRAPH_VERSION } = await import('./instagram.js');
    expect(url.pathname).toBe(`/${GRAPH_VERSION}/dialog/oauth`);
  });

  it('requests the Facebook-Login-for-Business permissions, which need a linked Page', () => {
    const scopes = url.searchParams.get('scope')?.split(',') ?? [];
    expect(scopes).toContain('instagram_content_publish');
    expect(scopes).toContain('pages_show_list');
  });
});

describe('client credential resolution', () => {
  it('prefers the platform-specific credentials', () => {
    const r = resolvePlatformClient('threads', {
      THREADS_APP_ID: 'threads-id',
      THREADS_APP_SECRET: 'threads-secret',
      META_APP_ID: 'meta-id',
      META_APP_SECRET: 'meta-secret',
    });
    expect(r).toMatchObject({ clientId: 'threads-id', source: 'primary' });
  });

  it('does not borrow the Meta app id for Threads', () => {
    /*
     * §177. This asserted the opposite. Production disproved it: Threads answers
     * `META_APP_ID` with "No App ID was sent with the request", so the fallback
     * bought nothing and cost the diagnosis — a fixable Halyard state became a
     * provider error naming no variable.
     */
    const r = resolvePlatformClient('threads', { META_APP_ID: 'meta-id', META_APP_SECRET: 'meta-secret' });
    expect(r.source).toBe('missing');
    expect(r.clientId).toBeNull();
  });

  it('treats an empty string as unset — dotenv parses `KEY=` to ""', () => {
    /* CLAUDE.md gotcha 3. `??` does not fall back on an empty string. */
    const r = resolvePlatformClient('x', { X_CLIENT_ID: '   ', X_CLIENT_SECRET: '' });
    expect(r.source).toBe('missing');
    expect(r.clientId).toBeNull();
  });

  it('names every variable it tried, so the error is actionable', () => {
    expect(resolvePlatformClient('threads', {}).tried).toEqual(['THREADS_APP_ID']);
  });

  it('never resolves one platform from another platform’s credentials', () => {
    /*
     * A cross-platform fallback would connect an account with the wrong app and
     * persist a credential under a platform that never issued it.
     */
    const onlyX = { X_CLIENT_ID: 'x-id', X_CLIENT_SECRET: 'x-secret' };
    for (const p of ['instagram', 'threads', 'tiktok', 'pinterest', 'youtube'] as const) {
      expect(resolvePlatformClient(p, onlyX).clientId, p).toBeNull();
    }
  });
});

describe('state', () => {
  it('round-trips the product, platform and persona', () => {
    const s = signState({ productId: 'recipefix', platform: 'x', persona: 'brand' }, SECRET);
    expect(verifyState(s, SECRET)).toMatchObject({ productId: 'recipefix', platform: 'x', persona: 'brand' });
  });

  it('rejects a tampered payload', () => {
    const s = signState({ productId: 'recipefix', platform: 'x', persona: 'brand' }, SECRET);
    const [body, mac] = s.split('.');
    const forged = Buffer.from(
      JSON.stringify({ productId: 'someone-else', platform: 'x', persona: 'brand', nonce: 'n', issuedAt: Math.floor(Date.now() / 1000) }),
    ).toString('base64url');
    expect(() => verifyState(`${forged}.${mac}`, SECRET)).toThrow(/signature/i);
    expect(verifyState(`${body}.${mac}`, SECRET).productId).toBe('recipefix');
  });

  it('rejects a malformed state', () => {
    expect(() => verifyState('not-a-state', SECRET)).toThrow(/Malformed/i);
  });
});

describe('PKCE', () => {
  it('sends the challenge and keeps the verifier', () => {
    const pkce = createPkcePair();
    expect(pkce.challenge).not.toBe(pkce.verifier);
    expect(authUrlFor('x', { codeChallenge: pkce.challenge }).searchParams.get('code_challenge')).toBe(pkce.challenge);
  });

  it('is a fresh pair every time', () => {
    expect(createPkcePair().verifier).not.toBe(createPkcePair().verifier);
  });
});
