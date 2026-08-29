/**
 * §269. The scorecard, and the one rule it must never break.
 *
 * Spec §14.5: "No single aggregate score may hide a hard failure." Most of what
 * is asserted here is that rule holding under pressure — a piece that is
 * excellent on nine dimensions and broken on one must fail.
 */
import { describe, expect, it } from 'vitest';
import {
  SCORE_DIMENSIONS,
  dimensionForRule,
  scoreCreative,
  type ScoredFinding,
} from './creativeScore.js';

const clean: ScoredFinding[] = [{ rule: 'copy.length', severity: 'warning', message: 'A shade long.' }];

describe('the creative scorecard', () => {
  it('fails the piece when one dimension fails, however good the rest are', () => {
    /* The rule the whole module exists for. */
    const card = scoreCreative({
      findings: [
        { rule: 'claims.unsourced', severity: 'error', message: 'A claim with no evidence.' },
      ],
    });
    expect(card.passed).toBe(false);
    expect(card.failures.map((f) => f.dimension)).toContain('claim_accuracy');
  });

  it('never lets the ranking score outrank a failure', () => {
    const card = scoreCreative({
      findings: [
        { rule: 'copy.tone', severity: 'warning', message: 'Slightly stiff.' },
        { rule: 'creative.fabricated_evidence', severity: 'error', message: 'Generated image in a proof beat.' },
      ],
    });
    /* Most dimensions are clean, so the mean stays high — and it must not matter. */
    expect(card.rankingScore).toBeGreaterThan(0.5);
    expect(card.passed).toBe(false);
    expect(card.summary).not.toMatch(/^All /);
  });

  it('reports a dimension nobody measured as unmeasured, never as a pass', () => {
    /* Gotcha 6, one layer up. */
    const card = scoreCreative({ findings: clean, hasCta: null });
    const cta = card.dimensions.find((d) => d.dimension === 'cta')!;
    expect(cta.status).toBe('unmeasured');
    expect(cta.score).toBeNull();
    expect(card.unmeasured).toContain('cta');
  });

  it('fails a required dimension that went unmeasured', () => {
    const card = scoreCreative({ findings: clean, hasCta: null, requires: ['cta'] });
    expect(card.passed).toBe(false);
    expect(card.failures.map((f) => f.dimension)).toContain('cta');
  });

  it('treats an undelivered payoff as a story failure, not a hook one', () => {
    /* The fix is in the body, so that is where an operator is sent. */
    const card = scoreCreative({ findings: clean, payoffDelivered: false });
    expect(card.dimensions.find((d) => d.dimension === 'story')!.status).toBe('fail');
    expect(card.passed).toBe(false);
  });

  it('separates "not checked" from "checked and undelivered"', () => {
    const unchecked = scoreCreative({ findings: clean, payoffDelivered: null });
    expect(unchecked.dimensions.find((d) => d.dimension === 'story')!.status).not.toBe('fail');
  });

  it('reports everything unmeasured when no gate reported at all', () => {
    /*
     * An empty finding list means nothing ran, not that everything is perfect.
     * Ten green ticks on an unexamined piece is the reassuring-and-wrong case.
     */
    const card = scoreCreative({ findings: [] });
    expect(card.unmeasured.length).toBe(SCORE_DIMENSIONS.length);
    expect(card.rankingScore).toBeNull();
    expect(card.summary).toContain('unmeasured');
  });

  it('routes a rule to the most specific dimension that claims it', () => {
    /* `audio.pacing` is pacing; other audio rules are clarity. */
    expect(dimensionForRule('audio.pacing')).toBe('pacing');
    expect(dimensionForRule('audio.loudness')).toBe('clarity');
    expect(dimensionForRule('retention.no_content_in_opening')).toBe('hook');
    expect(dimensionForRule('retention.not_loop_ready')).toBe('pacing');
  });

  it('ignores a rule no dimension claims rather than inventing a home for it', () => {
    expect(dimensionForRule('something.entirely.new')).toBeNull();
    const card = scoreCreative({ findings: [{ rule: 'x.y', severity: 'error', message: 'm' }] });
    /* Nothing landed, so nothing is scored — and nothing is falsely passed. */
    expect(card.passed).toBe(true);
    expect(card.unmeasured.length).toBe(SCORE_DIMENSIONS.length);
  });

  it('scores a clean piece as passing on every dimension it measured', () => {
    const card = scoreCreative({
      findings: [{ rule: 'copy.ok', severity: 'warning', message: 'Minor.' }],
      hasCta: true,
      novelty: 0.8,
      payoffDelivered: true,
    });
    expect(card.passed).toBe(true);
    expect(card.dimensions.find((d) => d.dimension === 'cta')!.status).toBe('pass');
    expect(card.dimensions.find((d) => d.dimension === 'novelty')!.status).toBe('pass');
  });

  it('warns rather than fails on thin novelty, because repetition is not a defect', () => {
    const card = scoreCreative({ findings: clean, novelty: 0.1 });
    expect(card.dimensions.find((d) => d.dimension === 'novelty')!.status).toBe('warn');
    expect(card.passed).toBe(true);
  });

  it('keeps the evidence beside the verdict, so it can be argued with', () => {
    const card = scoreCreative({
      findings: [{ rule: 'slop.buzzword', severity: 'error', message: 'Says "game-changing".' }],
    });
    const brand = card.dimensions.find((d) => d.dimension === 'brand_fit')!;
    expect(brand.evidence.join(' ')).toContain('game-changing');
  });
});
