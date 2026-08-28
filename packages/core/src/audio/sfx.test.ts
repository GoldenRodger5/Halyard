import { describe, expect, it } from 'vitest';
import { MAX_SFX_PER_SECOND, planSfx, selectEffect, type SoundEffect } from './sfx.js';

const beats = [
  { startSeconds: 0, role: 'hook', transitionOut: 'crossfade', entrance: 'pop' },
  { startSeconds: 4, role: 'change', transitionOut: 'push_through', entrance: 'slide' },
  { startSeconds: 12, role: 'proof', transitionOut: 'cut', entrance: 'pop' },
  { startSeconds: 20, role: 'cta', transitionOut: 'cut', entrance: 'none' },
];

describe('planSfx', () => {
  it('marks transitions that exist and leaves hard cuts alone', () => {
    /*
     * §233. The whole point of a hard cut is that it is instant; a whoosh over
     * one turns it into a wipe. So a `cut` gets nothing.
     */
    const { cues } = planSfx({ beats, totalSeconds: 30, hasVoiceover: true });
    const transitions = cues.filter((c) => c.role === 'transition');
    expect(transitions.length).toBe(2);
    expect(transitions.map((c) => c.atSeconds)).toEqual([4, 12]);
  });

  it('refuses sound design where it would read as a sizzle reel', () => {
    const r = planSfx({ beats, totalSeconds: 30, hasVoiceover: true, visualLanguage: 'cinematic' });
    expect(r.cues).toEqual([]);
    expect(r.refusedReason).toContain('sizzle reel');
  });

  it('caps density so it does not become a tic', () => {
    /*
     * A whoosh on every cut is not sound design. One every four seconds is
     * already busy, and above that a viewer stops hearing individual sounds
     * and starts hearing production.
     */
    const dense = Array.from({ length: 20 }, (_, i) => ({
      startSeconds: i * 0.5,
      role: 'step',
      transitionOut: 'crossfade',
      entrance: 'pop',
    }));
    const { cues } = planSfx({ beats: dense, totalSeconds: 10, hasVoiceover: true });
    expect(cues.length).toBeLessThanOrEqual(Math.floor(10 * MAX_SFX_PER_SECOND));
  });

  it('keeps every effect under the voice', () => {
    const { cues } = planSfx({ beats, totalSeconds: 30, hasVoiceover: true });
    for (const cue of cues) expect(cue.gainDb).toBeLessThan(-12);
  });

  it('only adds a UI sound where a real interaction was captured', () => {
    /*
     * A tap sound over footage where nothing is tapped is a fabricated
     * interaction, in the same family as a fabricated screenshot.
     */
    const without = planSfx({ beats, totalSeconds: 30, hasVoiceover: true });
    expect(without.cues.some((c) => c.role === 'ui')).toBe(false);

    const withFootage = planSfx({
      beats: beats.map((b, i) => (i === 1 ? { ...b, isProductFootage: true } : b)),
      totalSeconds: 30,
      hasVoiceover: true,
    });
    expect(withFootage.cues.some((c) => c.role === 'ui')).toBe(true);
  });

  it('says why every cue is anchored to something', () => {
    const { cues } = planSfx({ beats, totalSeconds: 30, hasVoiceover: true });
    for (const cue of cues) expect(cue.because.length).toBeGreaterThan(0);
  });
});

describe('selectEffect', () => {
  const cue = { role: 'transition' as const, atSeconds: 4, gainDb: -20, because: 'test' };
  const effect = (over: Partial<SoundEffect> = {}): SoundEffect => ({
    id: 'a', assetId: 'x', title: 'Whoosh', role: 'transition', durationSeconds: 0.4,
    peakDb: -18, licence: 'Purchased', attributionRequired: false, attributionText: null,
    platformRestrictions: [], expiresAt: null, lastUsedAt: null, ...over,
  });

  it('reports an empty library rather than substituting', () => {
    // Synthesising a whoosh with FFmpeg would be ours outright and would sound
    // synthesised, which is worse than silence. §221 for the same reasoning.
    const r = selectEffect([], cue, 'tiktok');
    expect(r.effect).toBeNull();
    expect(r.silenceReason).toContain('library is empty');
  });

  it('treats the licence as a gate, not a tiebreak', () => {
    const r = selectEffect([effect({ platformRestrictions: ['tiktok'] })], cue, 'tiktok');
    expect(r.effect).toBeNull();
    expect(r.silenceReason).toContain('not licensed');
    // The same effect is fine somewhere it is permitted.
    expect(selectEffect([effect({ platformRestrictions: ['tiktok'] })], cue, 'youtube').effect)
      .not.toBeNull();
  });

  it('refuses an expired licence', () => {
    const r = selectEffect([effect({ expiresAt: new Date('2020-01-01') })], cue, 'tiktok');
    expect(r.effect).toBeNull();
  });

  it('rotates so a three-effect library does not become one', () => {
    const r = selectEffect(
      [
        effect({ id: 'recent', lastUsedAt: new Date('2030-01-01') }),
        effect({ id: 'old', lastUsedAt: new Date('2020-01-01') }),
      ],
      cue,
      'tiktok',
    );
    expect(r.effect?.id).toBe('old');
  });

  it('says when the library has effects but none for this role', () => {
    const r = selectEffect([effect({ role: 'ui' })], cue, 'tiktok');
    expect(r.effect).toBeNull();
    expect(r.silenceReason).toContain("'transition' role");
  });
});
