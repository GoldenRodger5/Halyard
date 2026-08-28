/**
 * §208, §209. Portfolio balance and the Social Engine.
 *
 * The assertions that matter most are the negative ones: that a popular
 * irrelevant account cannot outrank a small relevant one, and that no
 * recommendation kind is a verb that touches a platform.
 */
import { describe, expect, it } from 'vitest';
import {
  analysePortfolio,
  portfolioPreferences,
  sliceDimensions,
  type PortfolioItem,
} from './portfolio.js';
import {
  FORBIDDEN_AUTONOMOUS_ACTIONS,
  RECOMMENDATION_KINDS,
  assertNoAutonomousAction,
  groupByKind,
  rankRecommendations,
  type SocialRecommendation,
} from './recommendations.js';

const DAY = 86_400_000;
const NOW = new Date('2026-08-28T00:00:00Z');

function item(i: number, dims: Record<string, string | null>): PortfolioItem {
  return {
    contentItemId: `c-${i}`,
    publishedAt: new Date(NOW.getTime() - i * DAY),
    platform: 'tiktok',
    dimensions: dims,
  };
}

describe('portfolio slices', () => {
  it('counts values within a dimension', () => {
    const slices = sliceDimensions([
      item(0, { treatment: 'before_after' }),
      item(1, { treatment: 'before_after' }),
      item(2, { treatment: 'how_to' }),
    ]);
    const ba = slices.find((s) => s.value === 'before_after')!;
    expect(ba.count).toBe(2);
    expect(ba.share).toBeCloseTo(0.667, 2);
    expect(ba.lastUsedIndex).toBe(0);
  });

  it('does not count an unrecorded dimension as a choice', () => {
    const slices = sliceDimensions([
      item(0, { treatment: 'how_to' }),
      item(1, { treatment: null }),
    ]);
    // One known value out of one known item, not out of two.
    expect(slices.find((s) => s.value === 'how_to')!.share).toBe(1);
    expect(slices.some((s) => s.value === 'null')).toBe(false);
  });
});

describe('analysePortfolio', () => {
  const monotonous = Array.from({ length: 8 }, (_, i) =>
    item(i, { treatment: 'before_after', topic: 'gluten_free' }),
  );

  it('says nothing about an empty window', () => {
    const r = analysePortfolio([]);
    expect(r.findings).toEqual([]);
    expect(r.summary).toMatch(/nothing to balance/i);
  });

  it('escalates a dimension that has become the only output', () => {
    const r = analysePortfolio(monotonous);
    const finding = r.findings.find((f) => f.dimension === 'treatment')!;
    expect(finding.kind).toBe('overused');
    expect(finding.severity).toBe('error');
    expect(finding.message).toMatch(/the only output/);
  });

  it('warns rather than fails on a merely strong preference', () => {
    const mixed = [
      ...Array.from({ length: 6 }, (_, i) => item(i, { treatment: 'before_after' })),
      ...Array.from({ length: 4 }, (_, i) => item(10 + i, { treatment: 'how_to' })),
    ];
    const finding = analysePortfolio(mixed).findings.find((f) => f.dimension === 'treatment')!;
    expect(finding.severity).toBe('warning');
  });

  it('leaves a genuinely balanced account alone', () => {
    const balanced = [
      item(0, { treatment: 'before_after' }),
      item(1, { treatment: 'how_to' }),
      item(2, { treatment: 'listicle' }),
      item(3, { treatment: 'comparison' }),
      item(4, { treatment: 'myth_fact' }),
    ];
    const r = analysePortfolio(balanced);
    expect(r.findings.filter((f) => f.kind === 'overused')).toEqual([]);
    expect(r.summary).toMatch(/Balanced/);
  });

  it('reports undercoverage only against a declared expectation', () => {
    const r = analysePortfolio(monotonous, {
      expected: { treatment: ['before_after', 'how_to', 'feature_demo'] },
    });
    expect(r.gaps.treatment).toEqual(['how_to', 'feature_demo']);
    expect(r.findings.some((f) => f.kind === 'undercovered' && f.value === 'how_to')).toBe(true);
  });

  it('does not invent an expectation from history', () => {
    const r = analysePortfolio(monotonous);
    expect(r.gaps).toEqual({});
    expect(r.findings.some((f) => f.kind === 'undercovered')).toBe(false);
  });

  it('notices an account that has stopped exploring', () => {
    const r = analysePortfolio(monotonous);
    expect(r.explorationShare).toBeLessThan(0.2);
    expect(r.findings.some((f) => f.kind === 'unexplored')).toBe(true);
  });
});

