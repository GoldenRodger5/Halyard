/**
 * §218. Choosing between creative directions.
 *
 * The tests that matter are about refusal and about sameness: an unbuildable
 * concept must not be quietly selected, and five phrasings of one idea must not
 * pass as five concepts.
 */
import { describe, expect, it } from 'vitest';
import {
  conceptDiversity,
  requirementMet,
  scoreConcepts,
  type Concept,
  type ConceptCapabilities,
} from './score.js';
import { analysePortfolio } from '../social/portfolio.js';
import { computeInsights } from '../learning/insights.js';

const able: ConceptCapabilities = {
  hasProductCapture: true,
  verifiedFactCount: 12,
  hasOwnedImagery: true,
  hasMeasuredHistory: true,
};
const bare: ConceptCapabilities = {
  hasProductCapture: false,
  verifiedFactCount: 0,
  hasOwnedImagery: false,
  hasMeasuredHistory: false,
};

function concept(overrides: Partial<Concept> = {}): Concept {
  return {
    title: 'Halving a recipe is not math',
    premise: 'Scaling a recipe down changes seasoning behaviour, not just quantities.',
    objective: 'education',
    treatment: 'myth_fact',
    platformIntent: ['tiktok', 'instagram'],
    evidenceRequirements: [{ kind: 'none', detail: 'Nothing external needed.' }],
    ...overrides,
  };
}

describe('requirementMet', () => {
  it('reads the account rather than trusting the concept', () => {
    expect(requirementMet({ kind: 'product_capture', detail: 'x' }, able)).toBe(true);
    expect(requirementMet({ kind: 'product_capture', detail: 'x' }, bare)).toBe(false);
    expect(requirementMet({ kind: 'verified_fact', detail: 'x' }, bare)).toBe(false);
    expect(requirementMet({ kind: 'none', detail: 'x' }, bare)).toBe(true);
  });
});

