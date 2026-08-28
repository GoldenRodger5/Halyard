/**
 * Adapter contract tests. Build pack §6: "contract tests against recorded
 * fixtures. Never hit live APIs in tests."
 *
 * Every request is served by a scripted fetch, so these assert the *shape* of
 * what Halyard sends — which is the part that breaks silently in production.
 */
import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PLATFORM_CLIENT_ENV,
  REVIEW_GATES,
  allAdapters,
  getAdapter,
} from './index.js';
import { composeCaption, type PublishAccount, type PublishAsset, type PublishItem } from './types.js';
import { XAdapter, X_CONSTRAINTS, estimateXCostUsd } from './x.js';
import { InstagramAdapter, assertPublicUrl, assertUniformAspectRatio } from './instagram.js';
import { PinterestAdapter, PINTEREST_METRIC_RETENTION_DAYS } from './pinterest.js';
import { YouTubeAdapter, YOUTUBE_CHUNK_BYTES } from './youtube.js';
import { TikTokAdapter } from './tiktok.js';
import { createPkcePair, needsRefresh, signState, verifyState } from './oauth.js';
import { dryRunPublish } from './dryRun.js';

// ── scripted fetch ──────────────────────────────────────────────────────────

interface Recorded {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

function scriptedFetch(
  routes: Array<{
    match: (url: string, init?: RequestInit) => boolean;
    respond: (url: string, init?: RequestInit) => Response;
  }>,
): { fetchImpl: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    let body: unknown = init?.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = Object.fromEntries(new URLSearchParams(String(init?.body)));
      }
    } else if (body instanceof URLSearchParams) {
      body = Object.fromEntries(body);
    }
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = k === 'authorization' ? '<redacted>' : v;
    });
    calls.push({ url, method: init?.method ?? 'GET', body, headers });

    const route = routes.find((r) => r.match(url, init));
    if (!route) return new Response(JSON.stringify({ error: `unrouted: ${url}` }), { status: 404 });
    return route.respond(url, init);
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function account(over: Partial<PublishAccount> = {}): PublishAccount {
  return {
    id: 'acct-1',
    platform: 'x',
    handle: '@recipefix',
    platformUserId: 'user-1',
    capabilityState: 'live',
    tokens: { accessToken: 'token-abc' },
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

function asset(over: Partial<PublishAsset> = {}): PublishAsset {
  return {
    id: 'asset-1',
    publicUrl: 'https://storage.example.com/public/card.png',
    mimeType: 'image/png',
    kind: 'image',
    width: 1080,
    height: 1080,
    ...over,
  };
}

// ── the interface contract ──────────────────────────────────────────────────

describe('PlatformAdapter contract', () => {
  it('registers every platform, including Bluesky', () => {
    expect(allAdapters().map((a) => a.platform).sort()).toEqual([
      'bluesky',
      'instagram',
      'pinterest',
      'threads',
      'tiktok',
      'x',
      'youtube',
    ]);
  });

  it('has NO reply method on any adapter — v1 §13, enforced in code not policy', () => {
    for (const adapter of allAdapters()) {
      expect(adapter).not.toHaveProperty('reply');
      expect(adapter).not.toHaveProperty('sendReply');
      expect(adapter).not.toHaveProperty('sendDm');
      expect(adapter).not.toHaveProperty('follow');
      const proto = Object.getPrototypeOf(adapter) as object;
      expect(Object.getOwnPropertyNames(proto)).not.toContain('reply');
    }
  });

  it('exposes constraints that record where the link goes and why', () => {
    for (const adapter of allAdapters()) {
      expect(adapter.constraints.linkStrategy).toBeTruthy();
      expect(adapter.constraints.linkNote.length).toBeGreaterThan(10);
    }
    expect(getAdapter('x').constraints.linkStrategy).toBe('first_reply');
    expect(getAdapter('pinterest').constraints.linkStrategy).toBe('pin_destination');
    expect(getAdapter('instagram').constraints.linkStrategy).toBe('bio_only');
    expect(getAdapter('youtube').constraints.linkStrategy).toBe('description');
    expect(getAdapter('threads').constraints.linkStrategy).toBe('in_body');
    expect(getAdapter('tiktok').constraints.linkStrategy).toBe('bio_only');
  });

  it('records which platforms gate public posting behind a review — v2 A.1', () => {
    // Of the six in the addendum, X is the only one without a gate. Bluesky was
    // added later and has none either, which is most of why it is worth having.
    const ungated = allAdapters()
      .filter((a) => !a.constraints.requiresReviewForPublicPosting)
      .map((a) => a.platform)
      .sort();
    expect(ungated).toEqual(['bluesky', 'x']);

    expect(REVIEW_GATES.x.review).toBe('None');
    expect(REVIEW_GATES.tiktok.typicalWeeks).toMatch(/rejection/i);
  });

  it('records that no platform can attach trending audio via API — v2 E.4', () => {
    for (const adapter of allAdapters()) {
      expect(adapter.constraints.supportsTrendingAudioViaApi).toBe(false);
    }
  });

  it('maps every platform to its client credential env vars', () => {
    /*
     * §173. This used to assert Instagram and Threads shared credentials, which
     * encoded the bug rather than the requirement: Meta's Threads documentation
     * says to use "the Threads app ID and its corresponding app secret", and the
     * Meta App ID fails at the provider before consent. `resolvePlatformClient`
     * still falls back to the Meta app so existing setups keep working, and says
     * when it has done so.
     */
    expect(PLATFORM_CLIENT_ENV.threads).not.toEqual(PLATFORM_CLIENT_ENV.instagram);
    /* §184. Instagram Login issues its own app id, like Threads. */
    expect(PLATFORM_CLIENT_ENV.instagram.id).toBe('INSTAGRAM_APP_ID');
    expect(PLATFORM_CLIENT_ENV.instagram).not.toEqual(PLATFORM_CLIENT_ENV.threads);
    expect(PLATFORM_CLIENT_ENV.threads.id).toBe('THREADS_APP_ID');
    expect(PLATFORM_CLIENT_ENV.youtube.id).toBe('GOOGLE_CLIENT_ID');
  });

  it('builds an auth URL carrying state for every OAuth platform', () => {
    // Bluesky is not OAuth: the operator creates an app password and pastes it,
    // so its "auth url" is the settings page and carries no state.
    for (const adapter of allAdapters().filter((a) => a.platform !== 'bluesky')) {
      const url = new URL(
        adapter.getAuthUrl('signed-state', {
          clientId: 'client-id',
          clientSecret: 'secret',
          redirectUri: 'https://halyard.test/api/oauth/x/callback',
        }),
      );
      expect(url.searchParams.get('state')).toBe('signed-state');
      expect(url.searchParams.get('redirect_uri')).toContain('halyard.test');
    }
  });
});

describe('composeCaption', () => {
  it('keeps the link out of an X post body and hands it back for the reply', () => {
    const { text, linkForReply } = composeCaption(
      item({ finalLinkUrl: 'https://recipefix.app/adapt?utm_content=abc' }),
      X_CONSTRAINTS,
    );
    expect(text).not.toContain('recipefix.app');
    expect(linkForReply).toBe('https://recipefix.app/adapt?utm_content=abc');
  });

  it('appends the AI disclosure when a label is required and the body lacks it', () => {
    const { text } = composeCaption(
      item({ requiresAiLabel: true, disclosureText: '#AIvoiceover' }),
      X_CONSTRAINTS,
    );
    expect(text).toContain('#AIvoiceover');
  });

  it('does not duplicate a disclosure already present in the body', () => {
    const { text } = composeCaption(
      item({
        body: 'Gummy crumb, fixed. #AIvoiceover',
        requiresAiLabel: true,
        disclosureText: '#AIvoiceover',
      }),
      X_CONSTRAINTS,
    );
    expect(text.match(/#AIvoiceover/g)).toHaveLength(1);
  });

  it('truncates to the platform character limit', () => {
    const { text } = composeCaption(item({ body: 'x'.repeat(400) }), X_CONSTRAINTS);
    expect(text.length).toBeLessThanOrEqual(280);
  });

  it('caps hashtags at the platform ceiling', () => {
    const { text } = composeCaption(
      item({ hashtags: ['a', 'b', 'c', 'd', 'e'] }),
      X_CONSTRAINTS,
    );
    expect(text.match(/#/g)).toHaveLength(2);
  });
});

// ── X ───────────────────────────────────────────────────────────────────────

describe('XAdapter — v2 A.2', () => {
  const adapter = new XAdapter();

  it('posts the body, then the link as a reply to it', async () => {
    let tweetCount = 0;
    const { fetchImpl, calls } = scriptedFetch([
      {
        match: (u) => u.endsWith('/2/tweets'),
        respond: () => json({ data: { id: `tweet-${++tweetCount}` } }),
      },
    ]);

    const result = await adapter.publish(
      item({ finalLinkUrl: 'https://recipefix.app/adapt?utm_content=abc' }),
      [],
      account({ meta: { fetchImpl } }),
    );

    expect(result.platformPostId).toBe('tweet-1');
    expect(result.linkReplyPostId).toBe('tweet-2');
    expect(result.permalink).toBe('https://x.com/recipefix/status/tweet-1');

    const posts = calls.filter((c) => c.url.endsWith('/2/tweets'));
    expect(posts).toHaveLength(2);
    expect((posts[0]!.body as { text: string }).text).not.toContain('http');
    expect((posts[1]!.body as { reply: { in_reply_to_tweet_id: string } }).reply.in_reply_to_tweet_id).toBe(
      'tweet-1',
    );
  });

  it('posts once when there is no link', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      { match: (u) => u.endsWith('/2/tweets'), respond: () => json({ data: { id: 'tweet-1' } }) },
    ]);
    const result = await adapter.publish(item(), [], account({ meta: { fetchImpl } }));
    expect(calls.filter((c) => c.url.endsWith('/2/tweets'))).toHaveLength(1);
    expect(result.linkReplyPostId).toBeUndefined();
  });

  it('flags a malformed response instead of retrying — that would double-post', async () => {
    const { fetchImpl } = scriptedFetch([
      { match: (u) => u.endsWith('/2/tweets'), respond: () => json({ data: {} }) },
    ]);
    const result = await adapter.publish(item(), [], account({ meta: { fetchImpl } }));
    expect(result.malformedResponse).toBe(true);
    expect(result.platformPostId).toBeUndefined();
  });

  it('classifies a 401 as an auth failure so the account queue pauses', async () => {
    const { fetchImpl } = scriptedFetch([
      { match: () => true, respond: () => json({ title: 'Unauthorized' }, 401) },
    ]);
    await expect(adapter.publish(item(), [], account({ meta: { fetchImpl } }))).rejects.toMatchObject({
      kind: 'auth',
    });
  });

  it('carries Retry-After through a 429', async () => {
    const { fetchImpl } = scriptedFetch([
      {
        match: () => true,
        respond: () =>
          new Response('{}', { status: 429, headers: { 'retry-after': '900' } }),
      },
    ]);
    await expect(adapter.publish(item(), [], account({ meta: { fetchImpl } }))).rejects.toMatchObject({
      kind: 'rate_limit',
      retryAfterSeconds: 900,
    });
  });

  it('reads only its own post metrics, at $0.001 rather than $0.005', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      {
        match: (u) => u.includes('/2/tweets/'),
        respond: () =>
          json({
            data: {
              public_metrics: { like_count: 12, reply_count: 3, retweet_count: 2 },
              non_public_metrics: { impression_count: 4200, url_link_clicks: 31 },
            },
          }),
      },
    ]);
    const metrics = await adapter.collectMetrics({ platformPostId: 't1' }, account({ meta: { fetchImpl } }));
    expect(metrics).toMatchObject({ impressions: 4200, likes: 12, comments: 3, linkClicks: 31 });
    expect(calls[0]?.url).toContain('/2/tweets/t1');
  });

  it('prices a day of posting the way v2 A.2 describes', () => {
    expect(estimateXCostUsd([{ hasLink: false }, { hasLink: true }])).toBeCloseTo(0.215);
    expect(estimateXCostUsd(Array.from({ length: 30 }, () => ({ hasLink: false })))).toBeCloseTo(0.45);
  });
});

