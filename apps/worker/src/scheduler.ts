/**
 * Periodic work, scheduled by the worker itself.
 *
 * Until now every recurring job depended on something outside the process
 * calling `/api/cron/[task]`, and nothing was configured to call it — so
 * "runs weekly" meant "exists, and has never run". A verification gate that
 * never runs is worse than none, because it reads as coverage.
 *
 * This is a tick, not a cron daemon: every pass computes which periodic jobs are
 * due, enqueues them with a dedupe key bucketed to their interval, and lets the
 * unique index throw away the duplicates. Several workers can run this at once
 * and exactly one of each job survives.
 *
 * Web-side crons still exist for the two things that need the web app's
 * environment — token refresh needs the OAuth client secrets — and those are in
 * vercel.json.
 */
import type pg from 'pg';
import type { JobKind } from '@halyard/db';

export interface Schedule {
  kind: JobKind;
  /** How often it should run. */
  everyMinutes: number;
  /** One job per product, rather than one job overall. */
  perProduct?: boolean;
  payload?: Record<string, unknown>;
  priority?: number;
  /** Why this cadence, so changing it is a decision rather than a guess. */
  why: string;
}

export const SCHEDULES: Schedule[] = [
  {
    // The release check is cheap — one GET of the product's homepage — and it is
    // the trigger for everything else that reacts to a deploy.
    kind: 'detect_release',
    everyMinutes: 30,
    perProduct: true,
    priority: 20,
    why: 'RecipeFix ships through Lovable with no CI and no release notes, so a deploy is only observable from the outside. Thirty minutes bounds how long a broken flow can look healthy.',
  },
  {
    kind: 'capture',
    everyMinutes: 7 * 24 * 60,
    perProduct: true,
    payload: { flowId: 'adapt_and_reveal', verifyOnly: true },
    priority: 30,
    why: 'The weekly floor from milestone 41. Release detection catches deploys; this catches the case where nothing shipped but the page changed anyway.',
  },
  {
    kind: 'mark_stale_assets',
    everyMinutes: 24 * 60,
    perProduct: true,
    priority: 40,
    why: 'Staleness is measured in days, so checking more often than daily produces the same answer.',
  },
  {
    kind: 'collect_app_store',
    everyMinutes: 24 * 60,
    priority: 40,
    why: 'Apple produces these reports daily; polling faster returns the same instance.',
  },
  {
    kind: 'collect_watch_terms',
    everyMinutes: 24 * 60,
    perProduct: true,
    priority: 55,
    why: 'Read-only, once a day, over public endpoints that ask to be treated politely. Recurrence is measured over 30 days, so reading more often changes nothing.',
  },
  {
    kind: 'collect_signals',
    everyMinutes: 6 * 60,
    perProduct: true,
    priority: 50,
    why: 'Watch terms and RSS. Frequent enough to catch a story the same day, rare enough not to hammer Reddit.',
  },
  {
    kind: 'reconcile_schedule',
    everyMinutes: 60,
    perProduct: true,
    priority: 60,
    why: 'A missed slot should be noticed within the hour, not the next morning.',
  },
  {
    kind: 'score_performance',
    everyMinutes: 24 * 60,
    perProduct: true,
    priority: 30,
    why: 'Scoring reads metric time series that only move on the polling schedule.',
  },
];

/**
 * The bucket an interval is currently in.
 *
 * Flooring wall-clock time into interval-sized buckets means the dedupe key is
 * stable for the whole window, so a worker restarting mid-window does not
 * enqueue a second copy.
 */
export function bucketFor(everyMinutes: number, now: Date = new Date()): number {
  return Math.floor(now.getTime() / (everyMinutes * 60_000));
}

export async function enqueueDueJobs(
  pool: pg.Pool,
  now: Date = new Date(),
): Promise<{ enqueued: number }> {
  const { rows: products } = await pool.query<{ id: string }>(
    `select id from products where status = 'active' and kind = 'product'`,
  );

  let enqueued = 0;

  for (const schedule of SCHEDULES) {
    const bucket = bucketFor(schedule.everyMinutes, now);
    const targets = schedule.perProduct ? products.map((p) => p.id) : [null];

    for (const productId of targets) {
      const payload = {
        ...(schedule.payload ?? {}),
        ...(productId ? { productId } : {}),
      };
      const dedupeKey = `sched:${schedule.kind}:${productId ?? 'all'}:${bucket}`;

      const { rowCount } = await pool.query(
        `insert into jobs (kind, payload, priority, dedupe_key)
         values ($1, $2, $3, $4)
         on conflict do nothing`,
        [schedule.kind, payload, schedule.priority ?? 50, dedupeKey],
      );
      enqueued += rowCount ?? 0;
    }
  }

  return { enqueued };
}

/**
 * Run the tick on a loop.
 *
 * A minute is well under the shortest interval, so a job is never more than a
 * minute late, and the query is three statements against an indexed table.
 */
export function startScheduler(
  pool: pg.Pool,
  log: (message: string, detail?: Record<string, unknown>) => void,
  intervalMs = 60_000,
): () => void {
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const { enqueued } = await enqueueDueJobs(pool);
      if (enqueued > 0) log('scheduler enqueued periodic jobs', { enqueued });
    } catch (err) {
      // A scheduling failure must not take the worker down; the next tick
      // retries, and the queue-depth alert notices if nothing is arriving.
      log('scheduler tick failed', { error: (err as Error).message });
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
