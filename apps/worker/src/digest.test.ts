/**
 * The daily digest, against a real Postgres.
 *
 * The kind was declared, listed as a cron task, backed by two settings columns
 * since migration 0008 — and implemented by nothing. These cover the handler
 * that closes that, and in particular the two ways a digest goes wrong: it
 * cries wolf on a quiet day, or it silently drops the one day it mattered
 * because no email provider was configured.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { digestHandler, digestIsWorthSending, renderDigest, type DigestCounts } from './handlers/digest.js';
import { HANDLERS } from './handlers/index.js';
import type { Job } from './poller.js';
import { testContext, type TestContext } from './testContext.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let accountId: string;

const QUIET: DigestCounts = {
  awaitingApproval: 0,
  scheduled: 2,
  publishedYesterday: 1,
  failedJobs: 0,
  deadJobs: 0,
  workerSeenMinutesAgo: 1,
};

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('digest', 4);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict (id) do nothing`,
  );
  const { rows } = await pool.query<{ id: string }>(
    `insert into social_accounts (product_id, platform, persona, handle)
     values ('recipefix','x','brand','@rf') returning id`,
  );
  accountId = rows[0]!.id;
});

afterAll(async () => {
  if (pool) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from content_items');
  await pool.query('delete from notifications');
  await pool.query('delete from jobs');
  await pool.query('delete from worker_heartbeats');
  await pool.query(
    `insert into settings (id, daily_digest_enabled) values (true, true)
     on conflict (id) do update set daily_digest_enabled = true, alert_email = null`,
  );
});

function ctx(): TestContext {
  return testContext({ pool });
}

const job = { id: 'j', kind: 'digest_email', payload: {} } as unknown as Job;

async function seedAwaiting(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await pool.query(
      `insert into content_items
         (product_id, account_id, platform, persona, format, category, status, body)
       values ('recipefix', $1, 'x','brand','text','education','pending_approval','b')`,
      [accountId],
    );
  }
}

describe('digestIsWorthSending', () => {
  it('stays quiet when nothing needs the operator', () => {
    // A digest that says "nothing happened" every day is one people filter,
    // and then they filter the one that mattered too.
    expect(digestIsWorthSending(QUIET)).toBe(false);
  });

  it('speaks when something is waiting for approval', () => {
    expect(digestIsWorthSending({ ...QUIET, awaitingApproval: 1 })).toBe(true);
  });

  it('speaks when a job failed or died', () => {
    expect(digestIsWorthSending({ ...QUIET, failedJobs: 1 })).toBe(true);
    expect(digestIsWorthSending({ ...QUIET, deadJobs: 1 })).toBe(true);
  });

  it('speaks when the worker has gone quiet, which nothing else surfaces', () => {
    expect(digestIsWorthSending({ ...QUIET, workerSeenMinutesAgo: null })).toBe(true);
    expect(digestIsWorthSending({ ...QUIET, workerSeenMinutesAgo: 45 })).toBe(true);
  });
});

describe('renderDigest', () => {
  it('names the counts an operator would act on', () => {
    const body = renderDigest({ ...QUIET, awaitingApproval: 3 }, 'RecipeFix');
    expect(body).toContain('Waiting for you:      3');
    expect(body).toContain('Nothing publishes until you approve it.');
  });

  it('says the worker is dead rather than omitting it', () => {
    expect(renderDigest({ ...QUIET, workerSeenMinutesAgo: null }, 'RecipeFix')).toContain(
      'never seen',
    );
  });

  it('leaves out failure lines when there are none', () => {
    expect(renderDigest(QUIET, 'RecipeFix')).not.toContain('Failed jobs');
  });
});

d('digestHandler', () => {
  it('records the digest as a notification when no email provider is configured', async () => {
    await seedAwaiting(2);
    await digestHandler(job, ctx());

    const { rows } = await pool.query<{ title: string; body: string }>(
      'select title, body from notifications',
    );
    // Not dropped: the dashboard is where the operator already looks.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toContain('Waiting for you:      2');
  });

  it('writes nothing at all on a quiet day', async () => {
    await pool.query(
      `insert into worker_heartbeats (worker_id, last_seen_at) values ('w', now())`,
    );
    await digestHandler(job, ctx());
    expect((await pool.query('select 1 from notifications')).rows).toHaveLength(0);
  });

  it('respects the setting that turns it off', async () => {
    await seedAwaiting(2);
    await pool.query('update settings set daily_digest_enabled = false where id = true');
    await digestHandler(job, ctx());
    expect((await pool.query('select 1 from notifications')).rows).toHaveLength(0);
  });

  it('counts a missing worker as something worth saying', async () => {
    // No heartbeat row at all — nothing is running, and no other daily signal
    // would tell the operator.
    await digestHandler(job, ctx());
    const { rows } = await pool.query<{ body: string }>('select body from notifications');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toContain('never seen');
  });
});

/**
 * §130. The retention window is an operator setting, and null means keep
 * everything. These assert the mechanism honours that rather than assuming a
 * default nobody chose.
 */
d('purge_logs', () => {
  beforeEach(async () => {
    await pool.query('delete from jobs');
    await pool.query(
      `insert into settings (id) values (true) on conflict (id) do update set log_retention_days = null`,
    );
    await pool.query(
      `insert into jobs (kind, status, finished_at, created_at)
       values ('render','done', now() - interval '400 days', now() - interval '400 days')`,
    );
  });

  it('deletes nothing at all when no window has been set', async () => {
    const c = ctx();
    await HANDLERS.purge_logs!({ id: 'j', kind: 'purge_logs', payload: {} } as never, c);

    // Null is the absence of a policy, not a policy. A 400-day-old finished job
    // survives because nobody has said it should not.
    expect((await pool.query('select 1 from jobs')).rows).toHaveLength(1);
    expect(c.logs.some((l) => l.includes('no retention window'))).toBe(true);
  });

  it('applies exactly the window the operator chose', async () => {
    await pool.query('update settings set log_retention_days = 30 where id = true');
    await HANDLERS.purge_logs!({ id: 'j', kind: 'purge_logs', payload: {} } as never, ctx());
    expect((await pool.query('select 1 from jobs')).rows).toHaveLength(0);
  });

  it('keeps rows inside the chosen window', async () => {
    await pool.query('delete from jobs');
    await pool.query(
      `insert into jobs (kind, status, finished_at, created_at)
       values ('render','done', now() - interval '5 days', now() - interval '5 days')`,
    );
    await pool.query('update settings set log_retention_days = 30 where id = true');
    await HANDLERS.purge_logs!({ id: 'j', kind: 'purge_logs', payload: {} } as never, ctx());
    expect((await pool.query('select 1 from jobs')).rows).toHaveLength(1);
  });
});