// ── Instagram ───────────────────────────────────────────────────────────────

describe('InstagramAdapter — v2 A.3', () => {
  const adapter = new InstagramAdapter();
  const ig = () =>
    account({ platform: 'instagram', platformUserId: 'ig-user-1', capabilityState: 'live' });

  it('creates N children then a parent for a carousel, and publishes the parent', async () => {
    let childCount = 0;
    const { fetchImpl, calls } = scriptedFetch([
      {
        match: (u, init) => /\/ig-user-1\/media(\?|$)/.test(u) && init?.method === 'POST',
        respond: (_u, init) => {
          const body = Object.fromEntries(new URLSearchParams(String(init?.body)));
          return json({ id: body.media_type === 'CAROUSEL' ? 'parent-1' : `child-${++childCount}` });
        },
      },
      {
        match: (u) => u.includes('/media_publish'),
        respond: () => json({ id: 'ig-post-1' }),
      },
      { match: (u) => u.includes('fields=permalink'), respond: () => json({ permalink: 'https://instagram.com/p/abc' }) },
    ]);

    const slides = [1, 2, 3].map((n) =>
      asset({ id: `slide-${n}`, publicUrl: `https://storage.example.com/public/${n}.png`, width: 1080, height: 1350 }),
    );

    const result = await adapter.publish(
      item({ platform: 'instagram', format: 'carousel', hashtags: ['glutenfree', 'baking', 'bread'] }),
      slides,
      { ...ig(), meta: { fetchImpl } },
    );

    const containerCalls = calls.filter(
      (c) => /\/ig-user-1\/media(\?|$)/.test(c.url) && c.method === 'POST',
    );
    expect(containerCalls).toHaveLength(4); // 3 children + 1 parent
    expect((containerCalls[0]!.body as Record<string, string>).is_carousel_item).toBe('true');
    expect((containerCalls[3]!.body as Record<string, string>).children).toBe('child-1,child-2,child-3');
    expect(result.platformPostId).toBe('ig-post-1');
    expect(result.permalink).toContain('instagram.com');
  });

  it('polls the container until FINISHED before publishing a Reel', async () => {
    const statuses = ['IN_PROGRESS', 'IN_PROGRESS', 'FINISHED'];
    let pollIndex = 0;
    const { fetchImpl, calls } = scriptedFetch([
      {
        match: (u, init) => /\/ig-user-1\/media(\?|$)/.test(u) && init?.method === 'POST',
        respond: () => json({ id: 'container-1' }),
      },
      {
        match: (u) => u.includes('status_code'),
        respond: () => json({ status_code: statuses[pollIndex++] ?? 'FINISHED' }),
      },
      { match: (u) => u.includes('/media_publish'), respond: () => json({ id: 'reel-1' }) },
      { match: (u) => u.includes('fields=permalink'), respond: () => json({ permalink: 'https://instagram.com/reel/x' }) },
    ]);

    const result = await adapter.publish(
      item({ platform: 'instagram', format: 'video' }),
      [asset({ kind: 'video', mimeType: 'video/mp4', publicUrl: 'https://storage.example.com/public/reel.mp4', durationSeconds: 28 })],
      { ...ig(), meta: { fetchImpl, sleep: async () => undefined } },
    );

    expect(calls.filter((c) => c.url.includes('status_code'))).toHaveLength(3);
    expect(result.platformPostId).toBe('reel-1');
  });

  it('gives up on a container that reports ERROR rather than publishing it', async () => {
    const { fetchImpl } = scriptedFetch([
      {
        match: (u, init) => /\/ig-user-1\/media(\?|$)/.test(u) && init?.method === 'POST',
        respond: () => json({ id: 'container-1' }),
      },
      { match: (u) => u.includes('status_code'), respond: () => json({ status_code: 'ERROR', status: 'transcode failed' }) },
    ]);
    await expect(
      adapter.publish(
        item({ platform: 'instagram', format: 'video' }),
        [asset({ kind: 'video', mimeType: 'video/mp4', publicUrl: 'https://storage.example.com/public/r.mp4' })],
        { ...ig(), meta: { fetchImpl, sleep: async () => undefined } },
      ),
    ).rejects.toThrow(/ERROR/);
  });

  it('refuses a signed asset URL — Meta cURLs the media itself', () => {
    expect(() =>
      assertPublicUrl(asset({ publicUrl: 'https://storage.example.com/o/card.png?token=abc&expires=123' })),
    ).toThrow(/signed URL/);
    expect(() => assertPublicUrl(asset({ publicUrl: 'http://storage.example.com/card.png' }))).toThrow(/HTTPS/);
    expect(() => assertPublicUrl(asset())).not.toThrow();
  });

  it('refuses a carousel whose slides differ in aspect ratio', () => {
    expect(() =>
      assertUniformAspectRatio([
        asset({ width: 1080, height: 1350 }),
        asset({ width: 1080, height: 1080 }),
      ]),
    ).toThrow(/crop/i);
  });

  it('reports draft_only until Meta App Review is recorded as approved', async () => {
    const { fetchImpl } = scriptedFetch([
      { match: () => true, respond: () => json({ username: 'recipefix', account_type: 'BUSINESS' }) },
    ]);
    const pending = await adapter.verifyCapabilities({
      ...ig(),
      tokens: { accessToken: 't', scopes: ['instagram_business_content_publish'] },
      meta: { fetchImpl },
    });
    expect(pending.state).toBe('draft_only');
    expect(pending.nextAction).toMatch(/Meta App Review/);

    const live = await adapter.verifyCapabilities({
      ...ig(),
      tokens: { accessToken: 't', scopes: ['instagram_business_content_publish'] },
      meta: { fetchImpl, appReviewApproved: true },
    });
    expect(live.state).toBe('live');
  });
});

