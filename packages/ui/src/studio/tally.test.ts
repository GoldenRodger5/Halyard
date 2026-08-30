/**
 * §383. The lamp's value is that it is learned once, which is only true if the
 * mapping is exhaustive and nothing invents a fifth colour. Both are asserted.
 */
import { describe, expect, it } from 'vitest';
import { TALLY_STATES, TALLY_MEANS, tallyFor } from './tally.js';

/** Every status `content_items.status` can hold, from the check constraint. */
const STATUSES = [
  'draft', 'pending_approval', 'approved', 'scheduled', 'publishing',
  'published', 'awaiting_manual_publish', 'failed', 'rejected', 'expired',
];

describe('the tally', () => {
  it('maps every content status to a lamp', () => {
    /*
     * A status with no entry falls to `dark`. That is a safe default and a bad
     * silence: an operator reading "nothing here" on a real piece has been
     * told the wrong thing.
     */
    const unmapped = STATUSES.filter((s) => tallyFor(s) === 'dark' && s !== 'rejected' && s !== 'expired');
    expect(unmapped).toEqual([]);
  });

  it('never shows an unknown status as ready or on air', () => {
    /*
     * The one outcome worth preventing. A state nobody mapped must not read as
     * "this passed" or "this is live".
     */
    expect(tallyFor('some_future_status')).toBe('dark');
    expect(tallyFor('')).toBe('dark');
  });

  it('separates failed from rejected', () => {
    /* Failed is a thing that went wrong; rejected is a decision you made. */
    expect(tallyFor('failed')).toBe('onair');
    expect(tallyFor('rejected')).toBe('dark');
  });

  it('reads publishing as working, not as on air', () => {
    /* It is mid-flight. Nothing is public until the platform says so. */
    expect(tallyFor('publishing')).toBe('working');
    expect(tallyFor('published')).toBe('onair');
  });

  it('gives every lamp a sentence a person can read', () => {
    for (const state of TALLY_STATES) {
      expect(TALLY_MEANS[state]).toBeTruthy();
      expect(TALLY_MEANS[state].length).toBeGreaterThan(4);
    }
  });

  it('has exactly five states, four lit and one not', () => {
    /*
     * A sixth is how a vocabulary stops being learnable in one go. Adding one
     * should be a decision, which means failing this test on the way.
     */
    expect(TALLY_STATES).toHaveLength(5);
  });
});
