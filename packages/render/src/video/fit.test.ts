/**
 * §237. A fitted block must fit at the size it is actually drawn.
 *
 * ## The bug this locks down
 *
 * `fitScale` searched for a scale whose height fits the band, and the font
 * size was then computed as `base * scale * presentation.typeScale`. In the
 * punch register `typeScale` is 1.85, so every fitted block was multiplied by
 * 1.85 *after* being fitted and overflowed by exactly that factor.
 *
 * Nothing caught it. The fit function was correct, the treatment was correct,
 * and the composition of the two was wrong — which no unit test of either half
 * can see. It showed up on the first real production frame: ten words on a
 * step card, clipped at the top and running off the right edge.
 */
import { describe, expect, it } from 'vitest';
import {
  CARD_TARGET_FILL,
  EMPHASIS_FILL,
  cardDensityScale,
  cardHeightAt,
  fitScale,
  noteHeightAt,
} from './treatments.js';

/* A 9:16 content band, above captions: the real geometry a beat is drawn in. */
const BAND = { width: 936, height: 1152 };
const PUNCH = 1.85;
const EDITORIAL = 1;

const LONG =
  'Gluten-free breadcrumbs can absorb slightly more moisture than regular breadcrumbs';

describe('a note fits the band it is drawn in', () => {
  for (const [name, t] of [
    ['editorial', EDITORIAL],
    ['punch', PUNCH],
  ] as const) {
    it(`fits in the ${name} register`, () => {
      const scale = fitScale((k) => noteHeightAt(LONG, BAND.width, k * t), BAND.height, 'normal');
      /* The height at the size that is actually rendered. */
      const drawn = noteHeightAt(LONG, BAND.width, scale * t);
      expect(drawn, `${name}: ${drawn} > ${BAND.height}`).toBeLessThanOrEqual(BAND.height);
    });
  }

  it('does not fit for a frame smaller than the real one', () => {
    /*
     * The over-correction, which is its own defect: dividing the width as well
     * as scaling counts `t` twice, fits for a band half the size, and produces
     * type far smaller than the frame can carry. Both directions are wrong and
     * this pins the correct one.
     */
    const correct = fitScale(
      (k) => noteHeightAt(LONG, BAND.width, k * PUNCH),
      BAND.height,
      'normal',
    );
    const doubleCounted = fitScale(
      (k) => noteHeightAt(LONG, BAND.width / PUNCH, k * PUNCH),
      BAND.height,
      'normal',
    );
    expect(correct).toBeGreaterThan(doubleCounted);
  });

  it('uses the band it is given rather than a constant', () => {
    // A landscape band is shorter; the same text must come back smaller.
    const tall = fitScale((k) => noteHeightAt(LONG, 936, k), 1152, 'normal');
    const short = fitScale((k) => noteHeightAt(LONG, 1190, k), 778, 'normal');
    expect(short).toBeLessThanOrEqual(tall);
  });
});

describe('a transformation card fits the band it is drawn in', () => {
  const content = {
    before: '3 1/4 cups bread flour',
    after: '3 1/4 cups gluten-free bread flour blend',
    reason: 'A 1:1 blend with xanthan gum is the only swap that keeps the dough workable.',
  };

  for (const [name, t] of [
    ['editorial', EDITORIAL],
    ['punch', PUNCH],
  ] as const) {
    it(`fits in the ${name} register`, () => {
      const scale = cardDensityScale(content, BAND, 'normal', t);
      const drawn = cardHeightAt(content, BAND.width, scale * t);
      expect(drawn, `${name}: ${drawn} > ${BAND.height}`).toBeLessThanOrEqual(BAND.height);
    });
  }

  it('leaves the emphasis fills reachable', () => {
    // A held card is allowed to fill more of the band than a normal one, and
    // a fit that ignored emphasis would flatten that distinction.
    expect(EMPHASIS_FILL.hold ?? CARD_TARGET_FILL).toBeGreaterThan(CARD_TARGET_FILL);
  });
});
