/**
 * §210. Strategy: why this, why now, why here — and when it refuses.
 *
 * The refusals are tested first and hardest. A strategy layer that always
 * produces a plan is a queue filler, and the difference between a system that
 * decides and one that merely emits is entirely in what it declines to do.
 */
import { describe, expect, it } from 'vitest';
import {
  CONTENT_OBJECTIVES,
  decideStrategy,
  isRefusal,
  metricFor,
  type StrategyInput,
} from './decide.js';
import { analysePortfolio } from '../social/portfolio.js';
import { computeInsights, type ContentObservation } from '../learning/insights.js';

const NOW = new Date('2026-08-28T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function input(overrides: Partial<StrategyInput> = {}): StrategyInput {
  return {
    opportunity: {
      id: 'sig-1',
      summary: 'Gluten-free baking swaps are trending',
      source: 'trend',
      effectiveValue: 0.8,
    },
    account: {
      id: 'acct-1',
      platform: 'tiktok',
      capabilityState: 'live',
      lastPublishedAt: new Date(NOW.getTime() - 48 * HOUR),
    },
    now: NOW,
    ...overrides,
  };
}

describe('refusals', () => {
  it('refuses an account that cannot publish', () => {
    const r = decideStrategy(input({ account: { id: 'a', platform: 'x', capabilityState: 'pending_auth' } }));
    expect(isRefusal(r)).toBe(true);
    expect((r as { reason: string }).reason).toMatch(/cannot publish/);
  });

  it('refuses an opportunity that has decayed to nothing', () => {
    const r = decideStrategy(
      input({ opportunity: { id: 's', summary: '', source: 'trend', effectiveValue: 0 } }),
    );
    expect(isRefusal(r)).toBe(true);
    expect((r as { reason: string }).reason).toMatch(/decayed/);
  });

  it('refuses to route a platform-specific signal to another platform', () => {
    const r = decideStrategy(
      input({
        opportunity: {
          id: 's',
          summary: '',
          source: 'trend',
          effectiveValue: 0.9,
          platform: 'instagram',
        },
      }),
    );
    expect(isRefusal(r)).toBe(true);
    expect((r as { reason: string }).reason).toMatch(/instagram.*tiktok/);
  });

  it('does not refuse an account that has never published', () => {
    const r = decideStrategy(
      input({ account: { id: 'a', platform: 'tiktok', capabilityState: 'live', lastPublishedAt: null } }),
    );
    expect(isRefusal(r)).toBe(false);
  });
});

describe('spacing', () => {
  it('holds the window open rather than publishing on top of the last post', () => {
    const r = decideStrategy(
      input({
        account: {
          id: 'a',
          platform: 'tiktok',
          capabilityState: 'live',
          lastPublishedAt: new Date(NOW.getTime() - 2 * HOUR),
          minHoursBetweenPosts: 18,
        },
      }),
    );
    if (isRefusal(r)) throw new Error('expected a decision');
    expect(r.timing.earliest.getTime()).toBeGreaterThan(NOW.getTime());
    expect(r.timing.reason).toMatch(/Held to 18h/);
  });

  it('publishes as soon as it is ready when spacing is satisfied', () => {
    const r = decideStrategy(input());
    if (isRefusal(r)) throw new Error('expected a decision');
    expect(r.timing.earliest.getTime()).toBe(NOW.getTime());
    expect(r.timing.reason).toMatch(/Spacing satisfied/);
  });
});

describe('objective and measurement', () => {
  it('infers an objective from the signal source rather than defaulting', () => {
    const promo = decideStrategy(
      input({ opportunity: { id: 's', summary: '', source: 'changelog', effectiveValue: 0.9 } }),
    );
    const awareness = decideStrategy(
      input({ opportunity: { id: 's', summary: '', source: 'trend', effectiveValue: 0.9 } }),
    );
    if (isRefusal(promo) || isRefusal(awareness)) throw new Error('expected decisions');
    expect(promo.objective).toBe('product_promotion');
    expect(awareness.objective).toBe('awareness');
  });

  it('lets a caller fix the objective', () => {
    const r = decideStrategy(input({ objective: 'conversion' }));
    if (isRefusal(r)) throw new Error('expected a decision');
    expect(r.objective).toBe('conversion');
    expect(r.measurement.primaryMetric).toBe('activated_users');
  });

  it('gives every objective a metric that reflects it', () => {
    const metrics = CONTENT_OBJECTIVES.map(metricFor);
    expect(new Set(metrics).size).toBeGreaterThan(4);
    expect(metricFor('education')).toBe('completion_rate');
    expect(metricFor('traffic')).toBe('link_clicks');
  });

  it('measures on exactly one number', () => {
    const r = decideStrategy(input());
    if (isRefusal(r)) throw new Error('expected a decision');
    expect(typeof r.measurement.primaryMetric).toBe('string');
  });

  /**
   * The important one. A threshold invented before any measurement would be
   * met or missed for reasons unrelated to the content — and §204 would then
   * learn from it.
   */
  it('does not invent a success threshold with no baseline', () => {
    const r = decideStrategy(input());
    if (isRefusal(r)) throw new Error('expected a decision');
    expect(r.measurement.successThreshold).toBeNull();
    expect(r.measurement.basis).toMatch(/No account baseline/);
  });

  it('waits longer for a metric that takes longer to mean anything', () => {
    const fast = decideStrategy(input({ objective: 'awareness' }));
    const slow = decideStrategy(input({ objective: 'conversion' }));
    if (isRefusal(fast) || isRefusal(slow)) throw new Error('expected decisions');
    expect(slow.measurement.reviewAfter.getTime()).toBeGreaterThan(
      fast.measurement.reviewAfter.getTime(),
    );
  });
});

