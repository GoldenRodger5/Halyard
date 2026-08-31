/**
 * §417. A long line arrives in parts rather than sitting whole.
 *
 * The spec asks for "short text moments" and the removal of dead air, and says
 * explicitly to optimise for attention **without blindly forcing a fixed cut
 * rate** (§11.4). A thirteen-word sentence held for five seconds is one long
 * text moment: said aloud it is fine, read it is finished in two seconds and
 * then sits there.
 */
import { describe, expect, it } from 'vitest';
import { splitLongLine } from './formatVideo.js';

const LONG =
  'Staling is a chemical and physical process, and it runs fastest at temperatures just above freezing.';

describe('splitting a long line', () => {
  it('breaks a long, slow line at its clause boundary', () => {
    const parts = splitLongLine(LONG, 6);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('Staling is a chemical and physical process,');
    expect(parts[1]).toBe('and it runs fastest at temperatures just above freezing.');
  });

  it('leaves a short line alone', () => {
    expect(splitLongLine('Sourdough was probably a mistake.', 4)).toEqual([
      'Sourdough was probably a mistake.',
    ]);
  });

  it('leaves a long line that is spoken quickly alone', () => {
    /* Both conditions matter: a line that does not sit is not sitting. */
    expect(splitLongLine(LONG, 2)).toEqual([LONG]);
  });

  it('never breaks mid-clause', () => {
    /*
     * A break between "temperatures just" and "above freezing" is worse than no
     * break, so a line with no honest boundary keeps its length.
     */
    const noBoundary = 'Refrigeration accelerates staling in bread far more than room temperature does';
    expect(splitLongLine(noBoundary, 6)).toEqual([noBoundary]);
  });

  it('refuses a break that would leave a fragment', () => {
    const lopsided = 'Yes, gluten is a protein found in wheat barley and rye grains everywhere';
    const parts = splitLongLine(lopsided, 6);
    /* "Yes," is not a text moment. */
    expect(parts.every((p) => p.trim().split(/\s+/).length >= 3)).toBe(true);
  });

  it('loses no words', () => {
    const rejoined = splitLongLine(LONG, 6).join(' ');
    expect(rejoined.replace(/\s+/g, ' ')).toBe(LONG.replace(/\s+/g, ' '));
  });
});
