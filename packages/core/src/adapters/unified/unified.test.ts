/**
 * The unified transport. Milestone 49.
 *
 * The thing worth testing here is not that a POST is well-formed — it is that
 * the adapter refuses to act on anything it has not seen verified. Every test
 * below is some version of that: unknown is not permission, an absent metric is
 * not a zero, and a response without an id is never retried.
 *
 * Nothing here touches the network. Every request is served by a scripted fetch.
 */
import { describe, expect, it } from 'vitest';
import {
  BLOTATO_DOCUMENTED_METRICS,
  DIRECT_METRICS,
  SCORED_METRICS,
  type ScoredMetric,
  TARGET_TYPE,
  UnifiedAdapter,
  buildTarget,
  canPublish,
  describeGap,
  isVerified,
  missingMetrics,
  unverified,
  type ProviderCapabilities,
} from './index.js';
import {
  PublishError,
  type PlatformId,
  type PublishAccount,
  type PublishItem,
} from '../types.js';
import { X_CONSTRAINTS } from '../x.js';
import { TIKTOK_CONSTRAINTS } from '../tiktok.js';
import { INSTAGRAM_CONSTRAINTS } from '../instagram.js';
import { PINTEREST_CONSTRAINTS } from '../pinterest.js';
import { YOUTUBE_CONSTRAINTS } from '../youtube.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

interface Recorded {
  url: string;
  method: string;
  body: Record<string, unknown>;
  apiKey: string | null;
}

function scriptedFetch(respond: (url: string, calls: Recorded[]) => Response): {
  fetchImpl: typeof fetch;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      apiKey: new Headers(init?.headers).get('blotato-api-key'),
    });
    return respond(url, calls);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function verifiedFor(
  platform: 'x' | 'tiktok' | 'instagram' | 'pinterest' | 'youtube',
  over: Record<string, unknown> = {},
): ProviderCapabilities {
  const base = unverified('blotato', [platform]);
  base.verifiedAt = '2026-08-10T00:00:00.000Z';
  base.platforms[platform] = {
    ...base.platforms[platform]!,
    publish: 'yes',
    publishesPublicly: 'yes',
    carousel: 'yes',
    video: 'yes',
    shortVideo: 'yes',
    altText: 'yes',
    scheduling: 'yes',
    metrics: [...BLOTATO_DOCUMENTED_METRICS],
    notes: [],
    ...over,
  } as (typeof base.platforms)[typeof platform];
  return base;
}

function account(over: Partial<PublishAccount> = {}): PublishAccount {
  return {
    id: 'acct-1',
    platform: 'x',
    handle: '@recipefix',
    platformUserId: 'user-1',
    capabilityState: 'live',
    tokens: { accessToken: 'unused-on-this-transport' },
    meta: { providerAccountId: 'blotato-acct-9' },
    ...over,
  };
}

function item(over: Partial<PublishItem> = {}): PublishItem {
  return {
    id: 'item-1',
    platform: 'x',
    format: 'text',
    body: 'Your gluten-free loaf is gummy. Vinegar firms the crumb.',
    hashtags: [],
    ...over,
  };
}

// ── unknown is not permission ───────────────────────────────────────────────

