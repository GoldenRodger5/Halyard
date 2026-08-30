/**
 * §374. A gate name that outgrows its column runs into the summary beside it.
 *
 * "Destinationno link" and "Coherencenothing rendered" were on the review
 * screen, and they are the kind of defect a screenshot finds and a test never
 * does — nothing threw, nothing was missing, and both strings were correct.
 * What can be asserted is the arithmetic underneath: the column has to be wide
 * enough for the longest name the gates actually have.
 */
import { describe, expect, it } from 'vitest';
import { GATE_NAMES } from '@halyard/core';

/**
 * Tailwind's `w-20` is 5rem, and the type is `text-xs` in a mono face where a
 * character is close to 0.6em — so roughly 13 characters, less the `pr-1` gap.
 */
const COLUMN_CHARS = 13;

describe('the gate name column', () => {
  it('fits every gate this system has', () => {
    const tooLong = GATE_NAMES.filter((name) => name.length > COLUMN_CHARS);
    expect(tooLong).toEqual([]);
  });

  it('leaves room, so a new gate does not silently collide', () => {
    /*
     * The failure mode is not "it looks tight"; it is that the summary starts
     * mid-word with no space. A name arriving within a character of the limit
     * should be noticed when it is added rather than in a screenshot later.
     */
    const longest = Math.max(...GATE_NAMES.map((n) => n.length));
    expect(longest).toBeLessThanOrEqual(COLUMN_CHARS - 1);
  });
});
