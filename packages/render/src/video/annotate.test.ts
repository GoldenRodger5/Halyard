/**
 * §284. Marks that land on the right word.
 *
 * The value of a drawn mark is that it is evidence of intent — something knew
 * what the words were and when they were said. So the checks that matter are:
 * it lands on the phrase it was asked for, it refuses rather than guesses when
 * the phrase is not there, and it draws identically on a re-render.
 */
import { describe, expect, it } from 'vitest';
import { annotationForPhrase } from './annotate.js';

const words = [
  { text: 'Your', startSeconds: 0.0, endSeconds: 0.3 },
  { text: 'dusting', startSeconds: 0.3, endSeconds: 0.8 },
  { text: 'flour', startSeconds: 0.8, endSeconds: 1.2 },
  { text: 'is', startSeconds: 1.2, endSeconds: 1.35 },
  { text: 'not', startSeconds: 1.35, endSeconds: 1.6 },
  { text: 'gluten-free.', startSeconds: 1.6, endSeconds: 2.2 },
];
const captionBox = { x: 0.08, y: 0.72, width: 0.84, height: 0.09 };

describe('placing a mark on a phrase', () => {
  it('starts the mark when the word is spoken', () => {
    const a = annotationForPhrase({ words, phrase: 'flour', kind: 'underline', captionBox })!;
    expect(a.atSeconds).toBe(0.8);
  });

  it('spans a multi-word phrase', () => {
    const a = annotationForPhrase({ words, phrase: 'dusting flour', kind: 'circle', captionBox })!;
    expect(a.atSeconds).toBe(0.3);
    /*
     * Weighted by characters, not words: "dusting flour" is 14 of the line's
     * 40 characters, so a little over a third rather than exactly two sixths.
     * Word-weighting put a circle for "gluten-free" over "en-free".
     */
    expect(a.box.width).toBeGreaterThan(captionBox.width * 0.25);
    expect(a.box.width).toBeLessThan(captionBox.width * 0.45);
  });

  it('weights position by character width, so a long word is not misplaced', () => {
    /*
     * The failure this fixes, seen on a render: a circle asked for the last
     * word of "Your dusting flour is not gluten-free" landed over "en-free",
     * because the last of six words is not the last sixth of the measure.
     */
    const a = annotationForPhrase({ words, phrase: 'gluten-free', kind: 'circle', captionBox })!;
    /*
     * Computed from the words as they actually are — the last one carries a
     * full stop, and using the phrase's own length instead is how this
     * expectation was wrong the first time.
     */
    const widths = words.map((w) => w.text.length + 1);
    const lineChars = widths.reduce((sum, n) => sum + n, 0);
    const expectedLeft = (lineChars - widths[widths.length - 1]!) / lineChars;
    expect((a.box.x - captionBox.x) / captionBox.width).toBeCloseTo(expectedLeft, 3);
  });

  it('places the mark further right for a later word', () => {
    const first = annotationForPhrase({ words, phrase: 'Your', kind: 'underline', captionBox })!;
    const last = annotationForPhrase({ words, phrase: 'gluten-free', kind: 'underline', captionBox })!;
    expect(last.box.x).toBeGreaterThan(first.box.x);
  });

  it('ignores punctuation, so a phrase still matches at the end of a sentence', () => {
    expect(annotationForPhrase({ words, phrase: 'gluten-free', kind: 'strike', captionBox })).not.toBeNull();
  });

  it('refuses when the phrase is not in the cue, rather than guessing a position', () => {
    /*
     * A mark over the wrong words is worse than no mark: it is the thing that
     * makes an annotation stop reading as intentional.
     */
    expect(annotationForPhrase({ words, phrase: 'sourdough', kind: 'underline', captionBox })).toBeNull();
    expect(annotationForPhrase({ words, phrase: '', kind: 'underline', captionBox })).toBeNull();
    expect(annotationForPhrase({ words: [], phrase: 'flour', kind: 'underline', captionBox })).toBeNull();
  });

  it('stays inside the caption it belongs to', () => {
    for (const phrase of ['Your', 'flour', 'gluten-free']) {
      const a = annotationForPhrase({ words, phrase, kind: 'underline', captionBox })!;
      expect(a.box.x).toBeGreaterThanOrEqual(captionBox.x - 1e-9);
      expect(a.box.x + a.box.width).toBeLessThanOrEqual(captionBox.x + captionBox.width + 1e-9);
    }
  });

  it('seeds its wobble from the phrase, so a re-render draws the same mark', () => {
    /*
     * A correction re-renders, and a mark that visibly shifts between the
     * version an operator approved and the one that ships is a defect.
     */
    const a = annotationForPhrase({ words, phrase: 'flour', kind: 'underline', captionBox })!;
    const b = annotationForPhrase({ words, phrase: 'flour', kind: 'underline', captionBox })!;
    expect(a.seed).toBe(b.seed);
    expect(a).toEqual(b);
  });
});

describe('the units the mark is drawn in', () => {
  it('keeps boxes as fractions of the frame, never pixels', async () => {
    /*
     * §284. `pathFor` scales these to the 0..100 viewBox. The first version
     * treated the fractions as viewBox units directly, which drew every mark as
     * a speck in the top-left corner — invisible in the geometry and obvious the
     * moment anything rendered.
     */
    const a = annotationForPhrase({ words, phrase: 'flour', kind: 'underline', captionBox })!;
    for (const value of [a.box.x, a.box.y, a.box.width, a.box.height]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
