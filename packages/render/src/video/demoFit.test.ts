/**
 * §168. Fitting a fixed-aspect recording into a fixed-aspect band.
 *
 * Unlike the transformation cards, this one has no arrangement that removes the
 * slack: a video's aspect ratio is a property of the file, so if it differs
 * from the band's, one dimension has room left over. What *is* fixable is the
 * silent failure — `BeatStage` clips overflow, so a recording taller than its
 * band lost its bottom edge with nothing to say so.
 */
import { describe, expect, it } from 'vitest';
import {
  BEFORE_AFTER_TREATMENTS,
  CARD_TYPE,
  NOTE_TYPE,
  CAPTION_BAND_TOP_PERCENT,
  PAGE_PADDING,
  SAFE_PERCENT,
  bandFor,
} from './treatments.js';
import { FLOWS } from '@halyard/core';

const FRAME = { width: 1080, height: 1920 };

/**
 * The bounds the real treatment puts on its video element.
 *
 * Read out of the component's own output rather than recomputed here. The first
 * version of this file mirrored the rule instead, and a tamper that deleted
 * `maxHeight` from the component left every assertion green — the exact shape of
 * failure the production audit named: a test satisfied by its own copy of the
 * logic while the thing it guards is broken.
 */
function videoBounds(
  media: { width: number; height: number },
  band: { width: number; height: number },
  hasLabel = true,
): { maxWidth: number; maxHeight: number } {
  const Demo = BEFORE_AFTER_TREATMENTS.demo!;
  const beat = {
    id: 'demo',
    role: 'demo',
    weight: 3,
    minSeconds: 3,
    media: { file: 'capture/x.mp4', ...(hasLabel ? { label: 'In the product' } : {}) },
  };
  const tree = Demo({ beat, brand: { muted: '#888', primary: '#c00' }, band } as never);

  // Walk the returned element tree for the node carrying the video's style.
  const found: Array<Record<string, unknown>> = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const el = node as { props?: Record<string, unknown> };
    const style = el.props?.style as Record<string, unknown> | undefined;
    if (style && ('maxHeight' in style || 'maxWidth' in style)) found.push(style);
    if (el.props?.children) visit(el.props.children);
  };
  visit(tree);

  const style = found[0];
  if (!style) throw new Error('the footage treatment sets no bounds on its video');
  return {
    maxWidth: Number(style.maxWidth ?? Number.POSITIVE_INFINITY),
    maxHeight: Number(style.maxHeight ?? Number.POSITIVE_INFINITY),
  };
}

/** What that resolves to for a given recording, at the video's own aspect. */
function fitted(
  media: { width: number; height: number },
  band: { width: number; height: number },
  hasLabel = true,
): { width: number; height: number } {
  const { maxWidth, maxHeight } = videoBounds(media, band, hasLabel);
  const scale = Math.min(maxWidth / media.width, maxHeight / media.height, 1);
  return { width: media.width * scale, height: media.height * scale };
}

describe('the content band', () => {
  it('is stated once and excludes the caption band', () => {
    const band = bandFor(FRAME, true);
    expect(band.width).toBe(FRAME.width - PAGE_PADDING * 2);
    expect(band.height).toBe(
      FRAME.height -
        Math.round((SAFE_PERCENT / 100) * FRAME.height) -
        Math.round(((100 - CAPTION_BAND_TOP_PERCENT) / 100) * FRAME.height),
    );
  });

  it('gives a beat more room when there are no captions to clear', () => {
    expect(bandFor(FRAME, false).height).toBeGreaterThan(bandFor(FRAME, true).height);
  });
});

describe('footage fits inside its band', () => {
  const band = bandFor(FRAME, true);

  it.each([
    ['portrait phone capture', { width: 1080, height: 2342 }],
    ['landscape desktop capture', { width: 1080, height: 900 }],
    ['square', { width: 1080, height: 1080 }],
    ['very wide', { width: 1920, height: 400 }],
  ])('never overflows the band for a %s', (_name, media) => {
    /*
     * The invariant. Overflow is not a visual blemish here — `BeatStage` hides
     * it, so the bottom of a product demonstration disappears silently.
     */
    const box = fitted(media, band);
    expect(box.width).toBeLessThanOrEqual(band.width + 0.001);
    expect(box.height).toBeLessThanOrEqual(band.height - 44 + 0.001);
  });

  it('preserves the recording’s aspect ratio exactly', () => {
    // No distortion: a stretched interface is a lie about the product.
    for (const media of [
      { width: 1080, height: 2342 },
      { width: 1080, height: 900 },
    ]) {
      const box = fitted(media, band);
      expect(box.width / box.height).toBeCloseTo(media.width / media.height, 4);
    }
  });

  it('does not upscale a recording past its own resolution', () => {
    // Blowing a small capture up to fill the band would trade real pixels for
    // blur and call it an improvement.
    const box = fitted({ width: 300, height: 400 }, band);
    expect(box.width).toBeLessThanOrEqual(300);
  });

  it('fills the band’s height for a portrait capture, which is the point', () => {
    const box = fitted({ width: 1080, height: 2342 }, band);
    expect(box.height).toBeCloseTo(band.height - 44, 0);
  });

  it('bounds the video in both dimensions, so it cannot be clipped away', () => {
    /*
     * Asserted on the component's own output. Removing either bound must fail
     * here — a video with no height bound overflows the band and `BeatStage`
     * hides the overflow, so the bottom of the demonstration simply vanishes.
     */
    const bounds = videoBounds({ width: 1080, height: 2342 }, band);
    expect(Number.isFinite(bounds.maxHeight)).toBe(true);
    expect(Number.isFinite(bounds.maxWidth)).toBe(true);
    expect(bounds.maxHeight).toBeLessThanOrEqual(band.height);
    expect(bounds.maxWidth).toBeLessThanOrEqual(band.width);
  });

  it('leaves room for the label when there is one', () => {
    const withLabel = fitted({ width: 1080, height: 2342 }, band, true);
    const without = fitted({ width: 1080, height: 2342 }, band, false);
    expect(without.height).toBeGreaterThan(withLabel.height);
  });
});