describe('treatment preference', () => {
  const observations = (winner: string, loser: string): ContentObservation[] =>
    Array.from({ length: 25 }, (_, i) => [
      {
        contentItemId: `w-${i}`,
        platform: 'tiktok',
        accountId: 'acct-1',
        publishedAt: new Date(NOW.getTime() - (30 - i) * DAY),
        features: { creative_type: winner },
        score: 0.9,
      },
      {
        contentItemId: `l-${i}`,
        platform: 'tiktok',
        accountId: 'acct-1',
        publishedAt: new Date(NOW.getTime() - (30 - i) * DAY),
        features: { creative_type: loser },
        score: 0.3,
      },
    ]).flat();

  it('prefers what performed and avoids what did not', () => {
    const insights = computeInsights(observations('feature_demo', 'before_after'), 'account');
    const r = decideStrategy(input({ insights }));
    if (isRefusal(r)) throw new Error('expected a decision');
    expect(r.preferredTreatments).toContain('feature_demo');
    expect(r.avoidTreatments).toContain('before_after');
  });

  it('avoids what the portfolio has been leaning on', () => {
    const portfolio = analysePortfolio(
      Array.from({ length: 8 }, (_, i) => ({
        contentItemId: `c-${i}`,
        publishedAt: new Date(NOW.getTime() - i * DAY),
        platform: 'tiktok',
        dimensions: { treatment: 'listicle' },
      })),
    );
    const r = decideStrategy(input({ portfolio }));
    if (isRefusal(r)) throw new Error('expected a decision');
    expect(r.avoidTreatments).toContain('listicle');
  });

  it('says plainly when it has no preference rather than inventing one', () => {
    const r = decideStrategy(input());
    if (isRefusal(r)) throw new Error('expected a decision');
    expect(r.preferredTreatments).toEqual([]);
    expect(r.rationale).toMatch(/nothing measured yet/);
  });

  it('never both prefers and avoids the same treatment', () => {
    const insights = computeInsights(observations('listicle', 'before_after'), 'account');
    const portfolio = analysePortfolio(
      Array.from({ length: 8 }, (_, i) => ({
        contentItemId: `c-${i}`,
        publishedAt: new Date(NOW.getTime() - i * DAY),
        platform: 'tiktok',
        dimensions: { treatment: 'listicle' },
      })),
    );
    const r = decideStrategy(input({ insights, portfolio }));
    if (isRefusal(r)) throw new Error('expected a decision');
    for (const t of r.preferredTreatments) expect(r.avoidTreatments).not.toContain(t);
  });
});

describe('confidence and lineage', () => {
  it('is low when the decision rested on almost nothing', () => {
    const r = decideStrategy(
      input({ account: { id: 'a', platform: 'tiktok', capabilityState: 'live', lastPublishedAt: null } }),
    );
    if (isRefusal(r)) throw new Error('expected a decision');
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('rises as real evidence accumulates', () => {
    const insights = computeInsights(
      Array.from({ length: 25 }, (_, i) => [
        {
          contentItemId: `w-${i}`,
          platform: 'tiktok',
          accountId: 'acct-1',
          publishedAt: new Date(NOW.getTime() - (30 - i) * DAY),
          features: { creative_type: 'feature_demo' },
          score: 0.9,
        },
        {
          contentItemId: `l-${i}`,
          platform: 'tiktok',
          accountId: 'acct-1',
          publishedAt: new Date(NOW.getTime() - (30 - i) * DAY),
          features: { creative_type: 'listicle' },
          score: 0.3,
        },
      ]).flat(),
      'account',
    );
    const portfolio = analysePortfolio([
      {
        contentItemId: 'c-1',
        publishedAt: new Date(NOW.getTime() - DAY),
        platform: 'tiktok',
        dimensions: { treatment: 'listicle' },
      },
    ]);
    const r = decideStrategy(input({ insights, portfolio }));
    if (isRefusal(r)) throw new Error('expected a decision');
    expect(r.confidence).toBe(1);
  });

  it('carries the lineage every input contributed', () => {
    const portfolio = analysePortfolio([
      {
        contentItemId: 'c-1',
        publishedAt: new Date(NOW.getTime() - DAY),
        platform: 'tiktok',
        dimensions: { treatment: 'how_to' },
      },
    ]);
    const r = decideStrategy(input({ portfolio }));
    if (isRefusal(r)) throw new Error('expected a decision');
    expect(r.evidence).toContain('signal:sig-1');
    expect(r.evidence.some((e) => e.startsWith('portfolio:'))).toBe(true);
  });

  it('reads as an explanation, not a label', () => {
    const r = decideStrategy(input());
    if (isRefusal(r)) throw new Error('expected a decision');
    expect(r.whyNow).toMatch(/still current|fading/);
    expect(r.rationale.length).toBeGreaterThan(40);
  });

  it('says the opportunity is fading when it nearly is', () => {
    const r = decideStrategy(
      input({ opportunity: { id: 's', summary: '', source: 'trend', effectiveValue: 0.2 } }),
    );
    if (isRefusal(r)) throw new Error('expected a decision');
    expect(r.whyNow).toMatch(/fading/);
  });
});