// ── Pinterest ───────────────────────────────────────────────────────────────

describe('PinterestAdapter — v2 A.5', () => {
  const adapter = new PinterestAdapter();

  it('requires a board id', async () => {
    await expect(
      adapter.publish(item({ platform: 'pinterest', format: 'pin' }), [asset()], account({ platform: 'pinterest' })),
    ).rejects.toThrow(/board_id/);
  });

  it('sends title, description, destination link and alt text as separate fields', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      { match: (u) => u.includes('/pins'), respond: () => json({ id: 'pin-1' }) },
    ]);
    await adapter.publish(
      item({
        platform: 'pinterest',
        format: 'pin',
        title: 'Gluten-free sandwich loaf',
        altText: 'A sliced gluten-free loaf on a wooden board',
        finalLinkUrl: 'https://recipefix.app/adapt?utm_content=abc',
        boardId: 'board-9',
      }),
      [asset()],
      account({ platform: 'pinterest', capabilityState: 'live', meta: { fetchImpl } }),
    );

    const body = calls[0]!.body as Record<string, unknown>;
    expect(body.board_id).toBe('board-9');
    expect(body.title).toBe('Gluten-free sandwich loaf');
    expect(body.link).toContain('utm_content=abc');
    expect(body.alt_text).toContain('wooden board');
  });

  it('writes to the sandbox host and reports draft mode until Standard access', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      { match: (u) => u.includes('/pins'), respond: () => json({ id: 'pin-2' }) },
    ]);
    const result = await adapter.publish(
      item({ platform: 'pinterest', format: 'pin', boardId: 'b1' }),
      [asset()],
      account({ platform: 'pinterest', capabilityState: 'draft_only', meta: { fetchImpl } }),
    );
    expect(calls[0]?.url).toContain('api-sandbox.pinterest.com');
    expect(result.mode).toBe('draft');
  });

  it('stamps a purge deadline on every metric snapshot', async () => {
    const { fetchImpl } = scriptedFetch([
      {
        match: (u) => u.includes('/analytics'),
        respond: () => json({ pin: { lifetime_metrics: { IMPRESSION: 900, SAVE: 12, OUTBOUND_CLICK: 7 } } }),
      },
    ]);
    const metrics = await adapter.collectMetrics(
      { platformPostId: 'pin-1' },
      account({ platform: 'pinterest', capabilityState: 'live', meta: { fetchImpl } }),
    );
    expect(metrics.impressions).toBe(900);
    expect(metrics.purgeAfter).toBeInstanceOf(Date);
    const days = (metrics.purgeAfter!.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(PINTEREST_METRIC_RETENTION_DAYS);
  });

  it('has a hashtag ceiling of zero', () => {
    expect(adapter.constraints.maxHashtags).toBe(0);
  });
});

