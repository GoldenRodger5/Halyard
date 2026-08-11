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
    /**
     * Token refresh, hourly, here rather than on the web tier.
     *
     * It was declared as a Vercel cron at `0 * * * *` and nothing else. The
     * first production deploy refused it: **Hobby accounts are limited to one
     * cron run per day**, so the schedule that keeps every OAuth token alive
     * would have run once daily at best — and on a plan change or a rebuild,
     * possibly not at all.
     *
     * The worker has no such limit and already holds a scheduler, so this is
     * where it belongs. The web tier keeps a daily run as a backstop for the
     * case where the worker is down, which is the one failure the worker cannot
     * cover for itself.
     */
    kind: 'refresh_tokens',
    everyMinutes: 60,
    priority: 10,
    why: 'Access tokens expire in hours on most platforms, and a dead token is only discovered by a publish job failing at its slot. Hourly costs nothing and bounds the exposure to an hour.',
  },
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
    kind: 'collect_reviews',
    everyMinutes: 12 * 60,
    perProduct: true,
    priority: 55,
    why: 'App Store reviews trickle in; twice a day is often enough to answer one the same day without polling a rate-limited endpoint.',
  },
  {
    kind: 'draft_newsletter',
    everyMinutes: 7 * 24 * 60,
    perProduct: true,
    priority: 45,
    why: 'One issue a week, drafted into the approval queue. Sending is a separate job that only ever runs on a row a human approved.',
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

      /**
       * `on conflict do nothing` is not enough here, and production proved it.
       *
       * The dedupe index is partial:
       *
       *     create unique index jobs_dedupe_idx on jobs (dedupe_key)
       *       where dedupe_key is not null and status in ('queued','running')
       *
       * which is right for its original purpose — a retried publish should be
       * able to reuse a key once the first attempt has finished. But it means a
       * *completed* job leaves the index, the conflict stops firing, and the
       * next tick enqueues the same bucket again. The scheduler ticks every
       * minute, so every schedule ran every minute regardless of its interval:
       * eleven hours of production produced 694 runs of a thirty-minute job,
       * and 6,284 jobs in total.
       *
       * It could not show up locally, because it needs the worker to be left
       * running for longer than one interval.
       *
       * So the guard is on the row existing in *any* status, which is what
       * "already done this bucket" actually means.
       */
      const { rowCount } = await pool.query(
        `insert into jobs (kind, payload, priority, dedupe_key)
         select $1, $2, $3, $4
          where not exists (select 1 from jobs where dedupe_key = $4)
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
