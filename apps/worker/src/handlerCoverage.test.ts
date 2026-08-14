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
    const knowinglyUnhandled: Record<string, string> = {
      digest_email: 'The digest is not implemented. Nothing enqueues it.',
    };

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

  it('does not enqueue a kind it knowingly cannot run', () => {
    const knowinglyUnhandled = ['digest_email'];
    const scheduled = SCHEDULES.map((s) => s.kind as string);
    for (const kind of knowinglyUnhandled) {
      expect(scheduled, `${kind} is scheduled but knowingly unhandled`).not.toContain(kind);
    }
  });
});
