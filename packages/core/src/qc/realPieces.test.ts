/**
 * §473. Every rule, run over every piece this system actually made.
 *
 * The corpus is in `__fixtures__/realPieces.ts` and its header explains why it
 * exists. This is the test that gives it teeth, and it asserts two things a
 * unit test cannot:
 *
 * 1. **Each rule catches the real sentence that motivated it** — not the tidy
 *    example written next to the rule.
 * 2. **No rule fires on work that is doing its job.** This is the one that
 *    matters. A rule can only be shown to be quiet by running it over good
 *    work, and unit tests never contain any.
 *
 * The second assertion is what would have caught §466's collision, where two
 * rules between them left a short caption with no legal form. Each passed its
 * own tests; nothing ran them together over a caption that was fine.
 */
import { describe, expect, it } from 'vitest';
import { REAL_PIECES } from './__fixtures__/realPieces.js';
import { slopFilter } from './slopFilter.js';
import { checkOneNamePerThing } from '../formats/write.js';

/** Every rule any of these checks can raise, for one piece. */
function rulesFiredOn(piece: (typeof REAL_PIECES)[number]): string[] {
  const copy = slopFilter({
    body: piece.caption,
    platform: piece.platform as never,
    hashtags: piece.hashtags,
    onScreen: piece.onScreen,
  });
  const naming = checkOneNamePerThing({
    formatId: piece.format,
    slots: piece.onScreen.map((text, index) => ({ key: `s${index}`, index: 0, text })),
  });
  return [...copy.errors, ...copy.warnings, ...naming].map((v) => v.rule);
}

describe('the rules, over real output', () => {
  for (const piece of REAL_PIECES.filter((p) => !p.clean)) {
    describe(piece.id, () => {
      for (const defect of piece.defects) {
        it(`catches ${defect.rule} — ${defect.because}`, () => {
          expect(rulesFiredOn(piece)).toContain(defect.rule);
        });
      }
    });
  }

  /**
   * The half that keeps the rules honest.
   *
   * A rule that fires here is firing on a piece written to the standard those
   * same rules are meant to produce — which makes it a false positive, and a
   * false positive on good work is worse than a missed defect, because it is
   * what teaches an operator to stop reading the warnings.
   */
  for (const piece of REAL_PIECES.filter((p) => p.clean)) {
    it(`stays silent on ${piece.id}, which is doing its job`, () => {
      expect(rulesFiredOn(piece)).toEqual([]);
    });
  }

  /*
   * A corpus with no good rows is a corpus that cannot detect over-firing, so
   * the balance is asserted rather than left to whoever adds the next piece.
   */
  it('keeps work that should pass, not only work that failed', () => {
    expect(REAL_PIECES.filter((p) => p.clean).length).toBeGreaterThanOrEqual(2);
  });

  it('says what is wrong with every piece it keeps', () => {
    for (const piece of REAL_PIECES) {
      if (piece.clean) {
        expect(piece.defects, piece.id).toEqual([]);
        continue;
      }
      expect(piece.defects.length, piece.id).toBeGreaterThan(0);
      for (const defect of piece.defects) {
        expect(defect.because.length, `${piece.id}/${defect.rule}`).toBeGreaterThan(20);
      }
    }
  });
});