// ── YouTube ─────────────────────────────────────────────────────────────────

describe('YouTubeAdapter — v2 A.6', () => {
  const adapter = new YouTubeAdapter();

  function uploadRoutes(videoBytes = 1024) {
    return scriptedFetch([
      {
        match: (u) => u.includes('storage.example.com'),
        respond: () => new Response(new Uint8Array(videoBytes), { status: 200 }),
      },
      {
        match: (u) => u.includes('uploadType=resumable'),
        respond: () =>
          new Response('{}', { status: 200, headers: { location: 'https://upload.example/session-1' } }),
      },
      {
        match: (u) => u.includes('session-1'),
        respond: (_u, init) => {
          // A real resumable session answers 308 until the last chunk lands.
          const range = new Headers(init?.headers).get('content-range') ?? '';
          const [, end, total] = /bytes \d+-(\d+)\/(\d+)/.exec(range) ?? [];
          if (end && total && Number(end) < Number(total) - 1) {
            return new Response(null, { status: 308 });
          }
          return json({ id: 'yt-video-1' });
        },
      },
    ]);
  }

  it('uploads as private and returns a Studio link while unaudited', async () => {
    const { fetchImpl, calls } = uploadRoutes();
    const result = await adapter.publish(
      item({ platform: 'youtube', format: 'video', title: 'Why gluten-free bread is gummy' }),
      [
        asset({
          kind: 'video',
          mimeType: 'video/mp4',
          publicUrl: 'https://storage.example.com/public/short.mp4',
          width: 1080,
          height: 1920,
          durationSeconds: 42,
        }),
      ],
      account({ platform: 'youtube', capabilityState: 'draft_only', meta: { fetchImpl } }),
    );

    const initiate = calls.find((c) => c.url.includes('uploadType=resumable'))!;
    const body = initiate.body as { status: { privacyStatus: string }; snippet: { title: string } };
    expect(body.status.privacyStatus).toBe('private');
    expect(body.snippet.title).toContain('#Shorts');
    /*
     * §156. `private`, not `draft`. This assertion used to read `draft`, which
     * is what the adapter returned and what made the queue tell an operator to
     * go and finish a video that needed no finishing. A private YouTube upload
     * is real content Halyard can still publish over the API; a draft is
     * something only a person can complete inside the platform's own app.
     */
    expect(result.mode).toBe('private');
    expect(result.manualPublishUrl).toContain('studio.youtube.com');
  });

  it('uploads as public once the compliance audit is recorded', async () => {
    const { fetchImpl, calls } = uploadRoutes();
    const result = await adapter.publish(
      item({ platform: 'youtube', format: 'video', title: 'Chef notes' }),
      [asset({ kind: 'video', mimeType: 'video/mp4', publicUrl: 'https://storage.example.com/public/v.mp4', width: 1920, height: 1080, durationSeconds: 45 })],
      {
        ...account({ platform: 'youtube', capabilityState: 'live' }),
        meta: { fetchImpl, complianceAuditPassed: true },
      },
    );
    const body = calls.find((c) => c.url.includes('uploadType=resumable'))!.body as {
      status: { privacyStatus: string };
      snippet: { title: string };
    };
    expect(body.status.privacyStatus).toBe('public');
    // 16:9 is not a Short, so no tag is forced.
    expect(body.snippet.title).not.toContain('#Shorts');
    expect(result.mode).toBe('direct');
  });

  it('uploads in chunks that are multiples of 256 KB', async () => {
    expect(YOUTUBE_CHUNK_BYTES % (256 * 1024)).toBe(0);
    const { fetchImpl, calls } = uploadRoutes(YOUTUBE_CHUNK_BYTES * 2 + 10);
    await adapter.publish(
      item({ platform: 'youtube', format: 'video' }),
      [asset({ kind: 'video', mimeType: 'video/mp4', publicUrl: 'https://storage.example.com/public/big.mp4', durationSeconds: 40 })],
      account({ platform: 'youtube', meta: { fetchImpl } }),
    );
    const chunks = calls.filter((c) => c.url.includes('session-1'));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.headers['content-range']).toMatch(/^bytes 0-/);
  });

  it('declares synthetic media when a label is required', async () => {
    const { fetchImpl, calls } = uploadRoutes();
    await adapter.publish(
      item({
        platform: 'youtube',
        format: 'video',
        requiresAiLabel: true,
        disclosureText: '#AIvoiceover',
      }),
      [asset({ kind: 'video', mimeType: 'video/mp4', publicUrl: 'https://storage.example.com/public/v.mp4', durationSeconds: 30 })],
      account({ platform: 'youtube', meta: { fetchImpl } }),
    );
    const body = calls.find((c) => c.url.includes('uploadType=resumable'))!.body as {
      status: Record<string, unknown>;
      snippet: { description: string };
    };
    expect(body.status.containsSyntheticMedia).toBe(true);
    expect(body.snippet.description).toContain('#AIvoiceover');
  });
});

