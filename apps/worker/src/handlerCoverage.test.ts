/**
 * Every job we enqueue must be a job we can run.
 *
 * This exists because `collect_signals` was on the schedule for the entire life
 * of the system with no handler registered. The poller claimed it, found
 * nothing to run it with, put it back, and repeated — thirteen jobs accumulated
 * over seventy-five hours in production while every other kind completed. It
 * never errored, never dead-lettered, never alerted.
 *
 * That is the third failure this codebase has produced with the same shape: a
 * thing that does nothing looks exactly like a thing that works. A unit test is
 * the cheapest place to make it impossible.
 */
import { describe, expect, it } from 'vitest';
import { JOB_KINDS, JOB_POLICY, type JobKind } from '@halyard/db';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { HANDLERS } from './handlers/index.js';
import { SCHEDULES } from './scheduler.js';

const registered = new Set(Object.keys(HANDLERS));

describe('handler coverage', () => {
  it('registers a handler for every kind the scheduler enqueues', () => {
    // The sharp end: a scheduled kind with no handler runs forever and does
    // nothing, and nothing anywhere says so.
    const scheduledWithoutHandler = SCHEDULES.map((s) => s.kind).filter(
      (kind) => !registered.has(kind),
    );
    expect(scheduledWithoutHandler, 'scheduled but unrunnable').toEqual([]);
  });

  it('gives every registered handler a policy, so a hang is bounded', () => {
    const withoutPolicy = [...registered].filter((kind) => !JOB_POLICY[kind as JobKind]);
    expect(withoutPolicy, 'no timeout or attempt limit').toEqual([]);
  });

  it('names every registered handler in JOB_KINDS', () => {
    // A handler for a kind the check constraint rejects can never be enqueued.
    const unknown = [...registered].filter((kind) => !JOB_KINDS.includes(kind as JobKind));
    expect(unknown, 'handler for a kind the database will not accept').toEqual([]);
  });

  it('accounts for every declared kind, either handled or knowingly not', () => {
    /**
     * Kinds that exist in the enum and deliberately have no handler.
     *
     * Each one is a decision, written down. An unlisted unhandled kind is an
     * oversight, and that distinction is the entire point of this test.
     */
    const knowinglyUnhandled: Record<string, string> = {};

    const unaccounted = JOB_KINDS.filter(
      (kind) => !registered.has(kind) && !(kind in knowinglyUnhandled),
    );
    expect(unaccounted, 'unhandled and undocumented').toEqual([]);

    /**
     * The list has to be exact, not merely a superset.
     *
     * It was a superset, and it went stale the moment `tts` was implemented:
     * the entry claiming "there is no ElevenLabs integration anywhere in the
     * codebase" sat next to a working ElevenLabs integration, and nothing
     * failed, because a documented-as-missing kind that turns out to exist
     * still satisfies a check for kinds that are missing *and* undocumented.
     *
     * Left alone it would have been worse than stale. If the handler were ever
     * unregistered, this file would have called that a deliberate decision and
     * gone green.
     */
    const documentedButActuallyHandled = Object.keys(knowinglyUnhandled).filter((kind) =>
      registered.has(kind as (typeof JOB_KINDS)[number]),
    );
    expect(documentedButActuallyHandled, 'documented as unhandled but registered').toEqual([]);
  });

  it('does not schedule a kind that has no handler', () => {
    /**
     * This used to name `digest_email` in a hardcoded list, because that kind
     * was declared, listed as a cron task, and implemented by nothing — so a
     * schedule for it would have produced rows no worker could claim. It has a
     * handler now, and an empty hardcoded list would have made the test
     * vacuous.
     *
     * Derived from `HANDLERS` instead, which is the invariant that actually
     * matters: whatever the scheduler enqueues, something must be able to run.
     */
    const orphanSchedules = SCHEDULES.map((s) => s.kind as string).filter(
      (kind) => !registered.has(kind as (typeof JOB_KINDS)[number]),
    );
    expect(orphanSchedules, 'scheduled with no handler to claim it').toEqual([]);
  });
});

/**
 * `JOB_KINDS` and the database's `jobs_kind_check` are the same list written
 * twice, in two languages, in two files.
 *
 * Adding to one without the other typechecks cleanly and then fails at the
 * first insert — which is what happened when the Explorer's kinds went in. It
 * surfaced only because the scheduler tests enqueue against a real database; a
 * unit test over the TypeScript constant alone would have passed happily, and
 * the failure would have been the scheduler dying in production.
 *
 * So the two lists are compared directly.
 */
