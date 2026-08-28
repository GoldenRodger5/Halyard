/**
 * The job poller. v1 §6.
 *
 * One table, FOR UPDATE SKIP LOCKED, polled every two seconds. The claim itself
 * lives in `claim_next_job()` in the database, which is what makes two workers
 * safe — the correctness is in Postgres, not in this loop.
 *
 * The loop's own responsibilities are: apply per-kind timeouts, apply the
 * backoff policy, reap stale locks, and write a heartbeat. Everything else is a
 * handler's problem.
 */
import { writeFile } from 'node:fs/promises';
import type pg from 'pg';
import { JOB_POLICY, type JobKind } from '@halyard/db';
import { scrubString } from '@halyard/core';
import { reportJobFailure } from './observability.js';

export interface Job {
  id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  dedupe_key: string | null;
}

/**
 * A failure that retrying cannot fix.
 *
 * ## The seam this closes
 *
 * `publishFailurePolicy` in core already decides this. It returns
 * `retry: false` for an auth failure ("do not retry blindly against a dead
 * token"), for a malformed response ("never retried — that double-posts") and
 * for a duplicate abort. `publish.ts` reads that policy and acts on it for the
 * item and the account… and then throws, and the poller retries the job anyway,
 * because `fail()` had no way to hear it. The only thing standing between a
 * malformed response and a second write was the idempotency index.
 *
 * So the decision stays where it already lived, in `publishFailurePolicy`, and
 * this is the channel it was missing. Deliberately a marker on the error rather
 * than a return value: a handler signals permanence by *how it fails*, which is
 * the same way it signals everything else, and every existing handler keeps
 * working unchanged.
 *
 * Nothing about this is a shortcut for a flaky provider. A transient failure
 * must still throw an ordinary error and take its retries.
 */
export class PermanentJobFailure extends Error {
  constructor(
    message: string,
    /** Why retrying cannot help, for the row an operator will read. */
    public readonly reason: string,
  ) {
    super(message);
    this.name = 'PermanentJobFailure';
  }
}

export type JobHandler = (job: Job, ctx: HandlerContext) => Promise<void>;

export interface HandlerContext {
  pool: pg.Pool;
  workerId: string;
  log: (message: string, detail?: Record<string, unknown>) => void;
  /** Enqueue follow-on work from inside a handler. */
  enqueue: (kind: JobKind, payload: Record<string, unknown>, options?: EnqueueOptions) => Promise<void>;
}

export interface EnqueueOptions {
  priority?: number;
  runAfter?: Date;
  dedupeKey?: string;
  maxAttempts?: number;
}

export interface PollerOptions {
  pool: pg.Pool;
  workerId: string;
  handlers: Partial<Record<JobKind, JobHandler>>;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  reapIntervalMs?: number;
  /** Injected in tests so a run is finite. */
  now?: () => number;
  log?: (message: string, detail?: Record<string, unknown>) => void;
}

export class Poller {
  private running = false;
  private readonly pool: pg.Pool;
  private readonly workerId: string;
  private readonly handlers: Partial<Record<JobKind, JobHandler>>;
  /** Kinds already reported this process, so a rolling deploy does not spam. */
  private readonly unhandledKindsSeen = new Set<string>();
  private readonly pollIntervalMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly reapIntervalMs: number;
  private readonly log: (message: string, detail?: Record<string, unknown>) => void;
  private timers: NodeJS.Timeout[] = [];

  constructor(options: PollerOptions) {
    this.pool = options.pool;
    this.workerId = options.workerId;
    this.handlers = options.handlers;
    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 60_000;
    this.reapIntervalMs = options.reapIntervalMs ?? 5 * 60_000;
    this.log =
      options.log ??
      ((message, detail) =>
        console.log(JSON.stringify({ at: new Date().toISOString(), worker: options.workerId, message, ...detail })));
  }

  /** The kinds this worker will claim. Everything it has a handler for. */
  get handledKinds(): JobKind[] {
    return Object.keys(this.handlers) as JobKind[];
  }