// ── TikTok ──────────────────────────────────────────────────────────────────

describe('TikTokAdapter — Direct Post, §179', () => {
  const adapter = new TikTokAdapter();

  /** A completed panel: what a creator actually chose, plus their consent. */
  const chosen = {
    privacyLevel: 'MUTUAL_FOLLOW_FRIENDS',
    allowComment: true,
    allowDuet: false,
    allowStitch: false,
    commercialContent: false,
    brandOrganic: false,
    brandedContent: false,
    musicConfirmedAt: '2026-08-28T05:00:00.000Z',
    creatorInfoFetchedAt: '2026-08-28T05:00:00.000Z',
  };

  const video = () =>
    asset({
      kind: 'video',
      mimeType: 'video/mp4',
      publicUrl: 'https://halyard-ten.vercel.app/r/asset-1.mp4',
      durationSeconds: 28,
    });

  it('sends exactly the settings the creator chose', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      { match: (u) => u.includes('/post/publish/video/init/'), respond: () => json({ data: { publish_id: 'pub-1' } }) },
    ]);
    const result = await adapter.publish(
      item({ platform: 'tiktok', format: 'video', tiktokOptions: chosen }),
      [video()],
      account({ platform: 'tiktok', capabilityState: 'live', meta: { fetchImpl } }),
    );

    expect(calls[0]?.url).toContain('/post/publish/video/init/');
    const post = (calls[0]!.body as { post_info: Record<string, unknown> }).post_info;
    expect(post.privacy_level).toBe('MUTUAL_FOLLOW_FRIENDS');
    /* Halyard's "allow" is TikTok's "disable"; getting this backwards would
       publish the opposite of what the creator asked for. */
    expect(post.disable_comment).toBe(false);
    expect(post.disable_duet).toBe(true);
    expect(post.disable_stitch).toBe(true);
    expect(result.mode).toBe('direct');
    expect(result.platformPostId).toBe('pub-1');
  });

  it('pulls the video from a URL rather than uploading bytes', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      { match: (u) => u.includes('/post/publish/video/init/'), respond: () => json({ data: { publish_id: 'p' } }) },
    ]);
    await adapter.publish(
      item({ platform: 'tiktok', format: 'video', tiktokOptions: chosen }),
      [video()],
      account({ platform: 'tiktok', capabilityState: 'live', meta: { fetchImpl } }),
    );
    const source = (calls[0]!.body as { source_info: Record<string, unknown> }).source_info;
    expect(source.source).toBe('PULL_FROM_URL');
    expect(String(source.video_url)).toMatch(/^https:\/\//);
  });

  it('refuses to post when the creator never completed the panel', async () => {
    /*
     * The heart of §179. This used to send PUBLIC_TO_EVERYONE with comments,
     * Duet and Stitch all on — a silent default on the one decision TikTok
     * requires a human to make.
     */
    const { fetchImpl, calls } = scriptedFetch([
      { match: () => true, respond: () => json({ data: { publish_id: 'should-not-happen' } }) },
    ]);
    await expect(
      adapter.publish(
        item({ platform: 'tiktok', format: 'video' }),
        [video()],
        account({ platform: 'tiktok', capabilityState: 'live', meta: { fetchImpl } }),
      ),
    ).rejects.toThrow(/complete the TikTok panel/i);
    expect(calls).toHaveLength(0);
  });

  it('refuses without a chosen visibility, and without music confirmation', async () => {
    const { fetchImpl, calls } = scriptedFetch([{ match: () => true, respond: () => json({}) }]);
    const attempt = (options: Record<string, unknown>) =>
      adapter.publish(
        item({ platform: 'tiktok', format: 'video', tiktokOptions: options as never }),
        [video()],
        account({ platform: 'tiktok', capabilityState: 'live', meta: { fetchImpl } }),
      );

    await expect(attempt({ ...chosen, privacyLevel: null })).rejects.toThrow(/will not pick one/i);
    await expect(attempt({ ...chosen, musicConfirmedAt: null })).rejects.toThrow(/Music Usage/i);
    expect(calls).toHaveLength(0);
  });

  it('reports live only when the token carries video.publish and TikTok offers public', async () => {
    const { fetchImpl } = scriptedFetch([
      {
        match: (u) => u.includes('creator_info'),
        respond: () =>
          json({
            data: {
              creator_nickname: 'RecipeFix',
              creator_username: 'recipefix',
              privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
              max_video_post_duration_sec: 600,
            },
          }),
      },
    ]);
    const base = account({ platform: 'tiktok' });
    const report = await adapter.verifyCapabilities({
      ...base,
      tokens: { ...base.tokens, scopes: ['user.info.profile', 'video.publish'] },
      meta: { fetchImpl },
    });
    expect(report.state).toBe('live');
  });

  it('stays draft_only while the app is unaudited, and says why', async () => {
    /*
     * `privacy_level_options` is where app approval becomes observable: an
     * unaudited client is offered SELF_ONLY only. Asking the creator beats
     * tracking a flag Halyard set about itself.
     */
    const { fetchImpl } = scriptedFetch([
      {
        match: (u) => u.includes('creator_info'),
        respond: () =>
          json({ data: { creator_nickname: 'RecipeFix', creator_username: 'recipefix', privacy_level_options: ['SELF_ONLY'] } }),
      },
    ]);
    const base = account({ platform: 'tiktok' });
    const report = await adapter.verifyCapabilities({
      ...base,
      tokens: { ...base.tokens, scopes: ['video.publish'] },
      meta: { fetchImpl },
    });
    expect(report.state).toBe('draft_only');
    expect(report.detail).toMatch(/SELF_ONLY/i);
  });

  it('stays draft_only when the token never received video.publish', async () => {
    const { fetchImpl } = scriptedFetch([
      {
        match: (u) => u.includes('creator_info'),
        respond: () =>
          json({ data: { creator_nickname: 'RecipeFix', privacy_level_options: ['PUBLIC_TO_EVERYONE'] } }),
      },
    ]);
    const base = account({ platform: 'tiktok' });
    const report = await adapter.verifyCapabilities({
      ...base,
      tokens: { ...base.tokens, scopes: ['user.info.profile'] },
      meta: { fetchImpl },
    });
    expect(report.state).toBe('draft_only');
    expect(report.detail).toMatch(/video\.publish/);
  });
});

