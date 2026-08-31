/**
 * §414. A picture that changed has changed, whichever signal noticed.
 *
 * §74 replaced mean luminance with tonal range because Halyard's cards are a
 * light ground with dark text: swapping every word moves `YAVG` by 0.004,
 * under the 0.01 that counts as the same picture, while `YMIN` drops from 85
 * to 10.
 *
 * That signal is blind to the case §407 introduced. `signalstats` reports
 * `YMIN=0 YMAX=255` on every frame of a real photograph, so the range
 * saturates at 1.0 and its consecutive delta is **exactly zero** no matter what
 * the picture does. Live: four completely different photographs, mean
 * luminance 0.067 → 0.348 → 0.170 → 0.252, reported as "longest static 19.3s"
 * — the whole runtime. The pattern-interrupt rule is an error and an errored
 * gate fails the item, so §407 was about to be rejected by the check that
 * exists to demand it.
 */
import { describe, expect, it } from 'vitest';
import { consecutiveDeltas, eitherSignalMoved } from './handlers/reviewMedia.js';

const STATIC_THRESHOLD = 0.01;
const moved = (deltas: number[]) => deltas.filter((d) => d >= STATIC_THRESHOLD).length;

describe('detecting that the picture changed', () => {
  it('sees four different photographs, which tonal range alone cannot', () => {
    /* Real values from the first per-beat piece. */
    const luminance = [0.067, 0.348, 0.17, 0.252];
    const range = [1, 1, 1, 1];

    expect(moved(consecutiveDeltas(range))).toBe(0);
    expect(moved(eitherSignalMoved(consecutiveDeltas(range), consecutiveDeltas(luminance)))).toBe(3);
  });

  it('still sees a card whose text changed, which the mean alone cannot', () => {
    /* §74's measured case: YAVG moves 0.004, tonal range moves 0.294. */
    const luminance = [0.72, 0.724, 0.72, 0.723];
    const range = [0.31, 0.604, 0.31, 0.6];

    expect(moved(consecutiveDeltas(luminance))).toBe(0);
    expect(moved(eitherSignalMoved(consecutiveDeltas(range), consecutiveDeltas(luminance)))).toBe(3);
  });

  it('still reports a genuinely static video as static', () => {
    const flat = [0.5, 0.5, 0.5, 0.5];
    expect(moved(eitherSignalMoved(consecutiveDeltas(flat), consecutiveDeltas(flat)))).toBe(0);
  });

  it('takes the larger signal, not the average', () => {
    /* Averaging would halve a real change and could push it under the bar. */
    expect(eitherSignalMoved([0, 0], [0.4, 0.02])).toEqual([0.4, 0.02]);
  });

  it('uses the shorter length when the two disagree', () => {
    expect(eitherSignalMoved([0.1, 0.2, 0.3], [0.5])).toEqual([0.5]);
  });
});
