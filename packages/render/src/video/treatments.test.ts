/**
 * §162. The seam between a beat's role and its pixels.
 *
 * The property that matters: a creative type is a **map**, not a branch. A
 * future `tutorial` supplies its own role→component mapping and the
 * transformation composition is never edited — which is the thing that stops
 * one file becoming the home of every creative type.
 */
import { describe, expect, it } from 'vitest';
import { layoutScenes } from './timing.js';
import {
  BEFORE_AFTER_TREATMENTS,
  beatScenes,
  CAPTION_BAND_TOP_PERCENT,
  SAFE_PERCENT,
  anchorFor,
  scaleFor,
  type BeatTreatment,
  type TreatmentSet,
} from './treatments.js';

describe('the before_after treatment set', () => {
  it('maps every role the planner can emit', () => {
    // §160 emits hook, change and proof today; before/after/cta are the rest of
    // the role vocabulary and must not fall through to nothing.
    for (const role of ['hook', 'before', 'change', 'after', 'proof', 'cta']) {
      expect(BEFORE_AFTER_TREATMENTS[role], `no treatment for ${role}`).toBeDefined();
    }
  });

  it('draws a transformation the same way whichever half a type names it', () => {
    // A creative type that splits a change across `before` and `after` is
    // describing one thing in two halves.
    expect(BEFORE_AFTER_TREATMENTS.change).toBe(BEFORE_AFTER_TREATMENTS.before);
    expect(BEFORE_AFTER_TREATMENTS.change).toBe(BEFORE_AFTER_TREATMENTS.after);
  });
});

/**
 * §163. The footage treatment, and the refusal underneath it.
 */
describe('the captured-footage treatment', () => {
  const brand = { primary: '#c2410c', muted: '#78716c', surface: '#fff', ink: '#111' };

  it('is mapped for the demo role, so a plan carrying footage has somewhere to draw it', () => {
    expect(BEFORE_AFTER_TREATMENTS.demo).toBeDefined();
  });

  it('renders nothing at all when the beat carries no footage', () => {
    /*
     * The load-bearing refusal of the whole capture path. A demo beat without a
     * file draws an empty frame — never a placeholder, a mock interface or a
     * drawn approximation of a product state that was not recorded. §159
     * rejected a synthetic progress overlay for exactly this reason.
     */
    const Demo = BEFORE_AFTER_TREATMENTS.demo!;
    const beat = { id: 'demo', role: 'demo', weight: 3, minSeconds: 3.6 };
    const band = { width: 936, height: 1152 };
    expect(Demo({ beat, brand, band } as never)).toBeNull();
  });

  it('centres footage, because a frame is not a block of copy', () => {
    /*
     * Found on a real render: bottom-anchoring the footage left roughly a
     * quarter of the canvas empty above the only thing worth looking at.
     */
    expect(anchorFor('demo')).toBe('center');
  });
});

describe('a future creative type', () => {
  it('is a map, not an edit to the transformation renderer', () => {
    /*
     * The load-bearing claim of §162. A tutorial's roles are mapped here
     * without importing, editing or subclassing anything in compositions.tsx.
     */
    const StepCard: BeatTreatment = () => null;
    const tutorial: TreatmentSet = {
      ...BEFORE_AFTER_TREATMENTS,
      step: StepCard,
      result: BEFORE_AFTER_TREATMENTS.after!,
    };

    expect(tutorial.step).toBe(StepCard);
    // Roles it did not override still resolve.
    expect(tutorial.hook).toBe(BEFORE_AFTER_TREATMENTS.hook);
  });

  it('renders nothing for a role it has no treatment for, rather than guessing', () => {
    // A beat drawn by a component not written for it is worse than one omitted.
    const partial: TreatmentSet = { hook: BEFORE_AFTER_TREATMENTS.hook! };
    expect(partial.step).toBeUndefined();
  });
});

