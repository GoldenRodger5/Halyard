import { describe, expect, it } from 'vitest';
import { DEFAULT_CADENCE, checkCadence, shouldDraftMore } from './cadence.js';


/**
 * §452. Drafting into a queue nobody can empty.
 *
 * `checkCadence` governs publishing. Nothing governed drafting, while the
 * scheduler's justification for the daily run claimed the cadence ceilings
 * bounded it. Measured when that was noticed: 31 pieces pending approval, 0
 * ever published, 15 of them video against a ceiling of five a week.
 */
describe('how much unapproved work is worth holding', () => {
  it('stops drafting a format three weeks deep in queue', () => {
    const verdict = shouldDraftMore('video', 15);
    expect(verdict.draft).toBe(false);
    if (!verdict.draft) {
      expect(verdict.because).toMatch(/3\.0 weeks of queue/);
      expect(verdict.because).toMatch(/a slot that does not exist/);
    }
  });

  it('keeps drafting a format with room, and says how much', () => {
    /* Text publishes at 14 a week, so two weeks is 28. */
    const verdict = shouldDraftMore('text', 10);
    expect(verdict.draft).toBe(true);
    if (verdict.draft) expect(verdict.headroom).toBe(18);
  });

  it('is a buffer, not a ban: clearing the queue resumes it', () => {
    expect(shouldDraftMore('video', 10).draft).toBe(false);
    expect(shouldDraftMore('video', 9).draft).toBe(true);
  });

  /*
   * One week would stop the system the first time an operator took a few days
   * off; three is a month of drafts competing for the same slots.
   */
  it('holds two weeks of publishing, not one', () => {
    expect(shouldDraftMore('video', 6).draft).toBe(true);
    expect(shouldDraftMore('video', 6, DEFAULT_CADENCE, 1).draft).toBe(false);
  });

  it('leaves a format with no rule unbounded, rather than treating it as zero', () => {
    const verdict = shouldDraftMore('story', 500);
    expect(verdict.draft).toBe(true);
  });

  it('never confuses the publishing ceiling with the drafting one', () => {
    /* Five a week may publish; ten may wait. They are different questions. */
    expect(checkCadence('video', { thisWeek: { video: 5 } }).allowed).toBe(false);
    expect(shouldDraftMore('video', 5).draft).toBe(true);
  });
});
