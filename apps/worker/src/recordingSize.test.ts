/**
 * §538. Playwright scales a page down into the video, never up.
 *
 * §321 recorded at twice the viewport, reasoning that `recordVideo.size` is
 * independent of the layout and that a bigger canvas was free resolution.
 * Playwright's own contract is that the picture is *"scaled down if necessary
 * to fit the specified size"* — so a 430×932 page in an 860×1864 canvas sat at
 * native size in the corner with the rest padded.
 *
 * The first walkthrough Halyard ever rendered was the consequence: a recipe
 * card in the top third of a phone frame and two thirds flat grey. Measured on
 * the cut footage, page content ~780×1150 inside 1080×2340. No test could have
 * caught it, because nothing asserted what the number was *for* — this one does.
 */
import { describe, expect, it } from 'vitest';

import { recordingSize } from './capture/runFlow.js';

describe('§538 the recording canvas matches the page', () => {
  it('records the phone viewport at its own size', () => {
    /* The flow every capture uses. Doubling this is what left the grey. */
    expect(recordingSize({ width: 430, height: 932 })).toEqual({ width: 430, height: 932 });
  });

  it('never asks for a canvas larger than the page, at any viewport', () => {
    for (const v of [
      { width: 430, height: 932 },
      { width: 390, height: 844 },
      { width: 1280, height: 720 },
    ]) {
      const size = recordingSize(v);
      expect(size.width, `${v.width}x${v.height} would pad`).toBeLessThanOrEqual(v.width);
      expect(size.height, `${v.width}x${v.height} would pad`).toBeLessThanOrEqual(v.height);
    }
  });

  it('keeps both dimensions even, because H.264 refuses an odd one', () => {
    const size = recordingSize({ width: 431, height: 933 });
    expect(size.width % 2).toBe(0);
    expect(size.height % 2).toBe(0);
  });
});
