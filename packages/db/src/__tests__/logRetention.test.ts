/**
 * The operational-log purge, against a real Postgres.
 *
 * This is a *capability* test, not a policy test. The function takes its window
 * as an argument and no schedule calls it — the point of these assertions is
 * that when someone does choose a window, the thing they invoke removes exactly
 * what it should and nothing that is still live.
 *
 * The negative cases carry the weight: a queued job, an unread notification and
 * every audit_log row must survive a purge that is otherwise deleting
 * everything.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from './testDb.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('log_retention', 4);
});

afterAll(async () => {
  if (pool) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from jobs');
  await pool.query('delete from notifications');
  await pool.query('delete from audit_log');
});

async function purge(window = '30 days'): Promise<Record<string, number>> {
  const { rows } = await pool.query<{ table_name: string; purged: string }>(
    'select * from purge_operational_logs($1::interval)',
    [window],
  );
  return Object.fromEntries(rows.map((r) => [r.table_name, Number(r.purged)]));
}

async function count(table: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(`select count(*) as n from ${table}`);
  return Number(rows[0]!.n);
}

d('purge_operational_logs', () => {
  it('removes a finished job that is older than the window', async () => {
    await pool.query(
      `insert into jobs (kind, status, finished_at, created_at)
       values ('render','done', now() - interval '90 days', now() - interval '90 days')`,
    );
    const result = await purge();
    expect(result.jobs).toBe(1);
    expect(await count('jobs')).toBe(0);
  });

  it('keeps a finished job that is inside the window', async () => {
    await pool.query(
      `insert into jobs (kind, status, finished_at, created_at)
       values ('render','done', now() - interval '1 day', now() - interval '1 day')`,
    );
    await purge();
    expect(await count('jobs')).toBe(1);
  });

  it('never deletes a job that has not run, however old it is', async () => {
    // Live state, not history. Deleting this loses work rather than a record.
    await pool.query(
      `insert into jobs (kind, status, created_at, run_after)
       values ('publish','queued', now() - interval '400 days', now() - interval '400 days')`,
    );
    const result = await purge();
    expect(result.jobs).toBe(0);
    expect(await count('jobs')).toBe(1);
  });

  it('never deletes a running job', async () => {
    await pool.query(
      `insert into jobs (kind, status, created_at, locked_at, locked_by)
       values ('publish','running', now() - interval '400 days', now(), 'w1')`,
    );
    await purge();
    expect(await count('jobs')).toBe(1);
  });

  /**
   * By age, not by read state — 0038.
   *
   * The first version of this purge only removed notifications with `read_at`
   * set, and **nothing in Halyard ever sets it**: there is no dismiss control
   * and no code writes the column. The predicate matched nothing at any window,
   * so notification retention was a setting that did nothing at all.
   */
  it('removes an old notification regardless of read state', async () => {
    await pool.query(
      `insert into notifications (kind, severity, title, body, created_at)
       values ('digest','info','old','b', now() - interval '90 days')`,
    );
    const result = await purge();
    expect(result.notifications).toBe(1);
    expect(await count('notifications')).toBe(0);
  });

  it('keeps a notification inside the window', async () => {
    // The operator's protection is the length of the window they chose, which
    // is a real control, rather than a flag nothing sets.
    await pool.query(
      `insert into notifications (kind, severity, title, body, created_at)
       values ('digest','info','recent','b', now() - interval '2 days')`,
    );
    await purge();
    expect(await count('notifications')).toBe(1);
  });

  it('never deletes an audit_log row, and says how many it left', async () => {
    await pool.query(
      `insert into audit_log (actor, action, entity_type, entity_id, created_at)
       values ('human','approved','content_item', gen_random_uuid(), now() - interval '400 days')`,
    );

    const result = await purge();
    expect(await count('audit_log')).toBe(1);
    // Counted, not deleted — its retention is a compliance decision.
    expect(result['audit_log (retained, never purged)']).toBe(1);
  });

  it('reports every table it considered, so a zero is a measurement', async () => {
    const result = await purge();
    expect(Object.keys(result).sort()).toEqual([
      'agent_runs',
      'audit_log (retained, never purged)',
      'capability_probes',
      'jobs',
      'notifications',
    ]);
  });

  it('honours the window it is given rather than one of its own', async () => {
    await pool.query(
      `insert into jobs (kind, status, finished_at, created_at)
       values ('render','done', now() - interval '10 days', now() - interval '10 days')`,
    );
    expect((await purge('30 days')).jobs).toBe(0);
    expect((await purge('5 days')).jobs).toBe(1);
  });
});