describe('capability model', () => {
  it('starts every capability unknown, because a vendor page is not a verification', () => {
    const caps = unverified('blotato', ['x', 'instagram', 'tiktok']);
    expect(caps.verifiedAt).toBeNull();
    for (const platform of ['x', 'instagram', 'tiktok'] as const) {
      const c = caps.platforms[platform]!;
      expect(c.publish).toBe('unknown');
      expect(c.publishesPublicly).toBe('unknown');
      expect(c.altText).toBe('unknown');
      expect(c.metrics).toEqual([]);
      expect(isVerified(caps, platform)).toBe(false);
    }
  });

  it('refuses publishing on an unknown capability and says how to settle it', () => {
    const verdict = canPublish(unverified('blotato', ['tiktok']), 'tiktok');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('verify-provider');
  });

  it('refuses publishing on a capability verified as absent, quoting the note', () => {
    const caps = unverified('blotato', ['pinterest']);
    caps.platforms.pinterest!.publish = 'no';
    caps.platforms.pinterest!.notes = ['The provider returned 501 for every board.'];
    const verdict = canPublish(caps, 'pinterest');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('501');
  });

  it('allows publishing only once a real account has been watched doing it', () => {
    expect(canPublish(verifiedFor('x'), 'x').allowed).toBe(true);
  });

  it('treats an entirely unlisted platform as unknown, not as fine', () => {
    expect(canPublish({ provider: 'blotato', verifiedAt: null, platforms: {} }, 'youtube').allowed).toBe(
      false,
    );
  });
});

// ── the gap is named, never rendered as a zero ──────────────────────────────

describe('metric gap reporting', () => {
  it('finds no documented gap, because the provider reports every scored metric', () => {
    // This is the corrected position. An earlier reading of the marketing pages
    // concluded saves were unavailable; the analytics schema has `savesCount`,
    // `clicksCount`, `profileVisitsCount`, `followsCount` and `watchTimeMsAvg`.
    for (const platform of Object.keys(DIRECT_METRICS) as PlatformId[]) {
      expect(
        missingMetrics(platform, BLOTATO_DOCUMENTED_METRICS),
        `${platform} should have no documented gap`,
      ).toEqual([]);
      expect(describeGap(platform, BLOTATO_DOCUMENTED_METRICS)).toBeNull();
    }
  });

  it('still reports a gap against what a probe actually observed', () => {
    // Documented and observed are different things, which is the whole reason
    // they are stored separately. A probe that never saw saves come back
    // produces a gap even though the schema promises them.
    const observed: ScoredMetric[] = ['impressions', 'likes', 'comments'];
    const gap = describeGap('instagram', observed);
    expect(gap).toContain('saves');
    expect(gap).toContain('does not report');
  });

  it('calls out saves specifically, because they are weighted above a like', () => {
    expect(describeGap('instagram', ['impressions', 'likes'])).toContain('two to three times');
    // Threads has no saves to lose, so no such clause.
    expect(describeGap('threads', ['impressions']) ?? '').not.toContain('two to three times');
  });

  it('reassures on link clicks, which Halyard counts itself through /r', () => {
    expect(describeGap('x', ['impressions', 'likes'])).toContain('/r');
  });

  it('returns null when nothing is lost, so /analytics stays quiet', () => {
    expect(describeGap('threads', DIRECT_METRICS.threads)).toBeNull();
    expect(missingMetrics('threads', DIRECT_METRICS.threads)).toEqual([]);
  });

  it('keeps DIRECT_METRICS inside the set the scorer actually reads', () => {
    for (const metrics of Object.values(DIRECT_METRICS)) {
      for (const metric of metrics) {
        expect(SCORED_METRICS).toContain(metric);
      }
    }
  });

  it('keeps the documented list inside the set the scorer reads', () => {
    for (const metric of BLOTATO_DOCUMENTED_METRICS) {
      expect(SCORED_METRICS).toContain(metric);
    }
  });
});

// ── per-platform targets ────────────────────────────────────────────────────