describe('the capture shape', () => {
  it('records adapt_and_reveal at a portrait viewport', () => {
    /*
     * The root cause, fixed at the source. A 1280×900 window is 1.42:1 against
     * a 0.81:1 band; no fitting rule reconciles those, and cropping the desktop
     * layout to portrait cuts the second ingredient column, which is evidence.
     */
    const vp = FLOWS.adapt_and_reveal.viewport;
    expect(vp.height).toBeGreaterThan(vp.width);
  });

  it('carries no focus region describing a layout it no longer captures', () => {
    // A region measured against a desktop window would crop the wrong part of
    // a phone one. Absent is honest; stale is not.
    expect(FLOWS.adapt_and_reveal.focusRegion).toBeUndefined();
  });

  it('leaves flows that never had a focus region alone', () => {
    expect(FLOWS.cook_mode_timer.focusRegion).toBeUndefined();
    expect(FLOWS.cook_mode_timer.viewport.height).toBeGreaterThan(
      FLOWS.cook_mode_timer.viewport.width,
    );
  });
});

describe('the refusal survives', () => {
  it('still renders nothing when a demo beat has no footage', () => {
    const Demo = BEFORE_AFTER_TREATMENTS.demo!;
    const beat = { id: 'demo', role: 'demo', weight: 3, minSeconds: 3.6 };
    expect(Demo({ beat, brand: {}, band: bandFor(FRAME, true) } as never)).toBeNull();
  });
});

/**
 * §169. The evidence note.
 */
describe('the evidence note', () => {
  const band = bandFor(FRAME, true);
  const Note = BEFORE_AFTER_TREATMENTS.proof!;
  const brand = { muted: '#888', primary: '#c00', ink: '#111', headingFont: 'serif' };

  /** The note's rendered body size, read out of the treatment's own output. */
  function bodySize(text: string | undefined, emphasis?: string): number | null {
    const beat = { id: 'proof', role: 'proof', weight: 2, minSeconds: 2.4, emphasis, content: { text } };
    const tree = Note({ beat, brand, band } as never);
    if (tree === null) return null;
    const sizes: number[] = [];
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      const el = node as { props?: Record<string, unknown> };
      const style = el.props?.style as Record<string, unknown> | undefined;
      if (style && typeof style.fontSize === 'number') sizes.push(style.fontSize as number);
      if (el.props?.children) visit(el.props.children);
    };
    visit(tree);
    // The body is the largest text in the note; the label is a fixed eyebrow.
    return sizes.length ? Math.max(...sizes) : null;
  }

  it('renders nothing when the artifact carried no reason', () => {
    /*
     * The planner only emits this beat when a change explains itself, so an
     * empty one means something upstream changed. A lone "WHY" over blank
     * ground would be the layout equivalent of inventing evidence.
     */
    expect(bodySize(undefined)).toBeNull();
    expect(bodySize('   ')).toBeNull();
  });

  it('scales a short explanation up rather than leaving it stranded', () => {
    // The measured defect: 21% of the band against 56–60% for the cards.
    const short = bodySize('It keeps the crumb soft.')!;
    expect(short).toBeGreaterThan(NOTE_TYPE.body.size);
  });

  it('scales a long explanation down rather than clipping it', () => {
    const long = bodySize('x'.repeat(700))!;
    expect(long).toBeLessThan(NOTE_TYPE.body.size);
  });

  it('honours the planner’s emphasis', () => {
    const text = 'Oat milk is the go-to dairy-free swap here; scaled for four servings.';
    expect(bodySize(text, 'hold')!).toBeGreaterThan(bodySize(text, 'quick')!);
  });

  it('stays subordinate to a transformation at the same density', () => {
    /*
     * The change is the claim; this explains it. The explanation must never be
     * set larger than the thing it explains.
     */
    expect(NOTE_TYPE.body.size).toBeLessThan(CARD_TYPE.after.size);
  });

  it('is deterministic', () => {
    const t = 'A flax egg binds the oatmeal without any animal products.';
    expect(bodySize(t)).toBe(bodySize(t));
  });
});
