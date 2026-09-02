/**
 * §442. The check that makes §438 loud instead of silent.
 *
 * Two platform caps were wrong for over a year while every test passed, because
 * a constant describing somebody else's product looks exactly like arithmetic.
 * This is the only kind of test that catches it: one that fails on the calendar
 * rather than on the code, because the code is not what changed.
 */
import { describe, expect, it } from 'vitest';
import {
  STALE_AFTER_DAYS,
  VERIFIED_CONSTANTS,
  daysSinceVerified,
  staleConstants,
} from './verified.js';

describe('constants that describe someone else\'s product', () => {
  it('has been checked within the last year', () => {
    const stale = staleConstants();
    expect(
      stale.map((c) => `${c.what}\n    lives in: ${c.where}\n    check by: ${c.checkBy}`).join('\n\n'),
      `These platform facts are over ${STALE_AFTER_DAYS} days old. Go and look, then bump verifiedOn.`,
    ).toBe('');
  });

  it('names somewhere real for every entry', () => {
    for (const constant of VERIFIED_CONSTANTS) {
      expect(constant.where.length, constant.what).toBeGreaterThan(10);
      expect(constant.checkBy.length, constant.what).toBeGreaterThan(10);
      expect(constant.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('has no entry dated in the future, which would never go stale', () => {
    for (const constant of VERIFIED_CONSTANTS) {
      expect(daysSinceVerified(constant), constant.what).toBeGreaterThanOrEqual(0);
    }
  });

  it('goes stale on the day after the window, not before', () => {
    const constant = { ...VERIFIED_CONSTANTS[0]!, verifiedOn: '2020-01-01' };
    const exactly = new Date('2020-01-01T00:00:00Z');
    exactly.setUTCDate(exactly.getUTCDate() + STALE_AFTER_DAYS);
    expect(daysSinceVerified(constant, exactly)).toBe(STALE_AFTER_DAYS);
    exactly.setUTCDate(exactly.getUTCDate() + 1);
    expect(daysSinceVerified(constant, exactly)).toBeGreaterThan(STALE_AFTER_DAYS);
  });
});
