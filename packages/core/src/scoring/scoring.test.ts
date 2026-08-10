import { describe, expect, it, vi } from 'vitest';
import {
  ACTIVATION_DEFINITION,
  attributionReadiness,
  buildAttributionQuery,
  fetchAttribution,
  readUtmContent,
  stampUtm,
} from './attribution.js';
import {
  ENGAGEMENT_WEIGHTS,
  LOW_CONFIDENCE_IMPRESSIONS,
  SCORE_WEIGHTS,
  engagementRate,
  rawEngagementRate,
  findOpportunities,
  percentileRank,
  repostEligibleAt,
  scorePosts,
} from './performance.js';

describe('UTM stamping — v1 §9', () => {
  it('uses the content item UUID as utm_content, the join key', () => {
    const url = stampUtm('https://recipefix.app/adapt', {
      platform: 'instagram',
      category: 'transformation',
      contentItemId: 'a3f9c0de-0000-4000-8000-000000000001',
    });
    const params = new URL(url).searchParams;
    expect(params.get('utm_source')).toBe('instagram');
    expect(params.get('utm_medium')).toBe('social');
    expect(params.get('utm_campaign')).toBe('transformation');
    expect(params.get('utm_content')).toBe('a3f9c0de-0000-4000-8000-000000000001');
  });

  it('preserves existing query parameters', () => {
    const url = stampUtm('https://recipefix.app/adapt?ref=launch', {
      platform: 'x',
      category: 'education',
      contentItemId: 'id-1',
    });
    expect(new URL(url).searchParams.get('ref')).toBe('launch');
  });

  it('adds the series as utm_term when the post belongs to one', () => {
    const url = stampUtm('https://recipefix.app', {
      platform: 'x',
      category: 'transformation',
      contentItemId: 'id-1',
      seriesName: 'Fix This Recipe',
    });
    expect(new URL(url).searchParams.get('utm_term')).toBe('fix-this-recipe');
  });

  it('reads utm_content back out, and tolerates rubbish', () => {
    expect(readUtmContent('https://x.test/?utm_content=abc')).toBe('abc');
    expect(readUtmContent('not a url')).toBeNull();
  });

  it('versions the activation definition with the code', () => {
    expect(ACTIVATION_DEFINITION).toContain('Cook Mode');
    expect(buildAttributionQuery('2026-08-01')).toContain('$initial_utm_content');
  });

  it('parses a PostHog result set', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ results: [['item-1', 120, 14, 9, 6, 4, 1]] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const rows = await fetchAttribution(
      { host: 'https://us.i.posthog.com', projectId: '1', apiKey: 'k', fetchImpl },
      '2026-08-01T00:00:00Z',
    );
    expect(rows[0]).toMatchObject({ contentItemId: 'item-1', sessions: 120, signups: 14 });
    expect(rows[0]?.activatedUsers).toBe(9);
  });
});

describe('attribution readiness — the honest empty state', () => {
  it('says PostHog is not configured', () => {
    const r = attributionReadiness({ postsWithStampedLinks: 5, attributionRowsSeen: 0, postHogConfigured: false });
    expect(r.ready).toBe(false);
    expect(r.message).toContain('POSTHOG_PROJECT_API_KEY');
  });

  it('names the likely cause when links are stamped but nothing comes back', () => {
    const r = attributionReadiness({ postsWithStampedLinks: 12, attributionRowsSeen: 0, postHogConfigured: true });
    expect(r.ready).toBe(false);
    expect(r.message).toMatch(/does not capture UTM/);
  });

  it('is ready once rows arrive', () => {
    expect(
      attributionReadiness({ postsWithStampedLinks: 12, attributionRowsSeen: 9, postHogConfigured: true }).ready,
    ).toBe(true);
  });
});

