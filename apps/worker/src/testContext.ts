/**
 * §367. One fake `HandlerContext`, so adding to the interface breaks one file.
 *
 * Twenty test files built their own `{ log } as unknown as HandlerContext`.
 * That cast is a promise the compiler cannot check, so adding `as` to the
 * interface typechecked everywhere and failed at runtime in the one place that
 * called it — ten tests, all reporting `ctx.as is not a function`, none of them
 * about the thing that had changed.
 *
 * A builder with real defaults makes the same cast unnecessary. A test that
 * needs a pool or an enqueue passes one; everything else gets a context that
 * satisfies the interface today and keeps satisfying it after the next field is
 * added.
 */
import type pg from 'pg';
import type { HandlerContext, EnqueueOptions } from './poller.js';
import type { JobKind } from '@halyard/db';

export interface TestContext extends HandlerContext {
  /** Every message logged, in order, for assertions. */
  logs: string[];
  /** Every message with its detail, for the assertions that need both. */
  entries: Array<{ message: string; detail?: Record<string, unknown>; stage: string | null }>;
  /** Everything the code under test tried to enqueue. */
  enqueued: Array<{ kind: JobKind; payload: Record<string, unknown>; options?: EnqueueOptions }>;
}

export function testContext(overrides: Partial<HandlerContext> = {}): TestContext {
  const logs: string[] = [];
  const entries: TestContext['entries'] = [];
  const enqueued: TestContext['enqueued'] = [];

  /*
   * `stage` is closed over rather than stored, so `ctx.as('write')` produces a
   * context that shares the same arrays — a test asserts on one list whatever
   * the code under test scoped itself to — while each entry still records which
   * lane it was written in.
   */
  const build = (stage: string | null): TestContext => ({
    pool: undefined as unknown as pg.Pool,
    workerId: 'test-worker',
    log: (message: string, detail?: Record<string, unknown>) => {
      logs.push(message);
      entries.push({ message, detail, stage });
    },
    enqueue: async (kind, payload, options) => {
      enqueued.push({ kind, payload, options });
    },
    as: (next: string) => build(next),
    logs,
    entries,
    enqueued,
    ...overrides,
  });

  return build(null);
}
