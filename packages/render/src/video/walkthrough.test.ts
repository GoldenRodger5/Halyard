/**
 * §298. The walkthrough — spec §12's "animated UI demonstrations".
 *
 * A screenshot says a screen exists. A recording inside a device, with the
 * thing being explained pointed at as it happens, says what *using* it is like.
 * The risk is the pointer: a callout that names one thing while pointing at
 * another is worse than no callout, because it looks deliberate.
 */
import { describe, expect, it } from 'vitest';
import { calloutsFromSteps } from './walkthrough.js';

const steps = [
  { label: 'Paste any recipe link', atSeconds: 1.2, at: { x: 0.5, y: 0.3 } },
  { label: 'Pick what to avoid', atSeconds: 4.0, at: { x: 0.5, y: 0.55 } },
  { label: 'Every swap says why', atSeconds: 9.5, at: null },
  { label: '', atSeconds: 12.0 },
  { label: 'Save it', atSeconds: 14.0 },
  { label: 'Share it', atSeconds: 16.0 },
];

describe('callouts derived from what the capture actually did', () => {
  it('takes its timings from the recording, not from a guess', () => {
    /*
     * The whole reason this is derived. A hand-written callout points at a
     * moment somebody imagined; a derived one cannot point at a moment the
     * recording does not contain.
     */
    const out = calloutsFromSteps(steps);
    expect(out[0]!.atSeconds).toBe(1.2);
    expect(out[1]!.atSeconds).toBe(4.0);
  });

  it('drops a step with no label rather than pointing at nothing', () => {
    const out = calloutsFromSteps(steps);
    expect(out.every((c) => c.text.length > 0)).toBe(true);
  });

  it('keeps the anchor a step recorded, and null where it had none', () => {
    /* A remark about the whole step sits beside the device, not on a control. */
    const out = calloutsFromSteps(steps);
    expect(out[0]!.at).toEqual({ x: 0.5, y: 0.3 });
    expect(out[2]!.at).toBeNull();
  });

  it('caps how many appear, because a pointer is not a paragraph', () => {
    expect(calloutsFromSteps(steps).length).toBeLessThanOrEqual(4);
    expect(calloutsFromSteps(steps, { maxCallouts: 2 })).toHaveLength(2);
  });

  it('gives every callout a hold long enough to read and short enough to move on', () => {
    for (const c of calloutsFromSteps(steps)) {
      expect(c.holdSeconds).toBeGreaterThanOrEqual(1.5);
      expect(c.holdSeconds).toBeLessThanOrEqual(4);
    }
  });

  it('returns nothing when the capture recorded no labelled steps', () => {
    /* Better a clean recording than one annotated with invented moments. */
    expect(calloutsFromSteps([])).toHaveLength(0);
    expect(calloutsFromSteps([{ label: '   ', atSeconds: 1 }])).toHaveLength(0);
  });
});
