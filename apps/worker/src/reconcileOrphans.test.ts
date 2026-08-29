/**
 * §261. The sweeper for rows a dead stage left behind.
 *
 * Three of these were live in production at once, all the same shape: a row
 * marked in-progress by a stage that then aborted, with no job pointing at it
 * and no error to explain it. The oldest had been sitting eleven hours.
 *
 * The risk in a sweeper is that it races live work, so most of what is asserted
 * here is what it must *not* touch.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { reconcileScheduleHandler } from './handlers/reconcile.js';
import type { HandlerContext, Job } from './poller.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let accountId = '';

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('reconcile_orphans', 6);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')`,
  );
  const { rows } = await pool.query<{ id: string }>(
    `insert into social_accounts (product_id, platform, persona, handle, capability_state)
     values ('recipefix','tiktok','brand','recipefix','draft_only') returning id`,
  );
  accountId = rows[0]!.id;
  // renders.template_id is a real foreign key.
  await pool.query(
    `insert into templates (id, product_id, renderer, format, aspect_ratio, props_schema, description, enabled)
     values ('TransformationDiff','recipefix','remotion','video','9:16','{}','test template', true)
     on conflict (id) do nothing`,
  );
}, 120_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from renders');
  await pool.query('delete from jobs');
  await pool.query('delete from content_items');
  await pool.query('delete from ideas');
});

function context(): HandlerContext & { logs: Array<{ message: string }> } {
  const logs: Array<{ message: string }> = [];
  return {
    pool,
    workerId: 'test',
    logs,
    log: (message: string) => logs.push({ message }),
    enqueue: async () => undefined,
  } as unknown as HandlerContext & { logs: Array<{ message: string }> };
}

const job = () => ({ id: 'j1', kind: 'reconcile_schedule', payload: {} }) as unknown as Job;

/** A render row, optionally aged past the orphan threshold. */
async function seedRender(ageHours: number): Promise<string> {
  const item = await pool.query<{ id: string }>(
    `insert into content_items (product_id, account_id, platform, persona, format, category, body, status)
     values ('recipefix',$1,'tiktok','brand','video','education','B.','pending_approval') returning id`,
    [accountId],
  );
  const { rows } = await pool.query<{ id: string }>(
    `insert into renders (content_item_id, template_id, renderer, input_props, quality, status, created_at)
     values ($1,'TransformationDiff','remotion','{}','final','queued', now() - ($2 || ' hours')::interval)
     returning id`,
    [item.rows[0]!.id, ageHours],
  );
  return rows[0]!.id;
}

const statusOf = async (id: string) =>
  (await pool.query<{ status: string }>('select status from renders where id = $1', [id])).rows[0]!
    .status;

d('orphaned renders', () => {
  it('fails a queued render that no job will ever claim', async () => {
    const id = await seedRender(5);
    await reconcileScheduleHandler(job(), context());
    expect(await statusOf(id)).toBe('failed');
  });

  it('records why, because a silently repaired row hides the bug upstream', async () => {
    const id = await seedRender(5);
    await reconcileScheduleHandler(job(), context());
    const { rows } = await pool.query<{ error: string }>(
      'select error from renders where id = $1',
      [id],
    );
    expect(rows[0]!.error).toContain('Orphaned');
  });

  it('leaves a render whose job is still queued alone', async () => {
    /* The race that would matter: work in flight must never be swept. */
    const id = await seedRender(5);
    await pool.query(
      `insert into jobs (kind, payload, status) values ('render', $1::jsonb, 'queued')`,
      [JSON.stringify({ renderId: id })],
    );
    await reconcileScheduleHandler(job(), context());
    expect(await statusOf(id)).toBe('queued');
  });

  it('leaves a render whose job is running alone', async () => {
    const id = await seedRender(5);
    await pool.query(
      `insert into jobs (kind, payload, status) values ('render', $1::jsonb, 'running')`,
      [JSON.stringify({ renderId: id })],
    );
    await reconcileScheduleHandler(job(), context());
    expect(await statusOf(id)).toBe('queued');
  });

  it('leaves a render young enough to still be in flight', async () => {
    /* A slow render is not an abandoned one. The observed worst case is 69s. */
    const id = await seedRender(0);
    await reconcileScheduleHandler(job(), context());
    expect(await statusOf(id)).toBe('queued');
  });

  it('never touches a render that already finished', async () => {
    const id = await seedRender(5);
    await pool.query(`update renders set status = 'done' where id = $1`, [id]);
    await reconcileScheduleHandler(job(), context());
    expect(await statusOf(id)).toBe('done');
  });
});

