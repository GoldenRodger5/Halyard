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
      tts: 'Voiceover is not implemented. There is no ElevenLabs integration anywhere in the codebase — the job kind, the voice lexicon, the audio gate and writeVoScript were all built around a synthesis step that was never written. Nothing enqueues it.',
      digest_email: 'The digest is not implemented. Nothing enqueues it.',
      send_newsletter: 'Drafting is implemented and sending is not. Nothing enqueues it.',
    };

    const unaccounted = JOB_KINDS.filter(
      (kind) => !registered.has(kind) && !(kind in knowinglyUnhandled),
    );
    expect(unaccounted, 'unhandled and undocumented').toEqual([]);
  });

  it('does not enqueue a kind it knowingly cannot run', () => {
    const knowinglyUnhandled = ['tts', 'digest_email', 'send_newsletter'];
    const scheduled = SCHEDULES.map((s) => s.kind as string);
    for (const kind of knowinglyUnhandled) {
      expect(scheduled, `${kind} is scheduled but knowingly unhandled`).not.toContain(kind);
    }
  });
});