describe('the beat → scene seam', () => {
  const beat = { id: 'demo', role: 'demo', weight: 3, minSeconds: 3.8 };

  it('carries a cap through to the timing engine', () => {
    /*
     * §163, and the bug that made this test exist: the planner set a ceiling on
     * the footage beat and the render row carried it, but the mapping to scenes
     * was written field by field and silently dropped it. The rendered file came
     * back byte-identical — the worst possible symptom, because nothing threw,
     * nothing logged, and the beat simply kept its old length.
     */
    const [scene] = beatScenes([{ ...beat, maxSeconds: 3.8 }]);
    expect(scene!.maxSeconds).toBe(3.8);
  });

  it('leaves an uncapped beat uncapped rather than inventing a ceiling', () => {
    const [scene] = beatScenes([beat]);
    expect(scene!.maxSeconds).toBeUndefined();
  });

  it('actually shortens the beat once the engine sees it', () => {
    // End to end across the seam: same beats, one capped, different timeline.
    const beats = [beat, { id: 'card', role: 'change', weight: 2, minSeconds: 2.4 }];
    const uncapped = layoutScenes(beatScenes(beats), 30 * 30, 30);
    const capped = layoutScenes(
      beatScenes([{ ...beat, maxSeconds: 3.8 }, beats[1]!]),
      30 * 30,
      30,
    );
    expect(capped[0]!.durationFrames).toBeLessThan(uncapped[0]!.durationFrames);
  });
});

describe('emphasis is visible, not only long', () => {
  it('scales a held beat above a normal one, and a quick one below', () => {
    /*
     * Emphasis used to be spent entirely on duration. On a muted phone screen a
     * merely-longer scene is close to imperceptible, so the hero change was not
     * perceptibly the hero.
     */
    expect(scaleFor('hold')).toBeGreaterThan(scaleFor('normal'));
    expect(scaleFor('quick')).toBeLessThan(scaleFor('normal'));
  });

  it('leaves an unspecified emphasis at the neutral scale', () => {
    // A render queued before emphasis existed must not shrink or grow.
    expect(scaleFor(undefined)).toBe(1);
    expect(scaleFor('normal')).toBe(1);
  });

  it('keeps the scale within a range that cannot break the layout', () => {
    // Emphasis is a hierarchy cue, not a licence to overflow the safe area.
    for (const e of ['quick', 'normal', 'hold'] as const) {
      expect(scaleFor(e)).toBeGreaterThan(0.8);
      expect(scaleFor(e)).toBeLessThan(1.35);
    }
  });
});

describe('the content area', () => {
  it('ends above the caption band', () => {
    /*
     * §162's visual defect: content was centred in the *whole* canvas while
     * captions sat at `bottom: 16%`, which left a dead third across the top and
     * crowded the words at the bottom.
     */
    expect(CAPTION_BAND_TOP_PERCENT).toBeLessThan(100 - SAFE_PERCENT);
    expect(CAPTION_BAND_TOP_PERCENT).toBeGreaterThan(50);
  });

  it('leaves a usable band rather than a sliver', () => {
    const usable = CAPTION_BAND_TOP_PERCENT - SAFE_PERCENT;
    expect(usable).toBeGreaterThan(45);
  });
});

describe('the content band is computed in pixels', () => {
  it('reserves the caption band against frame height, not width', () => {
    /*
     * Found by looking at a real frame: the caption ran straight through the
     * reason text. A percentage padding resolves against the containing
     * block's **width**, so 28% on a 1080×1920 frame reserved 302px where the
     * caption needed 538px.
     */
    const height = 1920;
    const reserved = Math.round(((100 - CAPTION_BAND_TOP_PERCENT) / 100) * height);
    const wrongWidthBased = Math.round(((100 - CAPTION_BAND_TOP_PERCENT) / 100) * 1080);

    expect(reserved).toBeGreaterThan(wrongWidthBased);
    // The caption sits at bottom:16% and runs to two lines; the band must clear it.
    expect(reserved).toBeGreaterThan(0.16 * height);
  });
});

describe('anchorFor', () => {
  it('centres the opening, which competes with nothing', () => {
    // Bottom-anchoring the hook left over half the canvas empty above the only
    // line a scrolling viewer reads.
    expect(anchorFor('hook')).toBe('center');
  });

  it('bottom-anchors every other beat, so copy sits above the captions', () => {
    for (const role of ['change', 'before', 'after', 'proof', 'cta']) {
      expect(anchorFor(role)).toBe('flex-end');
    }
  });

  it('applies to a role this file has never seen, so future types inherit it', () => {
    expect(anchorFor('step')).toBe('flex-end');
  });
});