d('ideas abandoned mid-claim', () => {
  const seedIdea = async (status: string, ageHours: number) => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into ideas (product_id, title, angle, category, status, created_at)
       values ('recipefix','An idea','An angle','education',$1,
               now() - ($2 || ' hours')::interval)
       returning id`,
      [status, ageHours],
    );
    return rows[0]!.id;
  };
  const ideaStatus = async (id: string) =>
    (await pool.query<{ status: string }>('select status from ideas where id = $1', [id])).rows[0]!
      .status;

  it('returns a claimed idea that produced nothing to the pool', async () => {
    /*
     * `generate` claims an idea before spending on it and marks it `used` when
     * the drafts land. A run that dies between the two loses the idea forever:
     * never drafted, never re-proposed. Five were stuck this way.
     */
    const id = await seedIdea('selected', 5);
    await reconcileScheduleHandler(job(), context());
    expect(await ideaStatus(id)).toBe('proposed');
  });

  it('never re-proposes a claimed idea that did produce content', async () => {
    /*
     * It was drafted; re-proposing would draft the same idea twice. §285 closes
     * it as `used` rather than leaving it `selected` forever — this asserted
     * `selected`, which was the limbo state, not the intent.
     */
    const id = await seedIdea('selected', 5);
    await pool.query(
      `insert into content_items (product_id, account_id, idea_id, platform, persona, format, category, body, status)
       values ('recipefix',$1,$2,'tiktok','brand','video','education','B.','pending_approval')`,
      [accountId, id],
    );
    await reconcileScheduleHandler(job(), context());
    expect(await ideaStatus(id)).not.toBe('proposed');
  });

  it('does not release a claim while a generate job is still running', async () => {
    const id = await seedIdea('selected', 5);
    await pool.query(`insert into jobs (kind, payload, status) values ('generate','{}'::jsonb,'running')`);
    await reconcileScheduleHandler(job(), context());
    expect(await ideaStatus(id)).toBe('selected');
  });

  it('leaves a used idea used', async () => {
    const id = await seedIdea('used', 5);
    await reconcileScheduleHandler(job(), context());
    expect(await ideaStatus(id)).toBe('used');
  });
});

d('ideas that produced content but were never closed', () => {
  const seedIdea = async (status: string, ageHours: number) => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into ideas (product_id, title, angle, category, status, created_at)
       values ('recipefix','An idea','An angle','education',$1,
               now() - ($2 || ' hours')::interval)
       returning id`,
      [status, ageHours],
    );
    return rows[0]!.id;
  };
  const ideaStatus = async (id: string) =>
    (await pool.query<{ status: string }>('select status from ideas where id = $1', [id])).rows[0]!
      .status;

  it('closes an old claim that did produce drafts', async () => {
    /*
     * §285. `generate` marks an idea used only after its whole loop finishes,
     * so a run that dies partway leaves it `selected` with drafts already made.
     * The release sweep will not touch those — it only frees claims that
     * produced nothing — so they sat in limbo: never re-proposed, never drafted
     * again. Four were.
     */
    const id = await seedIdea('selected', 5);
    await pool.query(
      `insert into content_items (product_id, account_id, idea_id, platform, persona, format, category, body, status)
       values ('recipefix',$1,$2,'tiktok','brand','video','education','B.','pending_approval')`,
      [accountId, id],
    );
    await reconcileScheduleHandler(job(), context());
    /* Used, not proposed: re-proposing would draft the same idea twice. */
    expect(await ideaStatus(id)).toBe('used');
  });

  it('still releases an old claim that produced nothing', async () => {
    const id = await seedIdea('selected', 5);
    await reconcileScheduleHandler(job(), context());
    expect(await ideaStatus(id)).toBe('proposed');
  });

  it('leaves a fresh claim alone whether or not it produced anything', async () => {
    const young = await seedIdea('selected', 0);
    await pool.query(
      `insert into content_items (product_id, account_id, idea_id, platform, persona, format, category, body, status)
       values ('recipefix',$1,$2,'tiktok','brand','video','education','B.','pending_approval')`,
      [accountId, young],
    );
    await reconcileScheduleHandler(job(), context());
    expect(await ideaStatus(young)).toBe('selected');
  });
});
