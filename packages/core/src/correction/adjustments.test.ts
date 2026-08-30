/**
 * §373. The point of a named adjustment is that it says *which part to rebuild*.
 * These are about that, and about not offering one that cannot apply.
 */
import { describe, expect, it } from 'vitest';
import { ADJUSTMENTS, adjustmentById, adjustmentsFor } from './adjustments.js';
import { policyFor } from './policy.js';

const video = { hasScenes: true, hasVoice: true, hasImage: true };
const textPost = { hasScenes: false, hasVoice: false, hasImage: false };

describe('what an operator can ask for', () => {
  it('targets a component rather than defaulting to the copy', () => {
    /*
     * The whole reason these exist. "The picture is wrong" used to reach the
     * copywriter as a free-text note, so it rewrote the words and the picture
     * came back identical.
     */
    const picture = adjustmentById('different_picture')!;
    expect(picture.component).toBe('creative_plan');
    expect(picture.component).not.toBe('copy');

    const slower = adjustmentById('slower')!;
    expect(slower.component).toBe('composition');
  });

  it('offers everything on a video', () => {
    expect(adjustmentsFor(video).available).toHaveLength(ADJUSTMENTS.length);
    expect(adjustmentsFor(video).unavailable).toEqual([]);
  });

  it('says why, rather than hiding what cannot apply', () => {
    /*
     * The wizard's rule: nothing is hidden, and anything unavailable says why.
     * An operator who cannot find "Slower" on a text post should be told a text
     * post has no scenes rather than left wondering if the button exists.
     */
    const { available, unavailable } = adjustmentsFor(textPost);
    expect(available.map((a) => a.id)).toEqual(['rewrite', 'reground']);
    expect(unavailable.length).toBe(ADJUSTMENTS.length - 2);
    for (const entry of unavailable) {
      expect(entry.because.length).toBeGreaterThan(15);
    }
    expect(unavailable.find((u) => u.adjustment.id === 'slower')!.because).toContain('no scenes');
    expect(unavailable.find((u) => u.adjustment.id === 'reread')!.because).toContain('Nobody speaks');
  });

  it('separates the three reasons a piece cannot take an adjustment', () => {
    const silentVideo = adjustmentsFor({ hasScenes: true, hasVoice: false, hasImage: true });
    expect(silentVideo.available.map((a) => a.id)).toContain('slower');
    expect(silentVideo.available.map((a) => a.id)).not.toContain('reread');

    const typographic = adjustmentsFor({ hasScenes: true, hasVoice: true, hasImage: false });
    expect(typographic.unavailable.map((u) => u.adjustment.id)).toEqual(['different_picture']);
  });

  it('gives every adjustment a sentence saying what it will do', () => {
    /*
     * A button labelled "Slower" that does not say it lengthens scenes within
     * the channel budget is a button somebody presses hoping.
     */
    for (const adjustment of ADJUSTMENTS) {
      expect(adjustment.does.length).toBeGreaterThan(25);
      expect(adjustment.label.length).toBeLessThan(30);
    }
  });

  it('names only actions the correction policy knows how to run', () => {
    /*
     * An adjustment carrying an action nothing dispatches would be a button
     * that appears to work and does nothing — the exact declared-but-never-
     * executed shape this codebase keeps producing.
     */
    const unique = new Set(ADJUSTMENTS.map((a) => a.action));
    expect(unique.size).toBeGreaterThan(3);
    expect([...unique]).not.toContain('escalate');
    void policyFor;
  });

  it('has no duplicate ids', () => {
    const ids = ADJUSTMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns null for an id nobody offers', () => {
    expect(adjustmentById('make_it_pop')).toBeNull();
  });
});