describe('performance scoring — v1 §9', () => {
  it('weights conversion at 0.60', () => {
    expect(SCORE_WEIGHTS.conversion).toBe(0.6);
    expect(SCORE_WEIGHTS.reach + SCORE_WEIGHTS.engagement + SCORE_WEIGHTS.conversion).toBeCloseTo(1);
  });

  it('ranks a low-reach, high-conversion post above a viral one that converted nothing', () => {
    const [viral, converter] = scorePosts([
      { contentItemId: 'viral', impressions: 90_000, likes: 4000, activatedUsers: 2 },
      { contentItemId: 'converter', impressions: 3000, likes: 60, activatedUsers: 41 },
    ]);
    expect(converter!.score).toBeGreaterThan(viral!.score);
  });

  it('flags low confidence below 1,000 impressions', () => {
    const [score] = scorePosts([{ contentItemId: 'a', impressions: 400, likes: 20, activatedUsers: 1 }]);
    expect(score!.lowConfidence).toBe(true);
    expect(LOW_CONFIDENCE_IMPRESSIONS).toBe(1000);
  });

  it('redistributes the weights and says so when no attribution exists', () => {
    const [score] = scorePosts([{ contentItemId: 'a', impressions: 5000, likes: 200 }]);
    expect(score!.notes).toMatch(/No attribution data/);
    expect(score!.conversionScore).toBe(0.5);
  });

  it('computes engagement as a rate, not a count', () => {
    // 40 likes at weight 1, 10 saves at weight 2.5 → 65 weighted over 1,000.
    expect(engagementRate({ contentItemId: 'a', impressions: 1000, likes: 40, saves: 10 })).toBeCloseTo(0.065);
    expect(engagementRate({ contentItemId: 'a', impressions: 0, likes: 40 })).toBe(0);
  });

  it('weights a save above a like — Part D', () => {
    expect(ENGAGEMENT_WEIGHTS.save).toBeGreaterThan(ENGAGEMENT_WEIGHTS.like * 2);
    expect(ENGAGEMENT_WEIGHTS.follow).toBeGreaterThan(ENGAGEMENT_WEIGHTS.save);

    const saver = { contentItemId: 'saver', impressions: 1000, likes: 10, saves: 40 };
    const liker = { contentItemId: 'liker', impressions: 1000, likes: 40, saves: 10 };
    expect(engagementRate(saver)).toBeGreaterThan(engagementRate(liker));
    // Unweighted, the two are identical — which is the point.
    expect(rawEngagementRate(saver)).toBeCloseTo(rawEngagementRate(liker));
  });

  it('gives a single post a neutral percentile rather than a perfect one', () => {
    expect(percentileRank(5, [5])).toBe(0.5);
    expect(percentileRank(10, [1, 2, 3])).toBe(1);
  });

  it('lets a strong post come back sooner — v2 I.6', () => {
    const published = new Date('2026-06-01T00:00:00Z');
    const strong = repostEligibleAt(published, 0.9);
    const weak = repostEligibleAt(published, 0.3);
    expect((strong.getTime() - published.getTime()) / 86_400_000).toBe(45);
    expect((weak.getTime() - published.getTime()) / 86_400_000).toBe(90);
  });
});

describe('opportunities panel — v1 §8', () => {
  it('refuses to make a claim below the volume threshold', () => {
    const out = findOpportunities({
      byCategory: [{ category: 'transformation', posts: 3, activatedPer1k: 9 }],
      byPlatform: [],
    });
    expect(out[0]).toMatch(/Not enough data/);
  });

  it('states a ratio once there is volume', () => {
    const out = findOpportunities({
      byCategory: [
        { category: 'transformation', posts: 24, activatedPer1k: 8.1 },
        { category: 'community', posts: 22, activatedPer1k: 3.0 },
      ],
      byPlatform: [
        { platform: 'pinterest', posts: 30, activatedPer1k: 9.3, linkClicks: 300 },
        { platform: 'x', posts: 60, activatedPer1k: 3.0, linkClicks: 120 },
      ],
    });
    expect(out.join(' ')).toMatch(/transformation converted 2\.7× better than community/);
    expect(out.join(' ')).toMatch(/pinterest link clicks convert at 3\.1×/);
  });
});
