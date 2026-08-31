/**
 * §394. Variety in the composition nine of eleven formats run through.
 *
 * `treatmentsForBeats` chose by fit then recency — the right rule — and seeded
 * its recency list empty on every call, so it varied *within* a piece and
 * repeated *across* pieces. Two histories briefed the same way opened on the
 * same treatment, every time, and that was most of the account.
 */
import { describe, expect, it } from 'vitest';
import {
  treatmentsForBeats,
  type BeatRole,
  type NarrativeTreatment,
} from './narrative.js';

/**
 * §394. Nine of eleven formats render through this composition, so its recency
 * is most of what stops an account looking alike.
 */
describe('two narrative pieces briefed the same way differ', () => {
  const roles: BeatRole[] = ['hook', 'setup', 'turn', 'payoff', 'close'];

  it('does not open the next piece on the same treatment', () => {
    /*
     * The defect: `treatmentsForBeats` seeded its recency list empty on every
     * call, so it varied within a piece and repeated across pieces. A history
     * and the history after it opened identically, every time.
     */
    const first = treatmentsForBeats(roles);
    const second = treatmentsForBeats(roles, first);
    expect(second[0]).not.toBe(first[0]);
  });

  it('still gives every beat a treatment its role can carry', () => {
    /* Variety never costs fit: a close at hook weight reads as a restart. */
    let history: NarrativeTreatment[] = [];
    for (let piece = 0; piece < 6; piece += 1) {
      const chosen = treatmentsForBeats(roles, history);
      chosen.forEach((treatment, i) => {
        expect(
          FITS_FOR_TEST[roles[i]!].includes(treatment),
          `${treatment} does not fit a ${roles[i]}`,
        ).toBe(true);
      });
      history = [...chosen, ...history].slice(0, 8);
    }
  });

  it('is a pure function of its inputs, so a re-render is identical', () => {
    expect(treatmentsForBeats(roles, ['statement'])).toEqual(
      treatmentsForBeats(roles, ['statement']),
    );
  });
});

/**
 * The fit rule, restated for the test.
 *
 * Deliberately a copy rather than an import: `FITS` is private, and a test that
 * imported it would assert the implementation against itself. This is the rule
 * as the docstring states it, and if the two drift the test is the one that
 * should fail.
 */
const FITS_FOR_TEST: Record<BeatRole, NarrativeTreatment[]> = {
  hook: ['statement', 'label_lead'],
  setup: ['anchored', 'split_rule', 'label_lead'],
  turn: ['statement', 'split_rule'],
  detail: ['anchored', 'label_lead', 'split_rule'],
  payoff: ['statement', 'split_rule'],
  close: ['quiet', 'anchored'],
};
