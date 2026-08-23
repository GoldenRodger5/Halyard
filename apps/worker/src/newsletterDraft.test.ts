/**
 * The weekly newsletter drafter, against a real Postgres.
 *
 * It had no test at all, and it runs on a schedule. What it does when there is
 * nobody to send to is the whole question: `subscribers` has no signup surface,
 * so the audience is zero and every weekly run was producing an issue in
 * `pending_approval` that could never be sent to anyone.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { HANDLERS } from './handlers/index.js';
import type { HandlerContext, Job } from './poller.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let accountId: string;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('newsletter_draft', 4);
  await pool.query(
    `insert into products (id, name, connector_type, destinations)
     values ('recipefix','RecipeFix','none','{"web":"https://recipefix.app"}'::jsonb)
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
  await pool.query('delete from newsletters');
  await pool.query('delete from subscribers');
  await pool.query('delete from publications');
  await pool.query('delete from content_items');
});

function ctx() {
  const logs: Array<{ message: string }> = [];
  return Object.assign(
    { pool, log: (m: string) => logs.push({ message: m }), enqueue: async () => undefined },
    { logs },
  ) as unknown as HandlerContext & { logs: Array<{ message: string }> };
}

const job = { id: 'j', kind: 'draft_newsletter', payload: {} } as unknown as Job;

async function seedPublishedPost(): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into content_items
       (product_id, account_id, platform, persona, format, category, status, body, published_at)
     values ('recipefix', $1, 'x','brand','text','education','published','A published post', now() - interval '1 day')
     returning id`,
    [accountId],
  );
  await pool.query(
    `insert into publications (content_item_id, account_id, platform, publish_mode, published_at, platform_post_id)
     values ($1, $2, 'x', 'direct', now() - interval '1 day', 'p1')`,
    [rows[0]!.id, accountId],
  );
}

async function subscribe(confirmed: boolean): Promise<void> {
  await pool.query(
    `insert into subscribers (product_id, email, confirmed_at)
     values ('recipefix', $1, $2)`,
    [`s${Math.abs(confirmed ? 1 : 2)}@example.com`, confirmed ? new Date() : null],
  );
}

d('draft_newsletter', () => {
  it('drafts nothing when there is nobody to send to', async () => {
    await seedPublishedPost();
    const c = ctx();
    await HANDLERS.draft_newsletter!(job, c);

    expect((await pool.query('select 1 from newsletters')).rows).toHaveLength(0);
    expect(c.logs.some((l) => l.message.includes('no confirmed subscribers'))).toBe(true);
  });

  it('does not count an unconfirmed subscriber as an audience', async () => {
    // `send_newsletter` filters on `confirmed_at is not null`, so an
    // unconfirmed row cannot receive the issue either.
    await seedPublishedPost();
    await subscribe(false);
    await HANDLERS.draft_newsletter!(job, ctx());
    expect((await pool.query('select 1 from newsletters')).rows).toHaveLength(0);
  });

  it('drafts once a confirmed subscriber exists', async () => {
    await seedPublishedPost();
    await subscribe(true);
    await HANDLERS.draft_newsletter!(job, ctx());

    const { rows } = await pool.query<{ status: string }>('select status from newsletters');
    expect(rows).toHaveLength(1);
    // Drafted for a human, never sent by this job.
    expect(rows[0]!.status).toBe('pending_approval');
  });
});