describe('portfolioPreferences', () => {
  it('steers away from the dominant value and toward the gaps', () => {
    const items = Array.from({ length: 8 }, (_, i) => item(i, { treatment: 'before_after' }));
    const report = analysePortfolio(items, {
      expected: { treatment: ['before_after', 'feature_demo'] },
    });
    const prefs = portfolioPreferences(report, 'treatment');
    expect(prefs.avoid).toContain('before_after');
    expect(prefs.prefer).toContain('feature_demo');
    expect(prefs.prefer).not.toContain('before_after');
  });
});

// ── Social Engine ──────────────────────────────────────────────────────────

function rec(overrides: Partial<SocialRecommendation> = {}): SocialRecommendation {
  return {
    accountId: 'acct-1',
    platform: 'tiktok',
    subject: '@someone',
    subjectType: 'creator',
    kind: 'study',
    relevance: 0.8,
    confidence: 0.9,
    rationale: 'Posts gluten-free baking transformations to a similar audience.',
    evidence: [
      {
        observation: 'Nine of their last twenty posts are ingredient swaps.',
        source: 'https://tiktok.com/@someone',
        observedAt: NOW,
      },
    ],
    ...overrides,
  };
}

describe('the safety boundary', () => {
  /**
   * The most important test in this file. §3.2 and §8 both say intelligence
   * does not imply engagement automation; this is that sentence as a build
   * failure rather than a paragraph.
   */
  it('exposes no recommendation kind that acts on a platform', () => {
    expect(() => assertNoAutonomousAction()).not.toThrow();
  });

  it('throws if an executable verb is ever added', () => {
    expect(() => assertNoAutonomousAction([...RECOMMENDATION_KINDS, 'reply'])).toThrow(
      /does not act/,
    );
  });

  it('names every action it refuses to represent', () => {
    for (const forbidden of FORBIDDEN_AUTONOMOUS_ACTIONS) {
      expect(RECOMMENDATION_KINDS as readonly string[]).not.toContain(forbidden);
    }
  });
});

describe('rankRecommendations', () => {
  it('drops a recommendation with no evidence rather than ranking it low', () => {
    const bare = rec({ evidence: [] });
    expect(rankRecommendations([bare], NOW)).toEqual([]);
  });

  /** §13: do not recommend the popular merely because it is popular. */
  it('keeps a small relevant account above a huge irrelevant one', () => {
    const relevant = rec({
      subject: '@small-and-relevant',
      relevance: 0.9,
      evidence: [{ observation: 'o', source: 's', observedAt: NOW, audienceSize: 4_000 }],
    });
    const popular = rec({
      subject: '@enormous-and-not',
      relevance: 0.1,
      evidence: [{ observation: 'o', source: 's', observedAt: NOW, audienceSize: 9_000_000 }],
    });
    const ranked = rankRecommendations([popular, relevant], NOW);
    expect(ranked[0]!.subject).toBe('@small-and-relevant');
  });

  it('uses reach only to separate otherwise equal candidates', () => {
    const small = rec({
      subject: '@small',
      evidence: [{ observation: 'o', source: 's', observedAt: NOW, audienceSize: 1_000 }],
    });
    const large = rec({
      subject: '@large',
      evidence: [{ observation: 'o', source: 's', observedAt: NOW, audienceSize: 500_000 }],
    });
    expect(rankRecommendations([small, large], NOW)[0]!.subject).toBe('@large');
  });

  it('decays a recommendation nobody has re-observed', () => {
    const stale = rec({
      evidence: [{ observation: 'o', source: 's', observedAt: new Date(NOW.getTime() - 400 * DAY) }],
    });
    expect(rankRecommendations([stale], NOW)).toEqual([]);
  });

  it('honours an explicit expiry', () => {
    const expired = rec({ expiresAt: new Date(NOW.getTime() - DAY) });
    expect(rankRecommendations([expired], NOW)).toEqual([]);
  });

  it('lowers a recommendation nobody is confident about', () => {
    const shaky = rankRecommendations([rec({ subject: '@a', confidence: 0.2 })], NOW)[0]!;
    const solid = rankRecommendations([rec({ subject: '@b', confidence: 1 })], NOW)[0]!;
    expect(shaky.score).toBeLessThan(solid.score);
  });

  it('respects a limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => rec({ subject: `@a-${i}` }));
    expect(rankRecommendations(many, NOW, 3).length).toBe(3);
  });
});

describe('groupByKind', () => {
  it('keeps rejected subjects visible instead of hiding them', () => {
    const ranked = rankRecommendations(
      [rec({ subject: '@keep', kind: 'study' }), rec({ subject: '@drop', kind: 'ignore' })],
      NOW,
    );
    const grouped = groupByKind(ranked);
    expect(grouped.ignore.map((r) => r.subject)).toEqual(['@drop']);
    expect(grouped.study.map((r) => r.subject)).toEqual(['@keep']);
  });

  it('returns an entry for every kind, empty where nothing landed', () => {
    const grouped = groupByKind([]);
    expect(Object.keys(grouped).sort()).toEqual([...RECOMMENDATION_KINDS].sort());
  });
});