// ── OAuth plumbing ──────────────────────────────────────────────────────────

describe('dryRunPublish', () => {
  it('reports a rehearsal that built a request as a rehearsal', async () => {
    const result = await dryRunPublish(getAdapter('x'), item(), [], account());
    expect(result.failed).toBe(false);
    expect(result.requests.length).toBeGreaterThan(0);
  });

  it('reports a rehearsal that never reached the platform as failed, not as done', async () => {
    // Instagram refuses without a discovered IG user id. The old shape returned
    // prose only, and the caller rendered it with a tick — the same failure the
    // QC gates had, where never-verified read as passed.
    const result = await dryRunPublish(
      getAdapter('instagram'),
      item({ platform: 'instagram', format: 'image' }),
      [asset()],
      account({ platform: 'instagram', platformUserId: null, meta: {} }),
    );
    expect(result.failed).toBe(true);
    expect(result.error).toBeTruthy();
  });
});

describe('OAuth state and PKCE', () => {
  const secret = randomBytes(32).toString('base64');

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = secret;
  });

  it('round-trips a signed state envelope', () => {
    const state = signState({ productId: 'recipefix', platform: 'x', persona: 'brand' });
    const payload = verifyState(state);
    expect(payload).toMatchObject({ productId: 'recipefix', platform: 'x', persona: 'brand' });
  });

  it('rejects a tampered state', () => {
    const state = signState({ productId: 'recipefix', platform: 'x', persona: 'brand' });
    const [body] = state.split('.');
    expect(() => verifyState(`${body}.forged`)).toThrow(/signature/);
  });

  it('rejects a state signed with a different key', () => {
    const state = signState({ productId: 'recipefix', platform: 'x', persona: 'brand' }, secret);
    expect(() => verifyState(state, randomBytes(32).toString('base64'))).toThrow(/signature/);
  });

  it('produces a valid S256 PKCE pair', () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toBe(verifier);
  });

  it('flags a token for refresh an hour before expiry', () => {
    expect(needsRefresh(new Date(Date.now() + 30 * 60_000))).toBe(true);
    expect(needsRefresh(new Date(Date.now() + 5 * 3_600_000))).toBe(false);
    expect(needsRefresh(null)).toBe(false);
  });
});


