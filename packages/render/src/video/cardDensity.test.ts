/**
 * §167. How much of the frame a transformation commands.
 *
 * The defect this addresses was not position. Type sizes were fixed constants
 * chosen for a dense card, so a short transformation drew ~330px of type into a
 * 1152px band — and the *hook* headline was 96px while the transformation it
 * was introducing was 66px. Moving that block up or down cannot change which
 * element the eye reads first; only size can.
 */
import { describe, expect, it } from 'vitest';
import {
  CARD_SCALE_MAX,
  CARD_SCALE_MIN,
  CARD_TYPE,
  EMPHASIS_FILL,
  cardDensityScale,
  cardHeightAt,
} from './treatments.js';

/** The real band on a 1080×1920 frame with captions: 12% top, 28% bottom. */
const BAND = { width: 936, height: 1152 };
const HARD_CEILING = BAND.height * 0.92;

const short = { before: 'regular flour', after: 'gluten-free flour', reason: 'gluten-free adaptation' };
const long = {
  before: '2 cups regular all-purpose flour',
  after: '2 cups gluten-free 1:1 baking flour',
  reason: 'keeps the same baking structure',
};
const noReason = { before: 'ingredient A', after: 'ingredient B' };
const real = {
  before: '1 and 3/4 cups (420ml) milk (dairy or nondairy)',
  after: '¾ cup (180ml) oat milk',
  reason: 'Oat milk is the go-to dairy-free swap here; scaled down proportionally for 4 servings.',
};
const hugeReason = { before: 'a', after: 'b', reason: 'x'.repeat(400) };

const fits = (content: Parameters<typeof cardHeightAt>[0], scale: number): boolean =>
  cardHeightAt(content, BAND.width, scale) <= HARD_CEILING;

describe('content stays inside its band', () => {
  it.each([
    ['short', short],
    ['long', long],
    ['no reason', noReason],
    ['real transformation', real],
    ['huge reason', hugeReason],
  ])('never overflows the band for %s content', (_name, content) => {
    /*
     * The invariant everything else rests on. `BeatStage` clips overflow, so a
     * scale that is too large does not look wrong — it silently removes words,
     * which for a card whose whole job is a claim about a product is the worst
     * possible failure.
     */
    for (const emphasis of ['quick', 'normal', 'hold']) {
      const scale = cardDensityScale(content, BAND, emphasis);
      expect(fits(content, scale), `${_name}/${emphasis}`).toBe(true);
    }
  });

  it('leaves the caption band untouched at every scale', () => {
    // The card is measured against a band that already excludes the captions,
    // so growing the type can never reach them.
    const withCaptions = BAND.height;
    const withoutCaptions = 1920 - 230 - 230;
    expect(withCaptions).toBeLessThan(withoutCaptions);

    const scale = cardDensityScale(real, BAND, 'hold');
    expect(cardHeightAt(real, BAND.width, scale)).toBeLessThanOrEqual(withCaptions);
  });
});

describe('density drives scale', () => {
  it('makes sparse content larger than dense content', () => {
    /*
     * The behaviour the whole pass exists for: "2 large eggs → 1 flax egg"
     * must not be drawn at the same size as a four-line substitution note.
     */
    expect(cardDensityScale(short, BAND, 'normal')).toBeGreaterThan(
      cardDensityScale(hugeReason, BAND, 'normal'),
    );
  });

  it('scales dense content down rather than clipping it', () => {
    expect(cardDensityScale(hugeReason, BAND, 'normal')).toBeLessThan(1.5);
    expect(fits(hugeReason, cardDensityScale(hugeReason, BAND, 'normal'))).toBe(true);
  });

  it('is bounded at both ends, so text cannot grow until it fills the screen', () => {
    for (const content of [short, long, noReason, real, hugeReason]) {
      const scale = cardDensityScale(content, BAND, 'hold');
      expect(scale).toBeLessThanOrEqual(CARD_SCALE_MAX);
      expect(scale).toBeGreaterThan(0.4);
    }
    // A two-word card is capped, not grown without limit.
    expect(cardDensityScale(noReason, BAND, 'normal')).toBe(CARD_SCALE_MAX);
  });

  it('is deterministic — the same content always renders the same size', () => {
    const a = cardDensityScale(real, BAND, 'normal');
    const b = cardDensityScale(real, BAND, 'normal');
    expect(a).toBe(b);
  });
});

