/**
 * §243. A deployed worker that is missing job kinds is a silent outage.
 *
 * ## What happened
 *
 * The Railway worker's heartbeat recorded a `kinds` list that did not contain
 * `learn_from_performance`, `build_account_intelligence` or
 * `generate_concepts`. It had been deployed before those handlers existed, so
 * every one of those jobs sat `pending` forever — no error, no failed job, and
 * the tables they fill stayed empty. It was only found by reading two
 * heartbeat rows side by side and noticing one list was shorter.
 *
 * The `kinds` list is a genuinely good staleness signal: it is derived from
 * the code the worker is actually running, it is already written to the
 * database every heartbeat, and it changes exactly when the handler map does.
 *
 * This test asserts the *local* code is self-consistent. `staleWorkers` is the
 * runtime half, used by the doctor and the health screen.
 */
import { describe, expect, it } from 'vitest';
import { JOB_KINDS } from '@halyard/db';
import { HANDLERS } from './handlers/index.js';
import { staleWorkers } from './workerFreshness.js';

describe('the handler map and the job kinds agree', () => {
  it('handles every kind the database will accept', () => {
    const handled = new Set(Object.keys(HANDLERS));
    const missing = JOB_KINDS.filter((k) => !handled.has(k));
    expect(missing, `job kinds with no handler: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('staleWorkers', () => {
  const now = new Date('2026-08-28T12:00:00Z');
  const fresh = { workerId: 'w1', lastSeenAt: now, kinds: [...JOB_KINDS], version: 'abc123' };

  it('says nothing about a worker running current code', () => {
    expect(staleWorkers([fresh], now)).toEqual([]);
  });

  it('names the kinds a stale worker cannot run', () => {
    /*
     * The real failure. A worker missing a kind does not error — it simply
     * never claims those jobs, and they sit pending while the feature they
     * belong to appears broken for reasons nobody can find.
     */
    const behind = {
      ...fresh,
      kinds: JOB_KINDS.filter(
        (k) => !['generate_concepts', 'learn_from_performance'].includes(k),
      ),
    };
    const [report] = staleWorkers([behind], now);
    expect(report).toBeDefined();
    expect(report!.missingKinds).toContain('generate_concepts');
    expect(report!.missingKinds).toContain('learn_from_performance');
    expect(report!.reason).toContain('older than the handler map');
  });

  it('reports a worker that has stopped heartbeating', () => {
    const dead = { ...fresh, lastSeenAt: new Date(now.getTime() - 30 * 60_000) };
    const [report] = staleWorkers([dead], now);
    expect(report!.reason).toContain('has not been seen');
  });

  it('does not confuse extra kinds with missing ones', () => {
    // A worker *ahead* of the checkout is not stale; it is the deploy landing.
    const ahead = { ...fresh, kinds: [...JOB_KINDS, 'a_future_kind'] };
    expect(staleWorkers([ahead], now)).toEqual([]);
  });

  it('reports every stale worker, not only the first', () => {
    const a = { ...fresh, workerId: 'a', kinds: JOB_KINDS.filter((k) => k !== 'tts') };
    const b = { ...fresh, workerId: 'b', lastSeenAt: new Date(now.getTime() - 3_600_000) };
    expect(staleWorkers([a, b], now)).toHaveLength(2);
  });
});
