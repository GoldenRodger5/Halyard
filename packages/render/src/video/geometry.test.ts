import { describe, expect, it } from 'vitest';
import { aspectForRender } from '@halyard/core';
import { chooseVideoComposition } from './artifactProps.js';
import { aspectOf, geometryFor, LANDSCAPE_SUFFIX } from './geometry.js';
import {
  bandFor,
  CAPTION_BAND_TOP_PERCENT,
  EDITORIAL_PRESENTATION,
  SAFE_PERCENT,
} from './treatments.js';

const PORTRAIT = { width: 1080, height: 1920 };
const LANDSCAPE = { width: 1920, height: 1080 };

describe('aspectOf', () => {
  it('classifies the four canvases', () => {
    expect(aspectOf(PORTRAIT)).toBe('9:16');
    expect(aspectOf(LANDSCAPE)).toBe('16:9');
    expect(aspectOf({ width: 1080, height: 1080 })).toBe('1:1');
    expect(aspectOf({ width: 1080, height: 1350 })).toBe('4:5');
  });

  it('goes by ratio, so a 720p render is still landscape', () => {
    // A composition asked for an unusual size must land on the nearest sane
    // geometry rather than falling through to portrait, which is what a
    // dimension-matching implementation would do.
    expect(aspectOf({ width: 1280, height: 720 })).toBe('16:9');
    expect(aspectOf({ width: 720, height: 1280 })).toBe('9:16');
  });
});

describe('portrait is unchanged', () => {
  /*
   * §222. The whole risk of resolving geometry from the frame is that it
   * quietly moves the frame every existing render was composed against. These
   * are regression guards, not descriptions: portrait must reproduce the
   * constants exactly.
   */
  it('resolves to the constants the package shipped with', () => {
    const g = geometryFor(PORTRAIT);
    expect(g.safeTopPercent).toBe(SAFE_PERCENT);
    expect(g.safeBottomPercent).toBe(SAFE_PERCENT);
    expect(g.captionBandTopPercent).toBe(CAPTION_BAND_TOP_PERCENT);
    expect(g.contentMaxWidthPercent).toBe(100);
    expect(g.typeScale).toBe(1);
    expect(g.anchorOverride).toBeUndefined();
  });

  it('produces the band the old arithmetic produced', () => {
    for (const hasCaptions of [true, false]) {
      const top = Math.round((SAFE_PERCENT / 100) * PORTRAIT.height);
      const bottom = Math.round(
        ((hasCaptions ? 100 - CAPTION_BAND_TOP_PERCENT : SAFE_PERCENT) / 100) * PORTRAIT.height,
      );
      expect(bandFor(PORTRAIT, hasCaptions)).toEqual({
        width: PORTRAIT.width - EDITORIAL_PRESENTATION.padding * 2,
        height: PORTRAIT.height - top - bottom,
      });
    }
  });
});

describe('landscape', () => {
  it('caps the column well inside the gutters', () => {
    /*
     * The point of the cap. Padding alone cannot fix a landscape measure:
     * 1920 less two gutters is still nearly thirty words across, so the
     * column has to be the narrower of the two.
     */
    const band = bandFor(LANDSCAPE, true);
    const gutters = LANDSCAPE.width - EDITORIAL_PRESENTATION.padding * 2;
    expect(band.width).toBeLessThan(gutters);
    expect(band.width).toBeLessThanOrEqual(1200);
  });

  it('gives back more of the frame than a phone layout would', () => {
    // Portrait reserves 12% top and 28% bottom against UI a YouTube player
    // does not draw. Landscape must not pay for chrome that is not there.
    const g = geometryFor(LANDSCAPE);
    expect(g.safeTopPercent).toBeLessThan(SAFE_PERCENT);
    expect(g.captionBandTopPercent).toBeGreaterThan(CAPTION_BAND_TOP_PERCENT);
  });

  it('centres rather than keeping the phone anchor', () => {
    // Bottom-anchoring puts words near the thumb on a phone. On a 16:9 frame
    // it strands a third of the picture empty above the content.
    expect(geometryFor(LANDSCAPE).anchorOverride).toBe('center');
    expect(geometryFor(PORTRAIT).anchorOverride).toBeUndefined();
  });

  it('scales type up, because 96px on a 1080-tall frame reads small', () => {
    expect(geometryFor(LANDSCAPE).typeScale).toBeGreaterThan(1);
    // ...but not so far that a hook becomes a title card. The first value
    // derived from the height ratio was 1.6 and did exactly that.
    expect(geometryFor(LANDSCAPE).typeScale).toBeLessThan(1.4);
  });
});

describe('chooseVideoComposition and the canvas', () => {
  /*
   * §222. The wiring, not the geometry. A landscape slot that quietly renders
   * a portrait video is the failure this guards: YouTube would classify the
   * result as a Short, which is precisely the mismatch `resolveVariant`
   * exists to report — except nobody would ever see it reported, because the
   * render would have succeeded.
   */
  const artifact = {
    headline: 'Sally’s Artisan Bread, gluten-free',
    highlights: [
      {
        type: 'swap',
        before: '3 1/4 cups bread flour',
        after: '3 1/4 cups gluten-free bread flour blend',
        text: 'A 1:1 blend with xanthan gum keeps the dough workable.',
      },
    ],
  } as unknown as Parameters<typeof chooseVideoComposition>[0];

  it('picks the portrait composition by default', () => {
    expect(chooseVideoComposition(artifact, ['TransformationDiff'])?.id).toBe(
      'TransformationDiff',
    );
  });

  it('picks the landscape twin when the piece is landscape', () => {
    expect(
      chooseVideoComposition(
        artifact,
        ['TransformationDiff', `TransformationDiff${LANDSCAPE_SUFFIX}`],
        '16:9',
      )?.id,
    ).toBe(`TransformationDiff${LANDSCAPE_SUFFIX}`);
  });

  it('refuses rather than falling back to portrait for a landscape slot', () => {
    // The whole point. A 9:16 file in a long-form slot publishes as a Short.
    expect(chooseVideoComposition(artifact, ['TransformationDiff'], '16:9')).toBeNull();
  });
});

describe('aspectForRender', () => {
  it('is landscape only for YouTube long-form', () => {
    expect(aspectForRender('youtube', 'long_form')).toBe('16:9');
    expect(aspectForRender('youtube', 'short')).toBe('9:16');
    expect(aspectForRender('tiktok', 'script')).toBe('9:16');
  });

  it('does not read a platform capability as an instruction', () => {
    /*
     * Threads accepts 16:9. That is a capability, not a request, and gotcha 5
     * is the same mistake in a different table: `capability_state = 'live'`
     * does not mean connected either.
     */
    expect(aspectForRender('threads', 'post')).toBe('9:16');
  });
});