const dbAvailable = await databaseAvailable();
const withDb = dbAvailable ? describe : describe.skip;

withDb('the job kinds the database will actually accept', () => {
  it('accepts every kind declared in TypeScript', async () => {
    const pool = await createIsolatedPool('jobkinds', 4);
    try {
      const { rows } = await pool.query<{ def: string }>(
        `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'jobs_kind_check'`,
      );
      const constraint = rows[0]?.def ?? '';
      expect(constraint, 'jobs_kind_check is missing entirely').not.toBe('');

      const missing = JOB_KINDS.filter((kind) => !constraint.includes(`'${kind}'`));
      expect(missing, 'declared in JOB_KINDS but rejected by the database').toEqual([]);
    } finally {
      await pool.end();
    }
  }, 120_000);
});

/**
 * §217. Every job kind must be reachable — the inverse of the guard above.
 *
 * The existing test asks "does everything the scheduler enqueues have a
 * handler?", which is the safe direction. Nothing asked the dangerous one:
 * **does everything with a handler have a way of being enqueued?**
 *
 * `learn_from_performance` and `build_account_intelligence` shipped with
 * handlers, job policies and `JOB_KINDS` entries, and no scheduler entry and no
 * caller. Nothing would ever have enqueued them, both tables sat at zero rows,
 * and from the outside that is indistinguishable from an unimplemented feature.
 * A handler nothing can reach is dead code that looks alive.
 */
describe('every job kind is reachable', () => {
  it('is either scheduled, enqueued by another handler, or knowingly manual', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const here = path.dirname(fileURLToPath(import.meta.url));
    const scheduled = new Set(SCHEDULES.map((s) => s.kind));

    /* Every `enqueue('kind'` in the worker and the web app. */
    const enqueued = new Set<string>();
    const roots = [path.join(here, 'handlers'), here, path.join(here, '..', '..', 'web', 'src')];
    const walk = (dir: string): string[] => {
      let out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out = out.concat(walk(full));
        else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(full);
      }
      return out;
    };
    for (const root of roots) {
      let files: string[];
      try {
        files = walk(root);
      } catch {
        /* A root that does not exist in this checkout is not a failure. */
        continue;
      }
      for (const file of files) {
        const source = readFileSync(file, 'utf8');
        for (const m of source.matchAll(/enqueue(?:Job)?\(\s*['"]([a-z_]+)['"]/g)) {
          enqueued.add(m[1]!);
        }
        /*
         * Raw inserts count too. `verify_provider_capability` is enqueued by
         * `accounts/actions.ts` with an `insert into jobs (kind, ...) values
         * ('verify_provider_capability', ...)`, and the first version of this
         * test reported it unreachable because it only looked for `enqueue(`.
         * A guard that misreports a reachable kind teaches people to ignore it.
         */
        for (const m of source.matchAll(/values\s*\(\s*['"]([a-z_]+)['"]/g)) {
          enqueued.add(m[1]!);
        }
      }
    }

    /**
     * Kinds with no automatic trigger by design, each with its reason.
     *
     * `capture` and `explore_product` spend real product credits and stay
     * deliberate operator actions; `publish` is behind the approval boundary
     * and is enqueued by approval, not by a schedule.
     */
    const knowinglyManual: Record<string, string> = {
      capture: 'Spends product credits; an operator action from the UI.',
      explore_product: 'Spends product credits; an operator action.',
      /*
       * Recorded as a real gap rather than dressed up as a decision.
       *
       * `send_newsletter` has a handler, a job policy and a `JOB_KINDS` entry,
       * and there is no scheduler entry, no caller and no screen — production
       * holds zero newsletters. `draft_newsletter` runs and nothing can send
       * what it drafts. It sits here so the guard stays useful for the creative
       * pipeline rather than failing on a known, unrelated hole; it is listed
       * as unreachable, not as intentional.
       */
      send_newsletter: 'GAP: no enqueue path and no operator screen. Drafts are never sendable.',
    };

    const unreachable = JOB_KINDS.filter(
      (kind) =>
        !scheduled.has(kind) && !enqueued.has(kind) && !(kind in knowinglyManual),
    );

    expect(
      unreachable,
      'job kinds with a handler and no way to be enqueued — dead code that looks alive',
    ).toEqual([]);
  });
});