describe('buildTarget', () => {
  it('maps x to the provider’s own name for it', () => {
    expect(TARGET_TYPE.x).toBe('twitter');
    expect(buildTarget('x', item(), account()).targetType).toBe('twitter');
  });

  it('sends TikTok to drafts even when public posting is verified', () => {
    // Not a limitation being worked around. No API can attach trending audio,
    // so a hand-finished post outperforms an automated one.
    const target = buildTarget('tiktok', item({ platform: 'tiktok', format: 'video' }), account());
    expect(target.isDraft).toBe(true);
    expect(target.privacyLevel).toBe('SELF_ONLY');
  });

  it('carries the AI label through to TikTok', () => {
    const target = buildTarget(
      'tiktok',
      item({ platform: 'tiktok', format: 'video', requiresAiLabel: true }),
      account(),
    );
    expect(target.isAiGenerated).toBe(true);
  });

  it('refuses a Pinterest post with no board rather than guessing one', () => {
    expect(() => buildTarget('pinterest', item({ platform: 'pinterest' }), account())).toThrow(
      PublishError,
    );
  });

  it('keeps YouTube private until the compliance audit is recorded as passed', () => {
    const unaudited = buildTarget('youtube', item({ platform: 'youtube', format: 'video' }), account());
    expect(unaudited.privacyStatus).toBe('private');

    const audited = buildTarget(
      'youtube',
      item({ platform: 'youtube', format: 'video' }),
      account({ meta: { providerAccountId: 'x', complianceAuditPassed: true } }),
    );
    expect(audited.privacyStatus).toBe('public');
  });

  it('marks a video as a reel, singular, which is the only value the API takes', () => {
    expect(
      buildTarget('instagram', item({ platform: 'instagram', format: 'video' }), account()).mediaType,
    ).toBe('reel');
  });

  it('sends no mediaType for a carousel, because a carousel is not a media type', () => {
    // `mediaType` is `reel` or `story`. A carousel is what several mediaUrls
    // produce, and sending "carousel" is a rejected request.
    const target = buildTarget('instagram', item({ platform: 'instagram', format: 'carousel' }), account());
    expect(target.mediaType).toBeUndefined();
  });

  it('carries alt text on the platforms whose target accepts it', () => {
    const ig = buildTarget(
      'instagram',
      item({ platform: 'instagram', format: 'image', altText: 'A collapsed loaf beside a risen one.' }),
      account(),
    );
    expect(ig.altText).toContain('collapsed loaf');

    const pin = buildTarget(
      'pinterest',
      item({ platform: 'pinterest', boardId: 'b1', title: 'Gluten-free bread', altText: 'A sliced loaf.' }),
      account(),
    );
    expect(pin.altText).toBe('A sliced loaf.');
  });

  it('sends every boolean TikTok requires, not just the interesting ones', () => {
    // Six are required. Omitting them is a rejected request, and the rejection
    // is a validation error rather than anything actionable.
    const target = buildTarget('tiktok', item({ platform: 'tiktok', format: 'video' }), account());
    for (const key of [
      'disabledComments',
      'disabledDuet',
      'disabledStitch',
      'isBrandedContent',
      'isYourBrand',
      'isAiGenerated',
    ]) {
      expect(target[key], `TikTok target is missing ${key}`).toBeTypeOf('boolean');
    }
    expect(target.privacyLevel).toBe('SELF_ONLY');
  });

  it('always gives Pinterest a title, which the API requires and search needs', () => {
    const target = buildTarget(
      'pinterest',
      item({ platform: 'pinterest', boardId: 'b1', body: 'Your gluten-free loaf is gummy.' }),
      account(),
    );
    expect(target.title).toBe('Your gluten-free loaf is gummy.');
    expect(String(target.title).length).toBeLessThanOrEqual(100);
  });

  it('tells YouTube not to notify subscribers about a private upload', () => {
    const target = buildTarget('youtube', item({ platform: 'youtube', format: 'video' }), account());
    expect(target.privacyStatus).toBe('private');
    expect(target.shouldNotifySubscribers).toBe(false);
  });
});

// ── publishing ──────────────────────────────────────────────────────────────

