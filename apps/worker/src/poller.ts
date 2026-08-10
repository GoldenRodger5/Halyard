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
import type pg from 'pg';
import { JOB_POLICY, type JobKind } from '@halyard/db';

export interface Job {
  id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  dedupe_key: string | null;
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
      // Claimed something we cannot run. Put it back rather than failing it.
      await this.pool.query(
        `update jobs set status='queued', locked_at=null, locked_by=null, attempts=attempts-1 where id=$1`,
        [job.id],
      );
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
    const exhausted = job.attempts >= job.max_attempts;
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
      [job.id, exhausted ? 'dead' : 'queued', error.message.slice(0, 2000), exhausted ? 0 : delay],
    );

    this.log(exhausted ? 'job dead' : 'job failed, will retry', {
      kind: job.kind,
      id: job.id,
      attempts: job.attempts,
      error: error.message.slice(0, 500),
    });
  }

  async heartbeat(): Promise<void> {
    // build pack §8: missing heartbeat is the only way to detect a dead worker.
    await this.pool.query(
      `insert into worker_heartbeats (worker_id, last_seen_at, version, detail)
       values ($1, now(), $2, $3)
       on conflict (worker_id) do update
         set last_seen_at = now(), version = excluded.version, detail = excluded.detail`,
      [this.workerId, process.env.npm_package_version ?? '0.1.0', { kinds: this.handledKinds }],
    );
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