/**
 * Instagram capability verification, against the shape Meta actually accepts.
 *
 * Found live on 2026-08-19: `verifyCapabilities` requested `account_type`, which
 * is not a field on the Instagram *Business* node reached through Facebook
 * Login. Meta rejected the entire call with `(#100) Tried accessing nonexisting
 * field`, so a correctly connected account reported `pending_auth`. The value
 * was never read — it was dead in the request and fatal to it.
 */
describe('instagram verifyCapabilities requests only valid fields', () => {
  function account(scopes: string[], capture: { url?: string }) {
    return {
      id: 'a', platform: 'instagram' as const, handle: '@recipe.fix',
      platformUserId: '178414', capabilityState: 'live' as const,
      tokens: { accessToken: 't', refreshToken: null, scopes },
      meta: {
        igUserId: '178414',
        fetchImpl: async (url: string) => {
          capture.url = String(url);
          return {
            ok: true, status: 200,
            json: async () => ({ username: 'recipe.fix', media_count: 3 }),
            text: async () => '{}',
          } as never;
        },
      },
    } as never;
  }

  it('never asks Meta for account_type', async () => {
    const capture: { url?: string } = {};
    const adapter = getAdapter('instagram');
    await adapter.verifyCapabilities(account(['instagram_content_publish'], capture));

    expect(capture.url).toBeDefined();
    // The exact field that made Meta reject the whole request.
    expect(capture.url!).not.toContain('account_type');
    expect(capture.url!).toContain('username');
  });

  it('still refuses to claim publishing when the publish scope is absent', async () => {
    // The safety gate stays: no scope, no claim. Unchanged by the field fix.
    const capture: { url?: string } = {};
    const adapter = getAdapter('instagram');
    const report = await adapter.verifyCapabilities(account([], capture));
    expect(report.state).toBe('pending_auth');
    expect(report.supportedFormats).toEqual([]);
  });
});


/**
 * Meta grants: requested is not granted.
 *
 * Meta's token response carries no `scope` field, so before this the account
 * persisted an empty list and the publish gate reported a granted permission as
 * refused. `/me/permissions` is the evidence, and only `granted` counts.
 */