describe('emphasis stays the planner’s signal', () => {
  it('gives a held transformation more of the frame than a normal one', () => {
    const hold = cardDensityScale(real, BAND, 'hold');
    const normal = cardDensityScale(real, BAND, 'normal');
    const quick = cardDensityScale(real, BAND, 'quick');
    expect(hold).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(quick);
  });

  it('expresses emphasis as frame presence, all of it under the ceiling', () => {
    // Emphasis selects a target fill rather than multiplying a fitted scale —
    // multiplying afterwards is what would push a held card past its band.
    for (const fill of Object.values(EMPHASIS_FILL)) {
      expect(fill).toBeLessThan(0.92);
      expect(fill).toBeGreaterThan(0.4);
    }
  });

  it('treats an unknown emphasis as normal rather than guessing', () => {
    expect(cardDensityScale(real, BAND, 'enormous')).toBe(cardDensityScale(real, BAND, 'normal'));
    expect(cardDensityScale(real, BAND, undefined)).toBe(cardDensityScale(real, BAND, 'normal'));
  });
});

describe('hierarchy survives every scale', () => {
  it('keeps after larger than before, and before larger than the reason', () => {
    /*
     * The ratios *are* the hierarchy. Scaling multiplies all three by the same
     * factor, so no scale can reorder them — this pins that the base sizes are
     * ordered in the first place.
     */
    expect(CARD_TYPE.after.size).toBeGreaterThan(CARD_TYPE.before.size);
    expect(CARD_TYPE.before.size).toBeGreaterThan(CARD_TYPE.reason.size);
  });

  it('makes the transformation at least as prominent as the hook that introduces it', () => {
    /*
     * The finding that started this: the hook headline was 96px and the
     * transformation was 66px, so the orientation line was typographically
     * louder than the thing the piece exists to show.
     */
    const HOOK_HEADLINE = 96;
    const after = CARD_TYPE.after.size * cardDensityScale(real, BAND, 'normal');
    expect(after).toBeGreaterThanOrEqual(HOOK_HEADLINE);
  });
});

describe('missing content invents nothing', () => {
  it('reserves no space for a reason that does not exist', () => {
    const withReason = cardHeightAt({ ...noReason, reason: 'because' }, BAND.width, 1);
    const without = cardHeightAt(noReason, BAND.width, 1);
    expect(without).toBeLessThan(withReason);
  });

  it('sizes a card with no reason on what it actually has', () => {
    // Not "same as a card with a reason, with a gap where the reason would be".
    expect(cardDensityScale(noReason, BAND, 'normal')).toBeGreaterThanOrEqual(
      cardDensityScale({ ...noReason, reason: 'a fairly long explanation of the swap' }, BAND, 'normal'),
    );
  });

  it('returns a neutral scale when there is no content at all', () => {
    expect(cardDensityScale({}, BAND, 'normal')).toBe(1);
  });

  it('does not divide by a band that does not exist', () => {
    expect(cardDensityScale(real, { width: 0, height: 0 }, 'normal')).toBe(1);
  });
});

describe('the floor', () => {
  it('exists, so a pathological card shrinks rather than being clipped', () => {
    const monstrous = { before: 'a'.repeat(600), after: 'b'.repeat(600), reason: 'c'.repeat(900) };
    const scale = cardDensityScale(monstrous, BAND, 'normal');
    expect(scale).toBeLessThan(CARD_SCALE_MIN);
    expect(fits(monstrous, scale)).toBe(true);
  });
});
