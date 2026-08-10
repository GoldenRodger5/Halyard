/**
 * Job poller correctness. Build pack §6 calls this out explicitly:
 * "SKIP LOCKED correctness under concurrency; stale lock reaping".
 *
 * Two workers polling at the same instant must never receive the same row. That
 * is the property that keeps a `publish` job from running twice.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from './testDb.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('jobs', 16);
}, 90_000);

afterAll(async () => {
  if (pool) await pool.end();
});

d('claim_next_job — FOR UPDATE SKIP LOCKED', () => {
  it('hands each job to exactly one worker under concurrency', async () => {
    await pool.query('delete from jobs');
    const jobCount = 40;
    await pool.query(
      `insert into jobs (kind, payload)
       select 'render', jsonb_build_object('n', g) from generate_series(1, $1) g`,
      [jobCount],
    );

    // 12 workers, each draining until the queue is empty, all at once.
    const workers = Array.from({ length: 12 }, (_, i) => `worker-${i}`);
    const claimed = await Promise.all(
      workers.map(async (workerId) => {
        const mine: string[] = [];
        for (;;) {
          const { rows } = await pool.query<{ id: string }>(
            'select * from claim_next_job($1)',
            [workerId],
          );
          if (rows.length === 0) break;
          mine.push(rows[0]!.id);
        }
        return mine;
      }),
    );

    const all = claimed.flat();
    expect(all).toHaveLength(jobCount);
    expect(new Set(all).size).toBe(jobCount); // zero overlap
  });

  it('does not claim jobs whose run_after is in the future', async () => {
    await pool.query('delete from jobs');
    await pool.query(
      `insert into jobs (kind, run_after) values ('render', now() + interval '1 hour')`,
    );
    const { rows } = await pool.query('select * from claim_next_job($1)', ['w']);
    expect(rows).toHaveLength(0);
  });

  it('respects the priority then created_at ordering', async () => {
    await pool.query('delete from jobs');
    await pool.query(`insert into jobs (kind, priority) values ('render', 100)`);
    await pool.query(`insert into jobs (kind, priority) values ('publish', 1)`);
    const { rows } = await pool.query<{ kind: string }>('select * from claim_next_job($1)', ['w']);
    expect(rows[0]?.kind).toBe('publish');
  });

  it('filters by kind when a worker only handles some job types', async () => {
    await pool.query('delete from jobs');
    await pool.query(`insert into jobs (kind) values ('render'), ('publish')`);
    const { rows } = await pool.query<{ kind: string }>('select * from claim_next_job($1, $2)', [
      'w',
      ['publish'],
    ]);
    expect(rows[0]?.kind).toBe('publish');
  });

  it('increments attempts on every claim', async () => {
    await pool.query('delete from jobs');
    const { rows: inserted } = await pool.query<{ id: string }>(
      `insert into jobs (kind) values ('render') returning id`,
    );
    const id = inserted[0]!.id;
    const { rows } = await pool.query<{ attempts: number }>('select * from claim_next_job($1)', [
      'w',
    ]);
    expect(rows[0]?.attempts).toBe(1);
    await pool.query(`update jobs set status = 'queued' where id = $1`, [id]);
    const { rows: second } = await pool.query<{ attempts: number }>(
      'select * from claim_next_job($1)',
      ['w'],
    );
    expect(second[0]?.attempts).toBe(2);
  });
});

d('reap_stale_jobs', () => {
  it('requeues a job whose worker died mid-run', async () => {
    await pool.query('delete from jobs');
    await pool.query(
      `insert into jobs (kind, status, locked_at, locked_by, attempts, max_attempts)
       values ('render', 'running', now() - interval '45 minutes', 'dead-worker', 1, 3)`,
    );
    const { rows } = await pool.query<{ reap_stale_jobs: number }>('select reap_stale_jobs()');
    expect(rows[0]?.reap_stale_jobs).toBe(1);
    const { rows: after } = await pool.query<{ status: string; locked_by: string | null }>(
      'select status, locked_by from jobs',
    );
    expect(after[0]?.status).toBe('queued');
    expect(after[0]?.locked_by).toBeNull();
  });

  it('marks a job dead rather than requeuing it once attempts are exhausted', async () => {
    await pool.query('delete from jobs');
    await pool.query(
      `insert into jobs (kind, status, locked_at, locked_by, attempts, max_attempts)
       values ('publish', 'running', now() - interval '45 minutes', 'dead-worker', 3, 3)`,
    );
    await pool.query('select reap_stale_jobs()');
    const { rows } = await pool.query<{ status: string }>('select status from jobs');
    expect(rows[0]?.status).toBe('dead');
  });

  it('leaves a healthy running job alone', async () => {
    await pool.query('delete from jobs');
    await pool.query(
      `insert into jobs (kind, status, locked_at, locked_by)
       values ('render', 'running', now() - interval '2 minutes', 'live-worker')`,
    );
    const { rows } = await pool.query<{ reap_stale_jobs: number }>('select reap_stale_jobs()');
    expect(rows[0]?.reap_stale_jobs).toBe(0);
  });
});

d('job dedupe key', () => {
  it('refuses a second queued job with the same dedupe key', async () => {
    await pool.query('delete from jobs');
    await pool.query(
      `insert into jobs (kind, dedupe_key) values ('collect_metrics', 'metrics:pub-1')`,
    );
    await expect(
      pool.query(`insert into jobs (kind, dedupe_key) values ('collect_metrics', 'metrics:pub-1')`),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('allows the same key again once the first job has finished', async () => {
    await pool.query('delete from jobs');
    await pool.query(
      `insert into jobs (kind, dedupe_key, status) values ('collect_metrics', 'metrics:pub-2', 'done')`,
    );
    await expect(
      pool.query(`insert into jobs (kind, dedupe_key) values ('collect_metrics', 'metrics:pub-2')`),
    ).resolves.toBeTruthy();
  });
});
