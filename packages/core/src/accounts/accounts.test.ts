/**
 * Identity confirmation and pre-flight. Milestone 40.
 */
import { describe, expect, it } from 'vitest';
import { allAdapters, getAdapter } from '../adapters/index.js';
import type { PlatformId, PublishAccount } from '../adapters/types.js';
import { checkIdentity, normaliseHandle } from './identity.js';
import { PREFLIGHT, tokenExpiryState } from './preflight.js';
import { accountStatus } from './status.js';

const IDENTITY = {
  platformUserId: 'u-1',
  handle: 'recipefix',
  displayName: 'RecipeFix',
  followerCount: 1200,
};

function account(over: Partial<{
  id: string;
  productId: string;
  persona: 'founder' | 'brand';
  platform: PlatformId;
  platformUserId: string | null;
  handle: string;
}> = {}) {
  return {
    id: 'a-1',
    productId: 'recipefix',
    persona: 'brand' as const,
    platform: 'x' as PlatformId,
    platformUserId: 'u-1',
    handle: '@recipefix',
    ...over,
  };
}

describe('normaliseHandle', () => {
  it('ignores case, the leading at, and the domain Bluesky appends', () => {
    expect(normaliseHandle('@RecipeFix')).toBe('recipefix');
    expect(normaliseHandle('recipefix.bsky.social')).toBe('recipefix');
    expect(normaliseHandle(' RecipeFix ')).toBe('recipefix');
    expect(normaliseHandle(null)).toBe('');
  });
});