describe('UnifiedAdapter.publish', () => {
  const adapterFor = (
    platform: 'x' | 'tiktok' | 'instagram',
    capabilities: ProviderCapabilities,
    respond: (url: string, calls: Recorded[]) => Response,
  ) => {
    const { fetchImpl, calls } = scriptedFetch(respond);
    const constraints = {
      x: X_CONSTRAINTS,
      tiktok: TIKTOK_CONSTRAINTS,
      instagram: INSTAGRAM_CONSTRAINTS,
    }[platform];
    return {
      adapter: new UnifiedAdapter({
        platform,
        constraints,
        capabilities,
        apiKey: 'key-123',
        fetchImpl,
      }),
      calls,
    };
  };

  it('refuses to carry a real post on an unverified transport', async () => {
    const { adapter, calls } = adapterFor('tiktok', unverified('blotato', ['tiktok']), () =>
      json({ id: 'should-never-be-called' }),
    );
    await expect(adapter.publish(item({ platform: 'tiktok' }), [], account())).rejects.toThrow(
      /never been verified/,
    );
    // The important half: it did not try first and ask questions later.
    expect(calls).toHaveLength(0);
  });

  it('authenticates with the provider header, not a bearer token', async () => {
    const { adapter, calls } = adapterFor('x', verifiedFor('x'), () =>
      json({ postSubmissionId: 'post-1' }),
    );
    await adapter.publish(item(), [], account());
    expect(calls[0]!.apiKey).toBe('key-123');
    expect(calls[0]!.url).toContain('/v2/posts');
  });

  it('names the missing environment variable when the key is absent', async () => {
    const { fetchImpl } = scriptedFetch(() => json({ postSubmissionId: 'post-1' }));
    const adapter = new UnifiedAdapter({
      platform: 'x',
      constraints: X_CONSTRAINTS,
      capabilities: verifiedFor('x'),
      apiKey: '',
      fetchImpl,
    });
    // The env var is read at construction; an empty explicit key must not fall
    // back to whatever the ambient environment happens to hold.
    delete process.env.BLOTATO_API_KEY;
    await expect(adapter.publish(item(), [], account())).rejects.toThrow(/BLOTATO_API_KEY/);
  });

  it('refuses when no provider account id is stored, rather than posting somewhere', async () => {
    const { adapter } = adapterFor('x', verifiedFor('x'), () =>
      json({ postSubmissionId: 'post-1' }),
    );
    await expect(
      adapter.publish(item(), [], account({ meta: {}, platformUserId: null })),
    ).rejects.toThrow(/provider account id/);
  });

  it('refuses an X post whose link belongs in a reply, rather than degrading it', async () => {
    // There is no reply endpoint in this API at all. The tempting fallback is
    // to put the link in the body, which on X costs $0.20 against $0.015 — a
    // thirteenfold cost increase applied silently to every post.
    const { adapter, calls } = adapterFor('x', verifiedFor('x'), () =>
      json({ postSubmissionId: 'should-never-be-called' }),
    );

    await expect(
      adapter.publish(item({ finalLinkUrl: 'https://recipefix.app/r/abc' }), [], account()),
    ).rejects.toThrow(/no reply endpoint/);
    expect(calls).toHaveLength(0);
  });

  it('publishes an X post with no link, since nothing is being degraded', async () => {
    const { adapter, calls } = adapterFor('x', verifiedFor('x'), () =>
      json({ postSubmissionId: 'post-1' }),
    );
    const result = await adapter.publish(item(), [], account());
    expect(result.platformPostId).toBe('post-1');
    expect(calls).toHaveLength(1);
  });

  it('always sends mediaUrls, which the schema requires even when empty', async () => {
    const { adapter, calls } = adapterFor('x', verifiedFor('x'), () =>
      json({ postSubmissionId: 'post-1' }),
    );
    await adapter.publish(item(), [], account());
    const content = (calls[0]!.body.post as { content: { mediaUrls: string[] } }).content;
    expect(Array.isArray(content.mediaUrls)).toBe(true);
    expect(content.mediaUrls).toEqual([]);
  });

  it('never retries a response with no id — a retry double-posts', async () => {
    // Note the shape: `id` is exactly what this adapter used to read, and it is
    // not what the API returns. A response like this must read as malformed.
    const { adapter, calls } = adapterFor('x', verifiedFor('x'), () => json({ id: 'wrong-field' }));
    const result = await adapter.publish(item(), [], account());

    expect(result.malformedResponse).toBe(true);
    expect(result.platformPostId).toBeUndefined();
    // And it did not go on to attempt the link reply against an unknown parent.
    expect(calls).toHaveLength(1);
  });

  it('reports a draft as a draft, with somewhere to go and finish it', async () => {
    const caps = verifiedFor('tiktok', { publishesPublicly: 'no' });
    const { adapter } = adapterFor('tiktok', caps, () => json({ postSubmissionId: 'post-9' }));
    const result = await adapter.publish(
      item({ platform: 'tiktok', format: 'video' }),
      [],
      account({ platform: 'tiktok' }),
    );
    expect(result.mode).toBe('draft');
    expect(result.manualPublishUrl).toBeTruthy();
  });

  it('reports TikTok as a draft even when the provider posts publicly elsewhere', async () => {
    const { adapter } = adapterFor('tiktok', verifiedFor('tiktok'), () =>
      json({ postSubmissionId: 'post-9' }),
    );
    const result = await adapter.publish(
      item({ platform: 'tiktok', format: 'video' }),
      [],
      account({ platform: 'tiktok' }),
    );
    expect(result.mode).toBe('draft');
  });
});

