/**
 * Date formatting, where the operator's timezone is the only correct one.
 *
 * Everything is stored UTC (build pack §1). The bug this guards against is
 * subtle and destructive: a `datetime-local` input carries wall time with no
 * zone, so writing UTC into it produces a pre-filled value that silently
 * disagrees with the label beside it, and submitting the form without editing
 * moves the item by the whole UTC offset.
 */
import { describe, expect, it } from 'vitest';
import {
  formatInOperatorTz,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from './format';

const NY = 'America/New_York';
// 09:00 in New York, during daylight saving.
const NINE_AM_NY = '2026-09-18T13:00:00.000Z';

describe('toDatetimeLocalValue', () => {
  it('matches the label the operator sees beside it', () => {
    expect(formatInOperatorTz(NINE_AM_NY, NY, 'HH:mm')).toBe('09:00');
    expect(toDatetimeLocalValue(NINE_AM_NY, NY)).toBe('2026-09-18T09:00');
  });

  it('is not the UTC slice, which is the mistake worth naming', () => {
    // `new Date(iso).toISOString().slice(0, 16)` is the obvious implementation
    // and it is four hours wrong here.
    expect(toDatetimeLocalValue(NINE_AM_NY, NY)).not.toBe(
      new Date(NINE_AM_NY).toISOString().slice(0, 16),
    );
  });

  it('handles a missing value without throwing', () => {
    expect(toDatetimeLocalValue(null, NY)).toBe('');
    expect(toDatetimeLocalValue(undefined, NY)).toBe('');
  });
});

describe('fromDatetimeLocalValue', () => {
  it('round-trips an instant unchanged, which is what stops silent drift', () => {
    const value = toDatetimeLocalValue(NINE_AM_NY, NY);
    expect(fromDatetimeLocalValue(value, NY)?.toISOString()).toBe(NINE_AM_NY);
  });

  it('reads the string as the operator’s wall clock, not the server’s', () => {
    expect(fromDatetimeLocalValue('2026-09-18T09:00', NY)?.toISOString()).toBe(NINE_AM_NY);
    expect(fromDatetimeLocalValue('2026-09-18T09:00', 'UTC')?.toISOString()).toBe(
      '2026-09-18T09:00:00.000Z',
    );
  });

  it('respects daylight saving rather than assuming a fixed offset', () => {
    // New York is UTC-4 in September and UTC-5 in January. A hardcoded offset
    // would be right half the year.
    const summer = fromDatetimeLocalValue('2026-09-18T09:00', NY)!;
    const winter = fromDatetimeLocalValue('2026-01-18T09:00', NY)!;
    expect(summer.toISOString()).toBe('2026-09-18T13:00:00.000Z');
    expect(winter.toISOString()).toBe('2026-01-18T14:00:00.000Z');
  });

  it('returns null for an empty or unparseable value rather than an Invalid Date', () => {
    expect(fromDatetimeLocalValue('', NY)).toBeNull();
    expect(fromDatetimeLocalValue('not a date', NY)).toBeNull();
  });
});
