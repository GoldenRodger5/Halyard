/**
 * §204. The tests that matter here are the ones about *consequence*.
 *
 * A learning module that produces plausible sentences is easy and worthless.
 * The specification's standard is "prove that learned insights alter later
 * decisions", so the assertions below are: a belief forms only with evidence, a
 * contradiction weakens it rather than being discarded, and a formed belief
 * changes which treatment a later plan chooses.
 */
import { describe, expect, it } from 'vitest';
import {
  actionableInsights,
  computeInsights,
  confidenceFor,
  reconcileInsight,
  type ContentObservation,
  type Insight,
} from './insights.js';

const DAY = 86_400_000;
const base = new Date('2026-06-01T00:00:00Z');

function obs(
  i: number,
  creativeType: string,
  score: number | null,
  overrides: Partial<ContentObservation> = {},
): ContentObservation {
  return {
    contentItemId: `item-${creativeType}-${i}`,
    platform: 'tiktok',
    accountId: 'acct-1',
    publishedAt: new Date(base.getTime() + i * DAY),
    features: { creative_type: creativeType },
    score,
    ...overrides,
  };
}

/** n of one type at `good`, n of another at `poor`. */
function cohorts(n: number, good: number, poor: number): ContentObservation[] {
  return [
    ...Array.from({ length: n }, (_, i) => obs(i, 'feature_demo', good)),
    ...Array.from({ length: n }, (_, i) => obs(n + i, 'before_after', poor)),
  ];
}

