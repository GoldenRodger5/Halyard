/**
 * §311. The licence is the one field where trusting the API is not enough.
 *
 * A rendering bug ships an ugly video. A licence mistake ships a video the
 * account is not allowed to have published, and finds out later.
 */
import { describe, it, expect } from 'vitest';
import { BED_MOODS } from './director.js';
import { BED_SEARCHES, searchCc0Music } from './openverse.js';

function respond(results: unknown[]): typeof fetch {
  return (async () =>
    ({ ok: true, json: async () => ({ results }) }) as unknown as Response) as typeof fetch;
}

const track = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  title: 'A calm loop',
  url: 'https://cdn.example/a1.mp3',
  foreign_landing_url: 'https://freesound.org/s/1',
  license: 'cc0',
  creator: 'someone',
  duration: 90_000,
  provider: 'freesound',
  ...over,
});

describe('searchCc0Music', () => {
  it('drops anything the API did not mark cc0', async () => {
    /* Both filters are sent; this asserts the result is checked as well. */
    const out = await searchCc0Music({ query: 'x' }, respond([track({ license: 'by' })]));
    expect(out).toEqual([]);
  });

  it('drops a bed too short to cover a short video without an audible loop', async () => {
    const out = await searchCc0Music({ query: 'x' }, respond([track({ duration: 8_000 })]));
    expect(out).toEqual([]);
  });

  it('allows an unknown duration through rather than discarding it', async () => {
    /* The index often has no duration. Unknown is not the same as too short. */
    const out = await searchCc0Music({ query: 'x' }, respond([track({ duration: null })]));
    expect(out).toHaveLength(1);
    expect(out[0]!.durationSeconds).toBeNull();
  });

  it('carries the page a human can check the licence on', async () => {
    /*
     * "We believe this is CC0" and "the API said so and here is the page" are
     * different claims, and only the second survives being asked.
     */
    const out = await searchCc0Music({ query: 'x' }, respond([track()]));
    expect(out[0]!.foreignLandingUrl).toContain('freesound.org');
    expect(out[0]!.license).toBe('cc0');
  });

  it('drops a result with no audio url', async () => {
    const out = await searchCc0Music({ query: 'x' }, respond([track({ url: undefined })]));
    expect(out).toEqual([]);
  });

  it('covers every mood the bed selector can ask for', async () => {
    /*
     * A mood with no search is a mood that silently gets no bed, and
     * `selectBed` would then score every candidate as a mood mismatch and pick
     * one anyway — a calm explainer under a driving loop. Asserted against the
     * director's own vocabulary rather than a list copied beside it.
     */
    for (const mood of BED_MOODS) {
      expect(BED_SEARCHES[mood], `${mood} has no search`).toBeTruthy();
      expect(BED_SEARCHES[mood]!.energy).toBeGreaterThanOrEqual(0);
      expect(BED_SEARCHES[mood]!.energy).toBeLessThanOrEqual(1);
    }
  });
});
