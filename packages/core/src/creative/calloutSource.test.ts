/**
 * §303. A callout must be right about *when*, not only about *where*.
 *
 * The cut removes the elided stretches, so a raw offset and a footage offset
 * are different numbers. Pointing at the right control at the wrong moment
 * looks like a rendering glitch rather than a bug, and no gate here would catch
 * it — which is exactly why it is tested.
 */
import { describe, it, expect } from 'vitest';
import { calloutSourceFromCapture, type CapturedStep, type FootageSpan } from './plan.js';

const span = (startMs: number, endMs: number): FootageSpan => ({ startMs, endMs, steps: [] });

describe('calloutSourceFromCapture', () => {
  it('maps a step into cut time, not recording time', () => {
    /* Two kept spans with 20s of elided wait between them. */
    const spans = [span(0, 5_000), span(25_000, 31_000)];
    const steps: CapturedStep[] = [
      { step: 'paste the URL', ok: true, startMs: 1_000, endMs: 1_400 },
      { step: 'reveal the swap', ok: true, startMs: 26_000, endMs: 27_000 },
    ];

    const out = calloutSourceFromCapture(steps, spans);
    expect(out[0]!.atSeconds).toBe(1);
    /* 5s of the first span, then 1s into the second — not 26. */
    expect(out[1]!.atSeconds).toBe(6);
  });

  it('drops a step that no kept span contains', () => {
    /* It is not on screen, so there is nothing honest to point at. */
    const out = calloutSourceFromCapture(
      [{ step: 'wait for the adaptation', ok: true, startMs: 9_000, endMs: 24_000 }],
      [span(0, 5_000), span(25_000, 31_000)],
    );
    expect(out).toHaveLength(0);
  });

  it('withholds screen time from setup, as §166 requires', () => {
    const out = calloutSourceFromCapture(
      [{ step: 'dismiss the banner', ok: true, setup: true, startMs: 500, endMs: 800 }],
      [span(0, 5_000)],
    );
    expect(out).toHaveLength(0);
  });

  it('carries the tap point through, and null when there was no tap', () => {
    const out = calloutSourceFromCapture(
      [
        { step: 'tap gluten-free', ok: true, startMs: 1_000, endMs: 1_200, at: { x: 0.5, y: 0.62, width: 0.34, height: 0.06 } },
        { step: 'the result settles', ok: true, startMs: 2_000, endMs: 2_400 },
      ],
      [span(0, 5_000)],
    );
    expect(out[0]!.at).toEqual({ x: 0.5, y: 0.62, width: 0.34, height: 0.06 });
    expect(out[1]!.at).toBeNull();
  });

  it('prefers the flow’s narration over the step name', () => {
    const out = calloutSourceFromCapture(
      [
        {
          step: 'switch to the Link tab',
          narration: 'Any recipe URL on the internet.',
          ok: true,
          startMs: 100,
          endMs: 300,
        },
      ],
      [span(0, 5_000)],
    );
    expect(out[0]!.label).toBe('Any recipe URL on the internet.');
  });

  it('ignores a step that failed', () => {
    const out = calloutSourceFromCapture(
      [{ step: 'tap adapt', ok: false, startMs: 1_000, endMs: 1_200 }],
      [span(0, 5_000)],
    );
    expect(out).toHaveLength(0);
  });
});
