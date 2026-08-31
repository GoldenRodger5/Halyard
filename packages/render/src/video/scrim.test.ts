/**
 * §407. The scrim has to be dense where the words are, and light on a dark
 * photograph.
 *
 * Both halves were wrong and both were only visible by rendering a frame.
 * The gradient was inherited from the quiz, where type is always low — so
 * `anchored` (type at the top) and `statement` (centred) put white words
 * exactly where the picture was left brightest. And the floor of 0.6 washed
 * 60% black over an underexposed photograph that needed almost none.
 */
import { describe, expect, it } from 'vitest';
import { scrimStops } from './narrative.js';

/** Interpolate the gradient at a vertical position, 0..100. */
function alphaAt(stops: Array<[number, number]>, at: number): number {
  for (let i = 1; i < stops.length; i += 1) {
    const [x0, a0] = stops[i - 1]!;
    const [x1, a1] = stops[i]!;
    if (at <= x1) return a0 + ((a1 - a0) * (at - x0)) / Math.max(1e-6, x1 - x0);
  }
  return stops[stops.length - 1]![1];
}

describe('the scrim', () => {
  it('is densest where each anchor puts its type', () => {
    expect(alphaAt(scrimStops('top', 0.6), 5)).toBeGreaterThan(alphaAt(scrimStops('top', 0.6), 80));
    expect(alphaAt(scrimStops('bottom', 0.6), 95)).toBeGreaterThan(
      alphaAt(scrimStops('bottom', 0.6), 10),
    );
    const centre = scrimStops('center', 0.6);
    expect(alphaAt(centre, 50)).toBeGreaterThan(alphaAt(centre, 2));
  });

  it('puts less black over a dark photograph than a bright one', () => {
    const dark = Math.max(...scrimStops('center', 0.15).map(([, a]) => a));
    const bright = Math.max(...scrimStops('center', 0.85).map(([, a]) => a));
    expect(dark).toBeLessThan(bright);
  });

  it('never crushes a dark photograph', () => {
    /*
     * The bug this replaces: an underexposed crumb shot measured 0.152 and got
     * a 0.63 wash, which is most of a good picture thrown away for contrast it
     * did not need.
     */
    expect(Math.max(...scrimStops('center', 0.152).map(([, a]) => a))).toBeLessThan(0.45);
  });

  it('always helps enough on a blown-out photograph', () => {
    /* White type on a 0.9-luminance picture needs real weight behind it. */
    const stops = scrimStops('center', 0.9);
    expect(alphaAt(stops, 50)).toBeGreaterThan(0.6);
  });

  it('keeps some weight at the foot, where the wordmark sits', () => {
    for (const anchor of ['top', 'center', 'bottom'] as const) {
      expect(alphaAt(scrimStops(anchor, 0.5), 100)).toBeGreaterThan(0.15);
    }
  });

  it('is monotonic in luminance at the anchor', () => {
    const at = (l: number) => alphaAt(scrimStops('center', l), 50);
    expect(at(0.2)).toBeLessThan(at(0.5));
    expect(at(0.5)).toBeLessThan(at(0.8));
  });
});