// ── capability reporting to the operator ────────────────────────────────────

describe('UnifiedAdapter.verifyCapabilities', () => {
  const build = (capabilities: ProviderCapabilities) =>
    new UnifiedAdapter({
      platform: 'instagram',
      constraints: INSTAGRAM_CONSTRAINTS,
      capabilities,
      apiKey: 'key-123',
      fetchImpl: scriptedFetch(() => json({})).fetchImpl,
    });

  it('reports an unverified transport as pending, never as live', async () => {
    const report = await build(unverified('blotato', ['instagram'])).verifyCapabilities(account());
    expect(report.state).toBe('pending_auth');
    expect(report.nextAction).toContain('verify-provider');
  });

  it('reports draft_only when the provider was only ever seen reaching drafts', async () => {
    const report = await build(
      verifiedFor('instagram', { publishesPublicly: 'no', notes: ['Only drafts were created.'] }),
    ).verifyCapabilities(account());
    expect(report.state).toBe('draft_only');
    expect(report.detail).toContain('drafts only');
  });

  it('reports live only on a verified public post', async () => {
    const report = await build(verifiedFor('instagram')).verifyCapabilities(account());
    expect(report.state).toBe('live');
  });
});

// ── metrics ─────────────────────────────────────────────────────────────────

describe('UnifiedAdapter.collectMetrics', () => {
  const build = (respond: (url: string, calls: Recorded[]) => Response) =>
    new UnifiedAdapter({
      platform: 'instagram',
      constraints: INSTAGRAM_CONSTRAINTS,
      capabilities: verifiedFor('instagram'),
      apiKey: 'key-123',
      fetchImpl: scriptedFetch(respond).fetchImpl,
    });

  it('maps saves, which this transport does report', async () => {
    const adapter = build(() =>
      json({
        metrics: {
          impressionsCount: 1200,
          reachCount: 900,
          likesCount: 44,
          commentsCount: 3,
          sharesCount: 2,
          savesCount: 17,
          clicksCount: 8,
          followsCount: 2,
          profileVisitsCount: 30,
        },
      }),
    );
    const snapshot = await adapter.collectMetrics({ platformPostId: 'post-1' }, account());

    expect(snapshot.impressions).toBe(1200);
    expect(snapshot.likes).toBe(44);
    expect(snapshot.saves).toBe(17);
    expect(snapshot.linkClicks).toBe(8);
    expect(snapshot.follows).toBe(2);
    expect(snapshot.profileVisits).toBe(30);
  });

  it('leaves a genuinely absent metric undefined rather than zero', async () => {
    const adapter = build(() => json({ metrics: { impressionsCount: 1200, likesCount: 44 } }));
    const snapshot = await adapter.collectMetrics({ platformPostId: 'post-1' }, account());

    // A save that was never reported is not a save that never happened, and a
    // zero here would understate every post on this transport.
    expect(snapshot.saves).toBeUndefined();
    expect(snapshot.watchTimeSeconds).toBeUndefined();
    expect(snapshot.follows).toBeUndefined();
  });

  it('converts watch time from the milliseconds the API reports', async () => {
    const adapter = build(() => json({ metrics: { watchTimeMsAvg: 12_400 } }));
    const snapshot = await adapter.collectMetrics({ platformPostId: 'post-1' }, account());
    expect(snapshot.watchTimeSeconds).toBe(12);
  });

  it('accepts the platform-specific aliases the provider returns', async () => {
    const adapter = build(() =>
      json({ metrics: { repliesCount: 7, twitterRetweetsCount: 5, playsCount: 300 } }),
    );
    const snapshot = await adapter.collectMetrics({ platformPostId: 'post-1' }, account());
    expect(snapshot.comments).toBe(7);
    expect(snapshot.shares).toBe(5);
    expect(snapshot.videoViews).toBe(300);
  });

  it('falls back to the last history entry when there is no current snapshot', async () => {
    const adapter = build(() =>
      json({
        history: [
          { fetchedAt: '2026-08-09T00:00:00Z', metrics: { likesCount: 1 } },
          { fetchedAt: '2026-08-10T00:00:00Z', metrics: { likesCount: 9 } },
        ],
      }),
    );
    const snapshot = await adapter.collectMetrics({ platformPostId: 'post-1' }, account());
    expect(snapshot.likes).toBe(9);
  });

  it('treats a collection error as permanent, because retrying will not fix it', async () => {
    const adapter = build(() =>
      json({ metrics: null, lastError: 'The account revoked access to insights.' }),
    );
    await expect(
      adapter.collectMetrics({ platformPostId: 'post-1' }, account()),
    ).rejects.toMatchObject({ kind: 'permanent' });
  });

  it('treats an absent snapshot as transient, because their analytics lag', async () => {
    const adapter = build(() => json({}));
    await expect(adapter.collectMetrics({ platformPostId: 'post-1' }, account())).rejects.toMatchObject(
      { kind: 'transient' },
    );
  });
});

