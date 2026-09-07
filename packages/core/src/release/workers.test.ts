/**
 * §567. Never show a green capability the running worker cannot deliver.
 *
 * The failure being prevented is §243's, and it is quiet by construction: a job
 * enqueued for a kind no live worker registers is not refused and does not
 * fail. It sits `pending`. So the only way it ever becomes visible is a check
 * like this one, and the case that matters most is the one an eager
 * implementation gets wrong — a *second* worker, alive and older, which will
 * happily claim jobs the first one could have handled.
 */
import { describe, expect, it } from 'vitest';
import { jobKindRunnable, staleWorkers, type WorkerHeartbeat } from './workers.js';

const NOW = new Date('2026-09-07T12:00:00Z');
const KINDS = ['generate', 'render', 'publish'];

function heartbeat(over: Partial<WorkerHeartbeat> = {}): WorkerHeartbeat {
  return {
    workerId: 'w1',
    lastSeenAt: new Date(NOW.getTime() - 30_000),
    kinds: [...KINDS],
    version: 'abc123abc123',
    ...over,
  };
}

describe('staleWorkers', () => {
  it('is quiet about a current worker', () => {
    expect(staleWorkers([heartbeat()], KINDS, NOW)).toEqual([]);
  });

  it('reports a live worker that is missing a handler, and names the kind', () => {
    const reports = staleWorkers([heartbeat({ kinds: ['generate', 'render'] })], KINDS, NOW);
    const report = reports[0]!;
    expect(report.kind).toBe('behind');
    expect(report.missingKinds).toEqual(['publish']);
    expect(report.reason).toContain('publish');
    expect(report.reason).toContain('sit pending');
  });

  it('reports a worker that has stopped heartbeating as gone, not as behind', () => {
    const report = staleWorkers(
      [heartbeat({ lastSeenAt: new Date(NOW.getTime() - 40 * 60_000) })],
      KINDS,
      NOW,
    )[0]!;
    expect(report.kind).toBe('gone');
    expect(report.missingKinds).toEqual([]);
    expect(report.reason).toContain('40 minutes');
  });

  it('does not call a worker ahead of the release stale — that is a deploy landing', () => {
    expect(staleWorkers([heartbeat({ kinds: [...KINDS, 'unreleased'] })], KINDS, NOW)).toEqual([]);
  });
});

describe('jobKindRunnable', () => {
  it('is runnable when a live worker registers the kind', () => {
    expect(jobKindRunnable('render', [heartbeat()], NOW).runnable).toBe(true);
  });

  it('is not runnable when nothing has heartbeated', () => {
    const verdict = jobKindRunnable('render', [], NOW);
    expect(verdict.runnable).toBe(false);
    expect(verdict.reason).toContain('no worker');
  });

  it('is not runnable when the only live worker predates the handler', () => {
    const verdict = jobKindRunnable('publish', [heartbeat({ kinds: ['generate'] })], NOW);
    expect(verdict.runnable).toBe(false);
    expect(verdict.reason).toContain('sit pending');
  });

  it('ignores a dead worker that did register the kind', () => {
    const verdict = jobKindRunnable(
      'publish',
      [heartbeat({ lastSeenAt: new Date(NOW.getTime() - 60 * 60_000) })],
      NOW,
    );
    expect(verdict.runnable).toBe(false);
  });

  it('warns when one live worker registers the kind and another does not', () => {
    /*
     * Gotcha 13's shape: two workers poll the same table and a job lands on
     * whichever claims first. "Some worker can do it" is therefore not the same
     * as "the job will run", and a check that stops at the first capable worker
     * reports a green that is true only half the time.
     */
    const verdict = jobKindRunnable(
      'publish',
      [heartbeat(), heartbeat({ workerId: 'w2', kinds: ['generate'] })],
      NOW,
    );
    expect(verdict.runnable).toBe(true);
    expect(verdict.reason).toContain('1 of 2');
    expect(verdict.reason).toContain('sit pending');
  });
});