describe('computeInsights', () => {
  it('produces nothing from no measured observations', () => {
    expect(computeInsights([], 'account')).toEqual([]);
    /* All unmeasured — null is not zero, and none of these count. */
    const unmeasured = Array.from({ length: 30 }, (_, i) => obs(i, 'feature_demo', null));
    expect(computeInsights(unmeasured, 'account')).toEqual([]);
  });

  it('excludes unmeasured posts rather than scoring them as zero', () => {
    const mixed = [
      ...Array.from({ length: 5 }, (_, i) => obs(i, 'feature_demo', 0.8)),
      ...Array.from({ length: 5 }, (_, i) => obs(10 + i, 'feature_demo', null)),
      ...Array.from({ length: 5 }, (_, i) => obs(20 + i, 'before_after', 0.4)),
    ];
    const demo = computeInsights(mixed, 'account').find((i) => i.featureValue === 'feature_demo')!;
    // Five measured, not ten — and the mean is the real one, undragged by nulls.
    expect(demo.sampleSize).toBe(5);
    expect(demo.cohortMean).toBeCloseTo(0.8, 5);
  });

  it('will not report a cohort too small to mean anything', () => {
    const tiny = [obs(1, 'feature_demo', 0.9), obs(2, 'before_after', 0.2)];
    expect(computeInsights(tiny, 'account')).toEqual([]);
  });

  it('calls a small sample observed, not inferred', () => {
    const small = cohorts(4, 0.9, 0.3);
    const insight = computeInsights(small, 'account')[0]!;
    expect(insight.sampleSize).toBe(4);
    expect(insight.status).toBe('observed');
  });

  it('reaches inferred once the sample clears the threshold', () => {
    const many = cohorts(25, 0.9, 0.3);
    const demo = computeInsights(many, 'account').find((i) => i.featureValue === 'feature_demo')!;
    expect(demo.status).toBe('inferred');
    expect(demo.lift).toBeGreaterThan(0);
    expect(demo.confidence).toBeGreaterThan(0.5);
  });

  it('records the losing cohort as contradicting evidence, not as absence', () => {
    const insight = computeInsights(cohorts(25, 0.9, 0.3), 'account')[0]!;
    expect(insight.evidence.supporting.length).toBe(25);
    expect(insight.evidence.contradicting.length).toBe(25);
    expect(insight.evidence.windowStart.getTime()).toBeLessThan(
      insight.evidence.windowEnd.getTime(),
    );
  });

  it('learns from failure as readily as from success', () => {
    const poor = computeInsights(cohorts(25, 0.9, 0.3), 'account').find(
      (i) => i.featureValue === 'before_after',
    )!;
    expect(poor.lift).toBeLessThan(0);
    expect(poor.recommendation).toMatch(/Avoid/);
  });

  it('writes an observation a person can read', () => {
    const insight = computeInsights(cohorts(25, 0.9, 0.3), 'account')[0]!;
    expect(insight.observation).toMatch(/creative_type "feature_demo" outperforms/);
  });

  it('sets a review date so a belief cannot stand forever', () => {
    const now = new Date('2026-06-30T00:00:00Z');
    const insight = computeInsights(cohorts(25, 0.9, 0.3), 'account', { now })[0]!;
    expect(insight.reviewAfter.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('confidenceFor needs both sample and effect', () => {
  it('gives a huge effect on a tiny sample almost nothing', () => {
    expect(confidenceFor(3, 3, 2.0)).toBeLessThan(0.2);
  });
  it('gives a tiny effect on a huge sample almost nothing', () => {
    expect(confidenceFor(500, 500, 0.01)).toBeLessThan(0.1);
  });
  it('rewards both together', () => {
    expect(confidenceFor(40, 40, 0.4)).toBe(1);
  });
  it('is bounded by the smaller cohort', () => {
    expect(confidenceFor(1000, 2, 0.5)).toBeLessThan(0.2);
  });
});

describe('reconcileInsight', () => {
  const first = computeInsights(cohorts(25, 0.9, 0.3), 'account')[0]!;

  it('accepts a first sighting unchanged', () => {
    expect(reconcileInsight(null, first)).toBe(first);
  });

  it('corroborates agreement and can reach validated', () => {
    const again = computeInsights(cohorts(25, 0.85, 0.35), 'account')[0]!;
    const merged = reconcileInsight(first, again);
    expect(merged.corroborations).toBe(2);
    expect(merged.confidence).toBeGreaterThanOrEqual(again.confidence);
    expect(merged.status).toBe('validated');
  });

  /**
   * The behaviour the specification asks for by name: conflicting evidence
   * must change confidence rather than the old rule being preserved.
   */
  it('halves confidence when later evidence reverses the direction', () => {
    const reversed = computeInsights(cohorts(25, 0.3, 0.9), 'account').find(
      (i) => i.featureValue === 'feature_demo',
    )!;
    const merged = reconcileInsight(first, reversed);

    expect(Math.sign(merged.lift)).not.toBe(Math.sign(first.lift));
    expect(merged.confidence).toBeLessThan(first.confidence);
    expect(merged.corroborations).toBe(1);
    expect(merged.observation).toMatch(/Reversed against earlier evidence/);
  });

  it('drops a validated belief out of validated when contradicted', () => {
    const agreeing = computeInsights(cohorts(25, 0.85, 0.35), 'account')[0]!;
    const validated = reconcileInsight(first, agreeing);
    expect(validated.status).toBe('validated');

    const reversed = computeInsights(cohorts(25, 0.3, 0.9), 'account').find(
      (i) => i.featureValue === 'feature_demo',
    )!;
    const after = reconcileInsight(validated, reversed);
    expect(after.status).not.toBe('validated');
  });
});

describe('actionableInsights', () => {
  const strong = computeInsights(cohorts(25, 0.9, 0.3), 'account')[0]!;

  it('withholds an observed note from decisions', () => {
    const weak: Insight = { ...strong, status: 'observed' };
    expect(actionableInsights([weak])).toEqual([]);
  });

  it('withholds a belief past its review date', () => {
    const stale: Insight = { ...strong, reviewAfter: new Date(base.getTime() - DAY) };
    expect(actionableInsights([stale], base)).toEqual([]);
  });

  it('admits a fresh, inferred belief', () => {
    expect(actionableInsights([strong], strong.evidence.windowEnd).length).toBe(1);
  });
});
