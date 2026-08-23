/**
 * §169. The correction appliers — the half that actually mutates.
 *
 * The controller's *decisions* have been tested since §165. The code that
 * carries them out had no tests at all, which is the wrong way round: a wrong
 * decision produces a bad correction, but a wrong applier spends a provider
 * call, rewrites an artifact and writes an iteration row claiming it did
 * something else.
 *
 * These are the deterministic paths, so all of them are testable with no
 * provider at all — which is exactly why the gap mattered while Anthropic is
 * unavailable.
 */
import { describe, expect, it } from 'vitest';
import {
  correctionNote,
  lexiconTermsFrom,
  rebalanceBeats,
  strongerBackdrop,
  wordCeilingFor,
} from './apply.js';
import type { Defect } from '@halyard/core';

function defect(over: Partial<Defect> = {}): Defect {
  return {
    gate: 'audio',
    rule: 'audio.pacing',
    severity: 'error',
    observation: '195 words per minute, outside 140–175.',
    rootCause: 'The script has more words than the runtime allows.',
    component: 'vo_script',
    action: 'rewrite_vo_script',
    correctable: true,
    ...over,
  } as Defect;
}

describe('correctionNote', () => {
  it('tells the writer exactly what failed, in the gate’s own words', () => {
    const note = correctionNote({ defects: [defect()], doNotRegress: [] });
    expect(note).toContain('audio.pacing');
    expect(note).toContain('195 words per minute');
  });

  it('carries forward what an earlier iteration already fixed', () => {
    /*
     * The constraint that makes this a loop rather than independent attempts.
     * Without it, iteration 2 is free to recreate the caption overlap that
     * iteration 1 removed.
     */
    const note = correctionNote({
      defects: [defect()],
      doNotRegress: [defect({ rule: 'visual.text_clipped', observation: 'caption over the reason' })],
    });
    expect(note).toContain('visual.text_clipped');
    expect(note).toMatch(/do not reintroduce/i);
  });

  it('says nothing about regressions when there are none to avoid', () => {
    expect(correctionNote({ defects: [defect()], doNotRegress: [] })).not.toMatch(/reintroduce/i);
  });

  it('tells the writer to change only what is required', () => {
    // The scope instruction. A rewrite that improves unrelated copy is a
    // rewrite whose next verdict is uninterpretable.
    expect(correctionNote({ defects: [defect()], doNotRegress: [] })).toMatch(/only what is required/i);
  });
});

describe('lexiconTermsFrom', () => {
  it('takes the terms the gate itself named', () => {
    const d = defect({ evidence: { suggestedLexiconTerms: ['gummy', 'flour'] } } as never);
    expect(lexiconTermsFrom([d])).toEqual(['gummy', 'flour']);
  });

  it('invents nothing when the gate named nothing', () => {
    expect(lexiconTermsFrom([defect()])).toEqual([]);
    expect(lexiconTermsFrom([defect({ evidence: { suggestedLexiconTerms: 'not an array' } } as never)])).toEqual([]);
  });

  it('de-duplicates and drops blanks rather than passing them on', () => {
    const d = defect({ evidence: { suggestedLexiconTerms: ['a', 'a', '  ', 'b'] } } as never);
    expect(lexiconTermsFrom([d])).toEqual(['a', 'b']);
  });
});

describe('wordCeilingFor', () => {
  it('derives the ceiling from the measured duration, not a guess', () => {
    expect(wordCeilingFor(60)).toBe(158);
    expect(wordCeilingFor(30)).toBe(79);
  });

  it('never returns a ceiling too small to say anything', () => {
    expect(wordCeilingFor(0)).toBeGreaterThanOrEqual(12);
    expect(wordCeilingFor(-5)).toBeGreaterThanOrEqual(12);
  });

  it('targets the middle of the pacing window, not its edge', () => {
    // A script written to the exact limit fails again on any variation in
    // delivery, which spends an iteration to land in the same place.
    expect(wordCeilingFor(60)).toBeLessThan(175);
    expect(wordCeilingFor(60)).toBeGreaterThan(140);
  });
});

describe('rebalanceBeats', () => {
  const beats = [
    { id: 'hook', weight: 1, minSeconds: 1.2 },
    { id: 'a', weight: 6, minSeconds: 2.4 },
    { id: 'b', weight: 2, minSeconds: 2.4 },
    { id: 'c', weight: 2, minSeconds: 2.4 },
  ];

  it('moves weight off the beat that dominates the piece', () => {
    const out = rebalanceBeats(beats)!;
    expect(out.find((b) => b.id === 'a')!.weight).toBeLessThan(6);
    expect(out.find((b) => b.id === 'b')!.weight).toBeGreaterThan(2);
  });

  it('invents no beats and removes none', () => {
    /*
     * The refusal that matters. Adding a beat to break up a static stretch
     * would be inventing content to satisfy a metric — which is the failure
     * `retention` exists to detect, not to cause.
     */
    const out = rebalanceBeats(beats)!;
    expect(out.map((b) => b.id)).toEqual(beats.map((b) => b.id));
  });

  it('preserves the total weight, so the piece is redistributed rather than stretched', () => {
    const before = beats.reduce((n, b) => n + b.weight, 0);
    const after = rebalanceBeats(beats)!.reduce((n, b) => n + b.weight, 0);
    expect(after).toBeCloseTo(before, 3);
  });

  it('refuses when there is nothing it can safely do', () => {
    // Two beats cannot be rebalanced into a pattern interrupt, and pretending
    // otherwise burns an iteration.
    expect(rebalanceBeats([{ id: 'a', weight: 3, minSeconds: 2 }])).toBeNull();
    expect(rebalanceBeats(beats.slice(0, 2))).toBeNull();
  });

  it('refuses when nothing dominates', () => {
    expect(
      rebalanceBeats([
        { id: 'a', weight: 2, minSeconds: 2 },
        { id: 'b', weight: 2, minSeconds: 2 },
        { id: 'c', weight: 2, minSeconds: 2 },
      ]),
    ).toBeNull();
  });

  it('leaves a capped beat alone, because its length is a fact', () => {
    /*
     * Footage runs as long as the footage runs (§163). Redistributing weight
     * onto or off a capped beat cannot change its duration and would only
     * confuse the timeline.
     */
    const withFootage = [
      { id: 'hook', weight: 1, minSeconds: 1.2 },
      { id: 'demo', weight: 3, minSeconds: 3, maxSeconds: 3 },
      { id: 'a', weight: 6, minSeconds: 2.4 },
      { id: 'b', weight: 2, minSeconds: 2.4 },
    ];
    const out = rebalanceBeats(withFootage)!;
    const demo = out.find((b) => b.id === 'demo')!;
    expect(demo.weight).toBe(3);
    expect(demo.maxSeconds).toBe(3);
  });
});

describe('strongerBackdrop', () => {
  it('raises a flat surface to the measured media plate', () => {
    expect(strongerBackdrop('surface')).toBe('media');
    expect(strongerBackdrop(undefined)).toBe('media');
  });

  it('refuses when the strongest treatment is already in use', () => {
    /*
     * §158 provides two backdrops and the plate is the stronger. A contrast
     * failure underneath it is not a treatment problem, so returning "media"
     * again would be a correction that changes nothing and still costs an
     * iteration.
     */
    expect(strongerBackdrop('media')).toBeNull();
  });
});
