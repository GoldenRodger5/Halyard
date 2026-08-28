/**
 * §211. The register, and why it is a lookup rather than a redesign.
 */
import { describe, expect, it } from 'vitest';
import { EDITORIAL, PUNCH, fitWords, presentationFor } from './presentation.js';

describe('presentationFor', () => {
  it('gives short-form feeds the punch register', () => {
    for (const platform of ['tiktok', 'instagram', 'threads', 'x', 'bluesky']) {
      expect(presentationFor(platform).mode, platform).toBe('punch');
    }
  });

  it('keeps Pinterest editorial — a tile is browsed, not competed for', () => {
    expect(presentationFor('pinterest').mode).toBe('editorial');
  });

  it('splits YouTube by variant, because a Short and a long-form are not one surface', () => {
    expect(presentationFor('youtube', 'short').mode).toBe('punch');
    expect(presentationFor('youtube', 'long_form').mode).toBe('editorial');
  });

  it('defaults an unknown platform to punch rather than to air', () => {
    // A new short-form platform is far likelier than a new Pinterest.
    expect(presentationFor('some_new_feed').mode).toBe('punch');
  });
});

describe('the two registers differ where it was measured', () => {
  it('punch sets type materially larger', () => {
    expect(PUNCH.typeScale).toBeGreaterThan(EDITORIAL.typeScale * 1.5);
  });

  it('punch fills the frame — the measured renders were ~40% empty', () => {
    expect(PUNCH.fill).toBeGreaterThan(EDITORIAL.fill);
    expect(PUNCH.fill).toBeGreaterThan(0.8);
  });

  it('punch keeps the picture moving; editorial does not have to', () => {
    expect(PUNCH.mediaPush).toBeGreaterThan(1);
    expect(EDITORIAL.mediaPush).toBe(1);
  });

  it('punch caps words well below editorial', () => {
    expect(PUNCH.maxWordsPerBeat).toBeLessThan(EDITORIAL.maxWordsPerBeat);
    // The measured cards carried 35, 29 and 23 words.
    expect(PUNCH.maxWordsPerBeat).toBeLessThan(23);
  });

  it('punch uses the body face — a display serif loses legibility over media', () => {
    expect(PUNCH.useHeadingFont).toBe(false);
    expect(EDITORIAL.useHeadingFont).toBe(true);
  });

  it('punch is heavier', () => {
    expect(PUNCH.fontWeight).toBeGreaterThan(EDITORIAL.fontWeight);
  });
});

describe('fitWords', () => {
  it('leaves a line that already fits completely alone', () => {
    expect(fitWords('Halving a recipe is not math', PUNCH)).toBe('Halving a recipe is not math');
  });

  it('trims to whole words rather than mid-sentence with an ellipsis', () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    const fitted = fitWords(long, PUNCH);
    expect(fitted.split(' ').length).toBe(PUNCH.maxWordsPerBeat);
    expect(fitted).not.toMatch(/…|\.\.\./);
  });

  it('allows editorial more room than punch', () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    expect(fitWords(long, EDITORIAL).length).toBeGreaterThan(fitWords(long, PUNCH).length);
  });
});