describe('checkIdentity', () => {
  it('passes silently when the authorised account is the expected one', () => {
    expect(
      checkIdentity({
        platform: 'x',
        persona: 'brand',
        productId: 'recipefix',
        expectedHandle: 'recipefix',
        identity: IDENTITY,
        existing: [],
      }),
    ).toEqual([]);
  });

  it('says so when a configured handle disagrees, without refusing a first connection', () => {
    /*
     * §176. This asserted `severe: true`, which made a *configured* handle
     * outrank the platform — and the configured value was seeded before any
     * account existed, so the first correct connection of @Recipe_Fix was
     * reported as the wrong account. A guess cannot overrule the provider.
     *
     * The browser-session failure this guards against — authorising your personal
     * account because that is what the browser was signed into — is still caught,
     * by the mechanism that actually catches it: the identity is fetched, shown
     * to a person, and written only once they confirm it. This warning now says
     * what happened and leaves the judgement where it belongs.
     *
     * Continuity for an account that *has* an identity is enforced against the
     * stored platform user id; see `expectedHandle.test.ts`.
     */
    const warnings = checkIdentity({
      platform: 'x',
      persona: 'brand',
      productId: 'recipefix',
      expectedHandle: 'recipefix',
      identity: { ...IDENTITY, handle: 'isaacmineo', platformUserId: 'u-9' },
      existing: [],
    });
    const mismatch = warnings.find((w) => w.kind === 'handle_mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch?.severe).toBe(false);
    expect(mismatch?.message).toContain('@isaacmineo');
    expect(mismatch?.fix).toMatch(/private window/i);
  });

  it('flags an identity already connected to this product, severely', () => {
    const warnings = checkIdentity({
      platform: 'x',
      persona: 'founder',
      productId: 'recipefix',
      identity: IDENTITY,
      existing: [account()],
    });
    const dup = warnings.find((w) => w.kind === 'duplicate_identity');
    expect(dup?.severe).toBe(true);
    expect(dup?.message).toMatch(/already connected to this product/);
  });

  it('flags an identity connected to a different product, but not severely', () => {
    const warnings = checkIdentity({
      platform: 'x',
      persona: 'brand',
      productId: 'other',
      identity: IDENTITY,
      existing: [account()],
    });
    expect(warnings.find((w) => w.kind === 'duplicate_identity')?.severe).toBe(false);
  });

  it('does not call a reconnect of the same account a duplicate', () => {
    const warnings = checkIdentity({
      platform: 'x',
      persona: 'brand',
      productId: 'recipefix',
      identity: IDENTITY,
      existing: [account()],
      reconnectingAccountId: 'a-1',
    });
    expect(warnings.find((w) => w.kind === 'duplicate_identity')).toBeUndefined();
  });

  it('flags a reconnect that silently swaps the identity, because it orphans the history', () => {
    const warnings = checkIdentity({
      platform: 'x',
      persona: 'brand',
      productId: 'recipefix',
      identity: { ...IDENTITY, platformUserId: 'u-2', handle: 'recipefix-new' },
      existing: [account()],
      reconnectingAccountId: 'a-1',
    });
    const changed = warnings.find((w) => w.kind === 'reconnect_changed_identity');
    expect(changed?.severe).toBe(true);
  });

  it('mentions the other reachable accounts when a token spans several', () => {
    const warnings = checkIdentity({
      platform: 'instagram',
      persona: 'brand',
      productId: 'recipefix',
      identity: {
        ...IDENTITY,
        alternatives: [{ platformUserId: 'u-2', handle: 'other-brand' }],
      },
      existing: [],
    });
    expect(warnings.find((w) => w.kind === 'multiple_identities')?.message).toMatch(/2 accounts/);
  });

  it('notes a zero-follower account without treating it as an error', () => {
    const warnings = checkIdentity({
      platform: 'x',
      persona: 'brand',
      productId: 'recipefix',
      identity: { ...IDENTITY, followerCount: 0 },
      existing: [],
    });
    expect(warnings.find((w) => w.kind === 'zero_followers')?.severe).toBe(false);
  });
});

describe('tokenExpiryState', () => {
  const now = new Date('2026-03-01T00:00:00Z');

  it('says nothing about a token with no expiry', () => {
    expect(tokenExpiryState(null, now).level).toBe('none');
  });

  it('stays quiet while there is more than a week left', () => {
    expect(tokenExpiryState(new Date('2026-03-20T00:00:00Z'), now).level).toBe('none');
  });

  it('warns inside seven days, and says what breaks', () => {
    const state = tokenExpiryState(new Date('2026-03-05T00:00:00Z'), now);
    expect(state.level).toBe('warn');
    expect(state.message).toMatch(/scheduled posts.*fail/i);
  });

  it('reports an expired token as expired rather than as a warning', () => {
    expect(tokenExpiryState(new Date('2026-02-20T00:00:00Z'), now).level).toBe('expired');
  });
});

describe('pre-flight checklists', () => {
  it('covers every platform that has an adapter', () => {
    for (const adapter of allAdapters()) {
      expect(PREFLIGHT[adapter.platform], adapter.platform).toBeDefined();
      expect(PREFLIGHT[adapter.platform].items.length).toBeGreaterThan(0);
    }
  });

  it('says what goes wrong, not just what to do', () => {
    for (const preflight of Object.values(PREFLIGHT)) {
      for (const item of preflight.items) {
        expect(item.otherwise.length).toBeGreaterThan(20);
      }
      expect(preflight.browserProfile.length).toBeGreaterThan(20);
    }
  });
});

describe('fetchIdentity', () => {
  it('exists on every adapter, because no token is saved without one', () => {
    for (const adapter of allAdapters()) {
      expect(typeof adapter.fetchIdentity, adapter.platform).toBe('function');
    }
  });

  function withFetch(platform: PlatformId, body: unknown, tokenMeta = {}): PublishAccount {
    const fetchImpl = (async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    return {
      id: 'pending',
      platform,
      handle: '',
      platformUserId: (tokenMeta as { did?: string }).did ?? null,
      capabilityState: 'pending_auth',
      tokens: { accessToken: 'token', meta: tokenMeta },
      meta: { fetchImpl, ...tokenMeta },
    };
  }

  it('reads the X handle, name and follower count off /users/me', async () => {
    const identity = await getAdapter('x').fetchIdentity(
      withFetch('x', {
        data: {
          id: '42',
          username: 'recipefix',
          name: 'RecipeFix',
          profile_image_url: 'https://pbs.twimg.com/pic_normal.jpg',
          public_metrics: { followers_count: 300 },
        },
      }),
    );
    expect(identity).toMatchObject({
      platformUserId: '42',
      handle: 'recipefix',
      displayName: 'RecipeFix',
      followerCount: 300,
    });
    // The default is a 48px crop; the confirmation screen wants the real one.
    expect(identity.avatarUrl).toBe('https://pbs.twimg.com/pic.jpg');
  });

  it('returns every Instagram account the Meta token reaches, first one selected', async () => {
    const identity = await getAdapter('instagram').fetchIdentity(
      withFetch('instagram', {
        data: [
          {
            name: 'RecipeFix Page',
            instagram_business_account: { id: 'ig-1', username: 'recipefix', followers_count: 10 },
          },
          {
            name: 'Old Side Project',
            instagram_business_account: { id: 'ig-2', username: 'oldthing' },
          },
        ],
      }),
    );
    expect(identity.platformUserId).toBe('ig-1');
    expect(identity.alternatives).toHaveLength(1);
    expect(identity.alternatives![0]!.handle).toBe('oldthing');
  });

  it('tells you how to fix a Facebook account with no linked professional Instagram', async () => {
    await expect(
      getAdapter('instagram').fetchIdentity(withFetch('instagram', { data: [] })),
    ).rejects.toThrow(/Switch to professional account/);
  });

  it('lists YouTube brand channels as alternatives rather than picking one silently', async () => {
    const identity = await getAdapter('youtube').fetchIdentity(
      withFetch('youtube', {
        items: [
          {
            id: 'UC1',
            snippet: { title: 'RecipeFix', customUrl: '@recipefix' },
            statistics: { subscriberCount: '90' },
          },
          { id: 'UC2', snippet: { title: 'Personal' } },
        ],
      }),
    );
    expect(identity).toMatchObject({ platformUserId: 'UC1', handle: 'recipefix', followerCount: 90 });
    expect(identity.alternatives).toHaveLength(1);
  });

  it('tells you to create a channel when the Google account has none', async () => {
    await expect(
      getAdapter('youtube').fetchIdentity(withFetch('youtube', { items: [] })),
    ).rejects.toThrow(/create_channel/);
  });

  it('resolves a Bluesky profile from the DID carried on the session', async () => {
    const identity = await getAdapter('bluesky').fetchIdentity(
      withFetch(
        'bluesky',
        { handle: 'recipefix.bsky.social', displayName: 'RecipeFix', followersCount: 5 },
        { did: 'did:plc:abc' },
      ),
    );
    expect(identity).toMatchObject({
      platformUserId: 'did:plc:abc',
      handle: 'recipefix.bsky.social',
      followerCount: 5,
    });
  });

  it('refuses rather than guessing when the platform returns no user', async () => {
    await expect(getAdapter('x').fetchIdentity(withFetch('x', {}))).rejects.toThrow(/no user/i);
  });
});

/**
 * The operator-facing account status.
 *
 * These assert the *precedence*, because that is where a status summary
 * silently lies: showing "ready" while a global pause is on, or "waiting on
 * approval" while the credential is dead, both read as reassurance.
 */
describe('what an operator is told about an account', () => {
  const base = {
    requiresPlatformReview: false,
    publishingEnabled: true,
  };
  const connected = {
    capabilityState: 'live' as const,
    hasToken: true,
    identityConfirmedAt: new Date(),
    handle: '@recipefix',
  };

  it('says not connected when there is no account', () => {
    const v = accountStatus({ ...base, account: null });
    expect(v.status).toBe('not_connected');
    expect(v.nextAction).toBe('connect');
    expect(v.canPublish).toBe(false);
  });

  it('does not call an account ready just because it is marked live', () => {
    /**
     * The exact confusion this replaces. `live` is a capability_state meaning
     * "past platform review" — the seeded X accounts carry it with no token at
     * all, and the old UI rendered that as a green LIVE badge.
     */
    const v = accountStatus({ ...base, account: { ...connected, hasToken: false } });
    expect(v.status).not.toBe('ready');
    expect(v.canPublish).toBe(false);
    expect(v.nextAction).toBe('connect');
  });

  it('blocks publishing until the identity is confirmed', () => {
    const v = accountStatus({ ...base, account: { ...connected, identityConfirmedAt: null } });
    expect(v.status).toBe('identity_required');
    expect(v.canPublish).toBe(false);
    // Reading is fine — the restriction is about sending, not about looking.
    expect(v.canRead).toBe(true);
    expect(v.nextAction).toBe('confirm_identity');
  });

  it('distinguishes waiting on the platform from anything the operator can fix', () => {
    const v = accountStatus({
      ...base,
      requiresPlatformReview: true,
      account: { ...connected, capabilityState: 'draft_only' },
    });
    expect(v.status).toBe('awaiting_platform_approval');
    expect(v.approval).toBe('required');
    expect(v.canPublish).toBe(false);
  });

  it('reports the global pause even on an otherwise ready account', () => {
    const v = accountStatus({ ...base, publishingEnabled: false, account: connected });
    expect(v.status).toBe('publishing_paused');
    expect(v.canPublish).toBe(false);
    expect(v.explanation).toContain('across all of Halyard');
  });

  it('only says ready when everything actually allows publishing', () => {
    const v = accountStatus({ ...base, account: connected });
    expect(v.status).toBe('ready');
    expect(v.canPublish).toBe(true);
    expect(v.tone).toBe('good');
  });

  it('puts a dead credential ahead of a pending review', () => {
    // Otherwise an errored account reads as "just waiting on the platform".
    const v = accountStatus({
      ...base,
      requiresPlatformReview: true,
      account: { ...connected, capabilityState: 'error' },
    });
    expect(v.status).toBe('reconnect_required');
    expect(v.tone).toBe('bad');
  });

  it('treats an expired token as needing reconnection', () => {
    const v = accountStatus({ ...base, tokenExpired: true, account: connected });
    expect(v.canPublish).toBe(false);
    expect(v.nextAction).toBe('reconnect');
  });

  it('never claims publishing is possible while any blocker holds', () => {
    /**
     * The property that matters most: no combination of inputs may produce
     * `canPublish` while a gate is closed. A status summary that overstates is
     * worse than the four badges it replaced.
     */
    for (const account of [
      null,
      { ...connected, hasToken: false },
      { ...connected, identityConfirmedAt: null },
      { ...connected, capabilityState: 'draft_only' as const },
      { ...connected, capabilityState: 'error' as const },
      { ...connected, capabilityState: 'disabled' as const },
    ]) {
      expect(accountStatus({ ...base, account }).canPublish, JSON.stringify(account)).toBe(false);
    }
    expect(accountStatus({ ...base, publishingEnabled: false, account: connected }).canPublish).toBe(
      false,
    );
  });

  it('always offers an action that can actually be taken', () => {
    const views = [
      accountStatus({ ...base, account: null }),
      accountStatus({ ...base, account: { ...connected, identityConfirmedAt: null } }),
      accountStatus({ ...base, account: connected }),
    ];
    for (const v of views) {
      expect(v.actionLabel, v.status).toBeTruthy();
      expect(v.explanation.length, v.status).toBeGreaterThan(20);
    }
  });
});