  async enqueue(
    kind: JobKind,
    payload: Record<string, unknown>,
    options: EnqueueOptions = {},
  ): Promise<void> {
    const policy = JOB_POLICY[kind];
    await this.pool.query(
      `insert into jobs (kind, payload, priority, run_after, dedupe_key, max_attempts)
       values ($1, $2, $3, coalesce($4, now()), $5, $6)
       on conflict do nothing`,
      [
        kind,
        payload,
        options.priority ?? 100,
        options.runAfter ?? null,
        options.dedupeKey ?? null,
        options.maxAttempts ?? policy.maxAttempts,
      ],
    );
  }

  /** Claim and run exactly one job. Returns false when the queue is empty. */
  async tick(): Promise<boolean> {
    const { rows } = await this.pool.query<Job>('select * from claim_next_job($1, $2)', [
      this.workerId,
      this.handledKinds,
    ]);
    const job = rows[0];
    if (!job) return false;

    const policy = JOB_POLICY[job.kind];
    const handler = this.handlers[job.kind];

    if (!handler) {
      /**
       * Claimed something we cannot run.
       *
       * Putting it back is right — a rolling deploy can leave one worker on an
       * older image that genuinely does not know a new kind, and failing the job
       * would lose work the next worker could do.
       *
       * **Saying nothing about it was not right.** `collect_signals` is on the
       * schedule and has never had a handler, so for as long as this system has
       * run it enqueued the job, claimed it, put it back, and repeated — thirteen
       * of them accumulated over seventy-five hours in production while every
       * other kind completed. No error, no dead letter, no alert. The one place
       * that could have noticed was this branch, and it returned quietly.
       */
      await this.pool.query(
        `update jobs set status='queued', locked_at=null, locked_by=null, attempts=attempts-1 where id=$1`,
        [job.id],
      );
      this.log('no handler for job kind', { kind: job.kind, jobId: job.id });

      // Once per kind per process, so a rolling deploy does not spam, but a
      // permanently missing handler reaches somebody.
      if (!this.unhandledKindsSeen.has(job.kind)) {
        this.unhandledKindsSeen.add(job.kind);
        await this.pool
          .query(
            `insert into notifications (kind, severity, title, body, dedupe_key)
             values ('connector_down', 'critical', $1, $2, $3)
             on conflict (dedupe_key) do nothing`,
            [
              `No handler for '${job.kind}' jobs`,
              `Jobs of kind '${job.kind}' are being enqueued and put straight back, because this worker has no handler registered for them. They will accumulate forever and the work never happens. Either register a handler or stop enqueueing the kind.`,
              `no_handler:${job.kind}`,
            ],
          )
          .catch(() => undefined);
      }
      return true;
    }

    const startedAt = Date.now();
    try {
      await withTimeout(
        handler(job, {
          pool: this.pool,
          workerId: this.workerId,
          log: this.log,
          enqueue: (kind, payload, options) => this.enqueue(kind, payload, options),
        }),
        policy.timeoutMs,
        `${job.kind} exceeded its ${policy.timeoutMs / 1000}s timeout`,
      );

      await this.pool.query(
        `update jobs set status='done', finished_at=now(), last_error=null where id=$1`,
        [job.id],
      );
      this.log('job done', { kind: job.kind, id: job.id, ms: Date.now() - startedAt });
    } catch (err) {
      await this.fail(job, err as Error, policy.backoffSeconds);
    }
    return true;
  }

