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
  MIN_POSTS_PER_SLOT,
  canMakeClaim,
  describeFunnel,
  describeSlotConfidence,
  describeWhatIsNotMeasurable,
} from './coldStart.js';
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

  it('distinguishes "no data" from "enough data, nothing stands out"', () => {
    // Telling somebody to keep collecting evidence they already have is a
    // different mistake from telling them they have none, and it sends them
    // the wrong way.
    const out = findOpportunities({
      byCategory: [
        { category: 'transformation', posts: 24, activatedPer1k: 5.0 },
        { category: 'community', posts: 22, activatedPer1k: 4.6 },
      ],
      byPlatform: [],
    });
    expect(out[0]).toMatch(/Nothing stands out yet/);
    expect(out[0]).not.toMatch(/Not enough data/);
    expect(out[0]).toMatch(/not the lever/);
  });

  it('says how far off the threshold is when it genuinely is short', () => {
    const out = findOpportunities({
      byCategory: [{ category: 'transformation', posts: 3, activatedPer1k: 9 }],
      byPlatform: [],
    });
    expect(out[0]).toMatch(/the busiest has 3/);
  });
});

describe('cold start — milestone 51', () => {
  it('calls an untouched slot window a default, not a measurement', () => {
    const readout = describeSlotConfidence(0);
    expect(readout.provenance).toBe('default');
    expect(readout.detail).toContain('not a measurement');
  });

  it('keeps calling it a default while it is still learning', () => {
    const readout = describeSlotConfidence(4);
    expect(readout.provenance).toBe('learning');
    expect(readout.label).toContain('default');
    expect(readout.detail).toContain('4 of about 12');
  });

  it('only calls it measured once there is enough behind it', () => {
    expect(describeSlotConfidence(MIN_POSTS_PER_SLOT).provenance).toBe('measured');
  });

  it('suppresses funnel rates when nothing has published', () => {
    const honesty = describeFunnel({ impressions: 0, clicks: 0, signups: 0, activated: 0 }, 0);
    expect(honesty.empty).toBe(true);
    expect(honesty.suppressRates).toBe(true);
    // The distinction that matters: absent, not low.
    expect(honesty.message).toContain('absent');
  });

  it('separates "published but no metrics yet" from "published and ignored"', () => {
    const honesty = describeFunnel({ impressions: 0, clicks: 0, signups: 0, activated: 0 }, 6);
    expect(honesty.empty).toBe(true);
    expect(honesty.message).toContain('delay');
  });

  it('holds back a conversion rate that would divide by an empty stage', () => {
    const honesty = describeFunnel({ impressions: 5000, clicks: 0, signups: 0, activated: 0 }, 6);
    expect(honesty.empty).toBe(false);
    expect(honesty.suppressRates).toBe(true);
  });

  it('shows rates once both halves exist', () => {
    const honesty = describeFunnel({ impressions: 5000, clicks: 90, signups: 20, activated: 8 }, 6);
    expect(honesty.suppressRates).toBe(false);
    expect(honesty.message).toBe('');
  });

  it('names activation as the missing half when clicks arrive but nothing converts', () => {
    const honesty = describeFunnel({ impressions: 5000, clicks: 90, signups: 0, activated: 0 }, 6);
    expect(honesty.message).toContain('utm_content');
  });

  it('says everything is a starting position when nothing has published', () => {
    const lines = describeWhatIsNotMeasurable({
      publishedPosts: 0,
      daysSinceFirstPost: null,
      platformsWithPosts: 0,
      categoriesAtThreshold: 0,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('starting position');
  });

  it('names each thing that is not yet separable from noise', () => {
    const lines = describeWhatIsNotMeasurable({
      publishedPosts: 8,
      daysSinceFirstPost: 5,
      platformsWithPosts: 1,
      categoriesAtThreshold: 1,
    }).join(' ');
    expect(lines).toContain('8 posts published over 5 days');
    expect(lines).toContain('Conversion by category');
    expect(lines).toContain('Only one platform');
    expect(lines).toContain('separable from noise');
  });

  it('stops explaining once there is enough to go on', () => {
    const lines = describeWhatIsNotMeasurable({
      publishedPosts: 200,
      daysSinceFirstPost: 90,
      platformsWithPosts: 5,
      categoriesAtThreshold: 4,
    });
    expect(lines).toHaveLength(1);
  });

  it('refuses a claim when either side is short, and says by how much', () => {
    const verdict = canMakeClaim(3, 40, 20);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('there are 3 and 40');
    expect(canMakeClaim(40, 40, 20).allowed).toBe(true);
  });
});
