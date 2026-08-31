/**
 * §424. An inversion needs something short to invert.
 *
 * `lead_emphasis` sets the headline small in caps as a label and gives the
 * display size to the first body line. That is a good move for a short headline
 * and a bad one for a long one: rendered at the size a phone actually shows a
 * 4:5 card, "REFRIGERATORS MAKE BREAD GO STALE FASTER" wraps to two lines of
 * small caps and reads as a label that has outgrown its job.
 *
 * Found by rendering all seven layouts side by side at 420px wide.
 */
import { describe, expect, it } from 'vitest';
import { chooseLayout } from './layouts.js';

const base = { role: 'detail' as const, bodyLineCount: 2, recentLayouts: [] };

describe('when lead_emphasis is offered', () => {
  it('is refused for a headline too long to be a label', () => {
    const picks = new Set<string>();
    for (let i = 0; i < 8; i += 1) {
      picks.add(
        chooseLayout({ ...base, headlineWords: 8, recentLayouts: [...picks] as never }).layout,
      );
    }
    expect(picks.has('lead_emphasis')).toBe(false);
  });

  it('is still available for a short one', () => {
    /* Exhaust the pool by recency; if it is ever reachable it appears here. */
    const picks: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      picks.push(chooseLayout({ ...base, headlineWords: 4, recentLayouts: picks as never }).layout);
    }
    expect(picks).toContain('lead_emphasis');
  });

  it('keeps the old behaviour when the caller does not say', () => {
    /*
     * A caller that cannot measure must not silently lose a layout — that is
     * how a pool quietly shrinks and nobody notices.
     */
    const picks: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      picks.push(chooseLayout({ ...base, recentLayouts: picks as never }).layout);
    }
    expect(picks).toContain('lead_emphasis');
  });

  it('never empties the pool', () => {
    /* Every layout refused would leave nothing to render. */
    for (const words of [1, 7, 8, 30]) {
      expect(chooseLayout({ ...base, headlineWords: words }).layout).toBeTruthy();
    }
  });
});