  private async fail(job: Job, error: Error, backoffSeconds: number): Promise<void> {
    /**
     * Attempts run out, or the handler says retrying cannot help.
     *
     * The second is not a shortcut. It is how `publishFailurePolicy`'s
     * `retry: false` finally reaches the queue — an auth failure, a malformed
     * response and a duplicate abort all get worse with repetition, and until
     * now each one burned its full allowance regardless.
     */
    const permanent = error instanceof PermanentJobFailure;
    const exhausted = job.attempts >= job.max_attempts || permanent;

    // Sentry gets the stack and the release tag; the row below gets the message.
    // Expected operating states — a paused kill switch, a duplicate abort — are
    // filtered out inside reportJobFailure rather than here.
    reportJobFailure(error, { jobId: job.id, kind: job.kind, attempts: job.attempts });

    // Exponential backoff on the base defined per kind in v1 §6.
    const delay = backoffSeconds * 2 ** Math.max(0, job.attempts - 1);

    await this.pool.query(
      `update jobs
          set status = $2,
              last_error = $3,
              locked_at = null,
              locked_by = null,
              run_after = now() + make_interval(secs => $4),
              finished_at = case when $2 = 'dead' then now() else null end
        where id = $1`,
      [
        job.id,
        exhausted ? 'dead' : 'queued',
        /**
         * Scrubbed on the way into the database, not only on the way to Sentry.
         *
         * `scrubEvent` has always guarded the reporter, and nothing guarded
         * this. An error message is arbitrary text from whatever threw — a
         * library, a provider, an adapter — and the Instagram adapter carries
         * its access token in the URL query string, so a stack or cause that
         * quotes a URL puts a live credential in a row that is read by the
         * operator UI and kept indefinitely.
         *
         * Nothing has leaked here yet (nine stored errors, none matching a
         * credential shape). This is the boundary where it would.
         */
        scrubString(error.message).slice(0, 2000),
        exhausted ? 0 : delay,
      ],
    );

    this.log(exhausted ? 'job dead' : 'job failed, will retry', {
      kind: job.kind,
      id: job.id,
      attempts: job.attempts,
      error: scrubString(error.message).slice(0, 500),
      // Said out loud, because "dead after one attempt" otherwise reads as a
      // broken retry policy rather than a deliberate one.
      ...(permanent ? { permanent: true, why: error.reason } : {}),
    });
  }

  async heartbeat(): Promise<void> {
    // build pack §8: missing heartbeat is the only way to detect a dead worker.
    await this.pool.query(
      `insert into worker_heartbeats (worker_id, last_seen_at, version, detail)
       values ($1, now(), $2, $3)
       on conflict (worker_id) do update
         set last_seen_at = now(), version = excluded.version, detail = excluded.detail`,
      [
        this.workerId,
        /*
         * §243. The commit, not the package version.
         *
         * `npm_package_version` is `0.1.0` on every deploy Halyard has ever
         * made, so "which code is running" was unanswerable from outside the
         * container — and the deployed worker turned out to be missing three
         * job kinds, which was only discoverable by comparing the `kinds` list
         * against `JOB_KINDS` by eye.
         *
         * Railway sets `RAILWAY_GIT_COMMIT_SHA`; Vercel sets
         * `VERCEL_GIT_COMMIT_SHA`. Neither is present locally, and `unknown`
         * is the honest answer there rather than a version that means nothing.
         */
        process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ??
          process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
          process.env.GIT_COMMIT_SHA?.slice(0, 12) ??
          'unknown',
        { kinds: this.handledKinds },
      ],
    );

    /**
     * The same fact, on local disk, for the container healthcheck.
     *
     * The Dockerfile's HEALTHCHECK claimed to be "the container's own view" of
     * the heartbeat while running `node -e "process.exit(0)"`, which passes on
     * a wedged worker as readily as a healthy one. It cannot read the table
     * without a database round trip every sixty seconds, so the loop leaves a
     * mtime behind instead and the check reads that.
     *
     * Opt-in by environment variable so tests and local runs touch no disk.
     * Written after the insert: a worker that cannot reach the database is not
     * healthy, and should not be able to claim it is.
     */
    const livenessFile = process.env.HALYARD_LIVENESS_FILE?.trim();
    if (livenessFile) {
      await writeFile(livenessFile, `${new Date().toISOString()} ${this.workerId}\n`).catch(noop);
    }
  }

  async reap(): Promise<number> {
    const { rows } = await this.pool.query<{ reap_stale_jobs: number }>('select reap_stale_jobs()');
    const count = rows[0]?.reap_stale_jobs ?? 0;
    if (count > 0) this.log('reaped stale jobs', { count });
    return count;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.log('worker started', { kinds: this.handledKinds });

    await this.heartbeat();
    this.timers.push(setInterval(() => void this.heartbeat().catch(noop), this.heartbeatIntervalMs));
    this.timers.push(setInterval(() => void this.reap().catch(noop), this.reapIntervalMs));

    while (this.running) {
      try {
        const worked = await this.tick();
        if (!worked) await sleep(this.pollIntervalMs);
      } catch (err) {
        this.log('poll loop error', { error: (err as Error).message });
        await sleep(this.pollIntervalMs);
      }
    }
  }

  stop(): void {
    this.running = false;
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    this.log('worker stopping');
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function noop(): void {
  /* errors inside interval callbacks must not crash the loop */
}