// ── the interface contract still holds ──────────────────────────────────────

describe('UnifiedAdapter as a PlatformAdapter', () => {
  const adapter = new UnifiedAdapter({
    platform: 'pinterest',
    constraints: PINTEREST_CONSTRAINTS,
    capabilities: unverified('blotato', ['pinterest']),
    apiKey: 'key-123',
    fetchImpl: scriptedFetch(() => json({})).fetchImpl,
  });

  it('has no reply, DM or follow surface — v1 §13, in code rather than policy', () => {
    for (const forbidden of ['reply', 'sendReply', 'sendDm', 'follow']) {
      expect(adapter).not.toHaveProperty(forbidden);
      expect(Object.getOwnPropertyNames(Object.getPrototypeOf(adapter))).not.toContain(forbidden);
    }
  });

  it('keeps the platform’s own constraints — they belong to the platform, not the transport', () => {
    expect(adapter.constraints).toBe(PINTEREST_CONSTRAINTS);
    expect(
      new UnifiedAdapter({
        platform: 'youtube',
        constraints: YOUTUBE_CONSTRAINTS,
        capabilities: unverified('blotato', ['youtube']),
        fetchImpl: scriptedFetch(() => json({})).fetchImpl,
      }).constraints.linkStrategy,
    ).toBe('description');
  });

  it('sends the operator to the provider dashboard instead of running an OAuth round trip', async () => {
    expect(adapter.getAuthUrl()).toContain('blotato.com');
    await expect(adapter.exchangeCode()).rejects.toThrow(/provider dashboard/);
  });
});
