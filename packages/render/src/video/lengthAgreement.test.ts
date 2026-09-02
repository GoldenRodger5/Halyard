/**
 * §439. The two copies of the duration arithmetic, held to each other.
 *
 * `@halyard/core`'s `creative/length.ts` predicts how long a piece will run so
 * that it can be budgeted while it is still text. This package computes how
 * long it *actually* runs. Those must be the same arithmetic or the budget is
 * fiction.
 *
 * They cannot be one function. Gotcha 10: this bundle is webpacked for the
 * browser by Remotion, and a Node-only import anywhere it can reach — including
 * through the `@halyard/core` barrel, which pulls `node:crypto` — builds,
 * typechecks, passes every test, and then fails at render time with
 * `UnhandledSchemeError`.
 *
 * So it is duplicated deliberately, and guarded the way gotcha 1 is guarded:
 * a test that fails the moment the two drift. A *test* file may import the
 * barrel freely — vitest is not Remotion's bundler, which is exactly why this
 * check can exist at all.
 */
import { describe, expect, it } from 'vitest';
import { predictSeconds, readSeconds, spokenSeconds } from '@halyard/core';
import { spokenSeconds as renderSpokenSeconds } from './quiz.js';
import { secondsToReadForTest } from './formatVideo.js';

/*
 * Wide enough to catch a changed constant rather than a changed edge case: the
 * floor, either side of it, the boundary where the read-floor stops binding,
 * and prose of the lengths the catalogue's slots actually produce.
 */
const CORPUS = [
  '',
  '   ',
  'yes',
  'no way',
  'one two three',
  'one two three four',
  'one two three four five',
  'Gluten is a protein, not a grain.',
  'Sourdough fermentation breaks down some gluten but never all of it.',
  'The answer is nineteen twelve, when the first commercial baking powder shipped.',
  'A myth people repeat because the first half of it is completely true, and the second half quietly is not.',
  Array.from({ length: 40 }, (_, i) => `word${i}`).join(' '),
];

describe('core and render agree on how long a line takes', () => {
  it('agrees on spokenSeconds for every line in the corpus', () => {
    for (const text of CORPUS) {
      expect(spokenSeconds(text), JSON.stringify(text)).toBe(renderSpokenSeconds(text));
    }
  });

  it('agrees on how long a beat holds', () => {
    for (const text of CORPUS) {
      expect(readSeconds(text), JSON.stringify(text)).toBe(secondsToReadForTest(text));
    }
  });

  it('agrees on the sum, which is what a budget is spent against', () => {
    const lines = CORPUS.filter((t) => t.trim().length > 0);
    const rendered = Number(
      lines.reduce((total, line) => total + secondsToReadForTest(line), 0).toFixed(2),
    );
    expect(predictSeconds(lines)).toBe(rendered);
  });
});