describe('scoring', () => {
  it('scores an unbuildable concept zero rather than merely low', () => {
    const [result] = scoreConcepts({
      concepts: [
        concept({
          evidenceRequirements: [
            { kind: 'product_capture', detail: 'Needs footage of the swap happening.' },
          ],
        }),
      ],
      capabilities: bare,
    });
    expect(result!.score).toBe(0);
    expect(result!.buildable).toBe(false);
    expect(result!.reason).toMatch(/Cannot be built: Needs footage/);
  });

  /**
   * Returned, not filtered. "This needs a capture you do not have" is often the
   * most useful thing in the batch.
   */
  it('still returns the unbuildable one, so the gap is visible', () => {
    const results = scoreConcepts({
      concepts: [
        concept({ title: 'buildable' }),
        concept({
          title: 'blocked',
          evidenceRequirements: [{ kind: 'product_capture', detail: 'Needs a capture.' }],
        }),
      ],
      capabilities: bare,
    });
    expect(results).toHaveLength(2);
    expect(results[0]!.concept.title).toBe('buildable');
    expect(results[1]!.unmetRequirements).toEqual(['Needs a capture.']);
  });

  it('prefers a concept that serves the chosen objective', () => {
    const results = scoreConcepts({
      concepts: [
        concept({ title: 'on-objective', objective: 'traffic', treatment: 'how_to' }),
        concept({ title: 'off-objective', objective: 'awareness', treatment: 'listicle' }),
      ],
      capabilities: able,
      objective: 'traffic',
    });
    expect(results[0]!.concept.title).toBe('on-objective');
    expect(results[0]!.breakdown.objectiveFit).toBe(1);
    expect(results[1]!.breakdown.objectiveFit).toBe(0);
  });

  it('penalises the treatment the account used last', () => {
    const results = scoreConcepts({
      concepts: [
        concept({ title: 'repeat', treatment: 'listicle' }),
        concept({ title: 'fresh', treatment: 'how_to' }),
      ],
      capabilities: able,
      recentTreatments: ['listicle', 'comparison', 'myth_fact'],
    });
    expect(results[0]!.concept.title).toBe('fresh');
    expect(results.find((r) => r.concept.title === 'repeat')!.breakdown.novelty).toBeLessThan(1);
  });

  it('lets measured performance move the ranking', () => {
    const DAY = 86_400_000;
    const start = new Date('2026-06-01T00:00:00Z');
    const observations = Array.from({ length: 25 }, (_, i) => [
      {
        contentItemId: `w-${i}`,
        platform: 'tiktok',
        accountId: 'a',
        publishedAt: new Date(start.getTime() + i * DAY),
        features: { creative_type: 'how_to' },
        score: 0.9,
      },
      {
        contentItemId: `l-${i}`,
        platform: 'tiktok',
        accountId: 'a',
        publishedAt: new Date(start.getTime() + i * DAY),
        features: { creative_type: 'listicle' },
        score: 0.2,
      },
    ]).flat();

    const results = scoreConcepts({
      concepts: [concept({ title: 'weak', treatment: 'listicle' }), concept({ title: 'strong', treatment: 'how_to' })],
      capabilities: able,
      insights: computeInsights(observations, 'account'),
      now: new Date(start.getTime() + 26 * DAY),
    });
    expect(results[0]!.concept.title).toBe('strong');
    expect(results[0]!.breakdown.learned).toBeGreaterThan(0);
    expect(results[1]!.breakdown.learned).toBeLessThan(0);
  });

  it('steers away from what the portfolio is saturated with', () => {
    const portfolio = analysePortfolio(
      Array.from({ length: 8 }, (_, i) => ({
        contentItemId: `c-${i}`,
        publishedAt: new Date(),
        platform: 'tiktok',
        dimensions: { treatment: 'listicle' },
      })),
    );
    const results = scoreConcepts({
      concepts: [concept({ title: 'saturated', treatment: 'listicle' }), concept({ title: 'gap', treatment: 'how_to' })],
      capabilities: able,
      portfolio,
    });
    expect(results[0]!.concept.title).toBe('gap');
    expect(results.find((r) => r.concept.title === 'saturated')!.breakdown.portfolio).toBeLessThan(0);
  });

  it('keeps every term, so a ranking can be argued with', () => {
    const [result] = scoreConcepts({ concepts: [concept()], capabilities: able });
    expect(Object.keys(result!.breakdown).sort()).toEqual(
      ['evidence', 'learned', 'novelty', 'objectiveFit', 'platformFit', 'portfolio'].sort(),
    );
  });
});

describe('conceptDiversity — the failure a ranking cannot detect', () => {
  it('catches five phrasings of one idea', () => {
    const sameIdea = [
      concept({ premise: 'Scaling a recipe down changes how seasoning behaves in the pot.' }),
      concept({ premise: 'When you scale a recipe down the seasoning behaves differently.' }),
      concept({ premise: 'Seasoning behaves differently when a recipe is scaled down.' }),
    ];
    const d = conceptDiversity(sameIdea);
    expect(d.distinctTreatments).toBe(1);
    expect(d.meanPremiseOverlap).toBeGreaterThan(0.4);
    expect(d.diverse).toBe(false);
  });

  it('accepts genuinely different directions about one subject', () => {
    const varied = [
      concept({
        treatment: 'myth_fact',
        premise: 'Halving a recipe is not arithmetic; salt does not scale linearly.',
      }),
      concept({
        treatment: 'feature_demo',
        objective: 'product_promotion',
        premise: 'Watch the app rewrite an entire ingredient list for a coeliac guest in one tap.',
      }),
      concept({
        treatment: 'how_to',
        premise: 'Four swaps that make almost any bake gluten free without a wet crumb.',
      }),
    ];
    const d = conceptDiversity(varied);
    expect(d.distinctTreatments).toBe(3);
    expect(d.meanPremiseOverlap).toBeLessThan(0.4);
    expect(d.diverse).toBe(true);
  });

  it('calls a single concept undiverse rather than crashing', () => {
    const d = conceptDiversity([concept()]);
    expect(d.meanPremiseOverlap).toBe(0);
    expect(d.diverse).toBe(false);
  });
});