describe('instagram granted permissions, §184', () => {
  const adapter = getAdapter('instagram');

  /*
   * Instagram Login returns the granted scopes on the code exchange itself, so
   * the separate /me/permissions round trip the Facebook flow needed is gone.
   * The property being protected is unchanged: what is persisted is what the
   * user *granted*, not what Halyard asked for.
   */
  function exchange(shortBody: Record<string, unknown>, longBody: Record<string, unknown> = { access_token: 'long', expires_in: 5184000 }) {
    const { fetchImpl, calls } = scriptedFetch([
      { match: (u) => u.includes('api.instagram.com/oauth/access_token'), respond: () => json(shortBody) },
      { match: (u) => u.includes('ig_exchange_token'), respond: () => json(longBody) },
    ]);
    return {
      calls,
      run: () =>
        adapter.exchangeCode('code-1', {
          clientId: 'ig-app-id',
          clientSecret: 'ig-app-secret',
          redirectUri: 'https://halyard-ten.vercel.app/api/oauth/instagram/callback',
          fetchImpl,
        }),
    };
  }

  it('persists the permissions Instagram reports as granted', async () => {
    const tokens = await exchange({
      access_token: 'short',
      user_id: 17841400000000000,
      permissions: 'instagram_business_basic,instagram_business_content_publish',
    }).run();
    expect(tokens.scopes).toContain('instagram_business_content_publish');
    expect(tokens.accessToken).toBe('long');
  });

  it('accepts the array form as well as the comma-separated one', async () => {
    const tokens = await exchange({
      access_token: 'short',
      user_id: '1',
      permissions: ['instagram_business_basic', 'instagram_business_manage_comments'],
    }).run();
    expect(tokens.scopes).toHaveLength(2);
  });

  it('records nothing when Instagram reports no permissions', async () => {
    /*
     * Empty means "no evidence", which the publish gate refuses on. Filling in
     * the requested list here would defeat it.
     */
    const tokens = await exchange({ access_token: 'short', user_id: '1' }).run();
    expect(tokens.scopes).toEqual([]);
  });

  it('carries the granted scopes across the long-lived upgrade', async () => {
    /* §180's bug, in the flow next door: the upgrade response has no scope. */
    const tokens = await exchange(
      { access_token: 'short', user_id: '1', permissions: 'instagram_business_basic' },
      { access_token: 'long', expires_in: 5184000 },
    ).run();
    expect(tokens.scopes).toEqual(['instagram_business_basic']);
  });

  it('keeps the Instagram user id the exchange returned', async () => {
    const tokens = await exchange({ access_token: 'short', user_id: 17841400000000000, permissions: '' }).run();
    expect(tokens.meta?.instagramUserId).toBe('17841400000000000');
  });

  it('authorises against instagram.com, never facebook.com', async () => {
    const url = adapter.getAuthUrl('state-1', {
      clientId: 'ig-app-id',
      clientSecret: 's',
      redirectUri: 'https://halyard-ten.vercel.app/api/oauth/instagram/callback',
      scopes: ['instagram_business_basic'],
    });
    expect(url).toContain('https://www.instagram.com/oauth/authorize');
    expect(url).not.toContain('facebook.com');
  });

  it('exchanges the code at api.instagram.com, not graph.facebook.com', async () => {
    const { calls, run } = exchange({ access_token: 'short', user_id: '1', permissions: '' });
    await run();
    expect(calls[0]!.url).toContain('api.instagram.com/oauth/access_token');
    expect(calls.every((c) => !c.url.includes('facebook.com'))).toBe(true);
  });
});

describe('ThreadsAdapter — token exchange, §180', () => {
  const adapter = getAdapter('threads');

  it('keeps the scopes the short-lived exchange returned', async () => {
    /*
     * Threads returns `scope` on the code exchange and omits it from the
     * long-lived upgrade. Reading only the upgrade stored `scopes: []` for a
     * fully authorised account, which is indistinguishable from granted nothing.
     */
    const { fetchImpl } = scriptedFetch([
      {
        match: (u) => u.includes('graph.threads.net/oauth/access_token'),
        respond: () =>
          json({
            access_token: 'short-token',
            user_id: '17841400000000000',
            scope: 'threads_basic,threads_content_publish,threads_manage_replies',
          }),
      },
      {
        match: (u) => u.includes('th_exchange_token'),
        respond: () => json({ access_token: 'long-token', expires_in: 5184000 }),
      },
    ]);

    const tokens = await adapter.exchangeCode('code-1', {
      clientId: 'threads-app-id',
      clientSecret: 'threads-secret',
      redirectUri: 'https://halyard-ten.vercel.app/api/oauth/threads/callback',
      fetchImpl,
    });

    expect(tokens.accessToken).toBe('long-token');
    expect(tokens.scopes).toContain('threads_content_publish');
    expect(tokens.scopes).toHaveLength(3);
    expect(tokens.meta?.threadsUserId).toBe('17841400000000000');
  });

  it('prefers the long-lived scopes when Threads does return them', async () => {
    const { fetchImpl } = scriptedFetch([
      {
        match: (u) => u.includes('graph.threads.net/oauth/access_token'),
        respond: () => json({ access_token: 's', user_id: '1', scope: 'threads_basic' }),
      },
      {
        match: (u) => u.includes('th_exchange_token'),
        respond: () => json({ access_token: 'l', scope: 'threads_basic,threads_content_publish' }),
      },
    ]);
    const tokens = await adapter.exchangeCode('c', {
      clientId: 'a',
      clientSecret: 'b',
      redirectUri: 'https://halyard-ten.vercel.app/api/oauth/threads/callback',
      fetchImpl,
    });
    expect(tokens.scopes).toHaveLength(2);
  });
});
