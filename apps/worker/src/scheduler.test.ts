/**
 * The scheduler. Everything periodic depends on this tick actually firing.
 */
import { describe, expect, it } from 'vitest';
import { SCHEDULES, bucketFor } from './scheduler.js';

describe('bucketFor', () => {
  it('is stable across a window, so a worker restart does not double-enqueue', () => {
    const start = new Date('2026-08-10T12:00:00Z');
    const later = new Date('2026-08-10T12:29:59Z');
    expect(bucketFor(30, start)).toBe(bucketFor(30, later));
  });

  it('advances when the window does', () => {
    expect(bucketFor(30, new Date('2026-08-10T12:00:00Z'))).not.toBe(
      bucketFor(30, new Date('2026-08-10T12:30:00Z')),
    );
  });

  it('gives a weekly schedule exactly one bucket per seven days', () => {
    // Buckets are floored from the Unix epoch, so the boundary lands on a fixed
    // day rather than on Monday. What matters is the width, not the phase: any
    // two moments less than seven days apart within a window share a bucket, and
    // seven days always advances it.
    const week = 7 * 24 * 60;
    const start = new Date('2026-08-10T00:00:00Z');
    const bucket = bucketFor(week, start);

    const sixDaysLater = new Date(start.getTime() + 6 * 86_400_000);
    const sevenDaysLater = new Date(start.getTime() + 7 * 86_400_000);

    // One of these two is in the same bucket; both cannot be in a later one.
    expect(bucketFor(week, sixDaysLater) - bucket).toBeLessThanOrEqual(1);
    expect(bucketFor(week, sevenDaysLater)).toBe(bucket + 1);
  });
});

describe('SCHEDULES', () => {
  it('verifies the capture flows at least weekly', () => {
    // Milestone 41 Part B. Without this entry the gate exists and never runs,
    // which reads as coverage while providing none.
    const verify = SCHEDULES.find(
      (s) => s.kind === 'capture' && s.payload?.verifyOnly === true,
    );
    expect(verify).toBeDefined();
    expect(verify!.everyMinutes).toBeLessThanOrEqual(7 * 24 * 60);
  });

  it('never records from the scheduled verification', () => {
    // A weekly job that spends an adaptation credit and files assets is not a
    // gate, it is a recurring bill.
    for (const schedule of SCHEDULES) {
      if (schedule.kind !== 'capture') continue;
      expect(schedule.payload?.verifyOnly, JSON.stringify(schedule.payload)).toBe(true);
    }
  });

  it('checks for a release far more often than it verifies on the weekly floor', () => {
    const release = SCHEDULES.find((s) => s.kind === 'detect_release')!;
    const verify = SCHEDULES.find((s) => s.kind === 'capture')!;
    expect(release.everyMinutes).toBeLessThan(verify.everyMinutes);
    // A deploy should be noticed the same hour, not the same week.
    expect(release.everyMinutes).toBeLessThanOrEqual(60);
  });

  it('says why each cadence was chosen', () => {
    for (const schedule of SCHEDULES) {
      expect(schedule.why.length, schedule.kind).toBeGreaterThan(30);
    }
  });

  it('has no duplicate entries for the same kind and payload', () => {
    const keys = SCHEDULES.map((s) => `${s.kind}:${JSON.stringify(s.payload ?? {})}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
