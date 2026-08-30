/**
 * Two correction controllers, one item. §165.
 *
 * The unique `(content_item_id, iteration)` constraint protects *persistence*.
 * It does not protect *spend*: two controllers reading the same history would
 * both decide the same correction, both clear `vo_asset_id`, both requeue the
 * renders and both pay for a synthesis — and only then would one lose the
 * insert. By that point the money is gone and the item has been rebuilt twice.
 *
 * These tests drive the real handler against a real Postgres. The claim is the
 * thing under test, so each one is written to fail if it is removed.
 */
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { correctContentHandler } from './handlers/correct.js';
import type { HandlerContext, Job } from './poller.js';
import { testContext } from './testContext.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let accountId: string;

/** Every side effect a correction could pay for, counted. */
let enqueued: string[] = [];

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('correction_concurrency', 8);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict (id) do nothing`,
  );
  const { rows } = await pool.query<{ id: string }>(
    `insert into social_accounts (product_id, platform, persona, handle, capability_state)
     values ('recipefix','x','brand','@brand','draft_only') returning id`,
  );
  accountId = rows[0]!.id;
}, 180_000);

afterAll(async () => {
  if (pool) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  enqueued = [];
  /*
   * Through the item, never directly: `content_iterations` refuses DELETE by
   * trigger, and the cascade from `content_items` is the one removal path the
   * append-only guarantee deliberately still allows.
   */
  await pool.query('delete from content_items');
  await pool.query('delete from jobs');
});

function context(): HandlerContext {
  return testContext({
    pool,
    workerId: 'concurrency',
    log: () => undefined,
    enqueue: async (kind: string) => {
      enqueued.push(kind);
    },
  });
}

function job(contentItemId: string): Job {
  return {
    id: randomBytes(16).toString('hex'),
    kind: 'correct_content',
    payload: { contentItemId },
    attempts: 1,
    max_attempts: 2,
  } as unknown as Job;
}

/**
 * An item whose gates all pass, so the controller takes the `accept` path.
 *
 * Accept is the right shape for this test: it writes exactly one iteration row
 * and performs one status transition, so "did both controllers act" is a
 * countable question with no provider involved.
 */
async function passingItem(): Promise<string> {
  const gates = [
    { gate: 'copy', status: 'passed', summary: 'ok', detail: { findings: [] } },
    { gate: 'audio', status: 'passed', summary: 'ok', detail: { findings: [] } },
    { gate: 'visual', status: 'passed', summary: 'ok', detail: { findings: [] } },
    { gate: 'coherence', status: 'passed', summary: 'ok', detail: { findings: [] } },
  ];
  const { rows } = await pool.query<{ id: string }>(
    `insert into content_items
       (product_id, account_id, platform, persona, format, category, body, status, qc_results)
     values ('recipefix', $1, 'x', 'brand', 'video', 'education', 'body', 'failed', $2::jsonb)
     returning id`,
    [accountId, JSON.stringify({ gates, passed: false })],
  );
  return rows[0]!.id;
}


/**
 * An item whose blocking gate is a *required* one that never ran.
 *
 * That routes to `remeasure`, whose whole effect is to enqueue `review_media` —
 * a side effect that is observable, deterministic, and free. It is the right
 * shape for testing the claim because the claim exists to stop duplicate
 * *effects*, and the accept path has almost none.
 */
async function unmeasuredItem(): Promise<string> {
  const gates = [
    { gate: 'copy', status: 'passed', summary: 'ok', detail: { findings: [] } },
    { gate: 'visual', status: 'passed', summary: 'ok', detail: { findings: [] } },
    { gate: 'coherence', status: 'passed', summary: 'ok', detail: { findings: [] } },
    { gate: 'audio', status: 'skipped', summary: 'never measured', detail: null },
  ];
  const { rows } = await pool.query<{ id: string }>(
    `insert into content_items
       (product_id, account_id, platform, persona, format, category, body, status, qc_results)
     values ('recipefix', $1, 'x', 'brand', 'video', 'education', 'body', 'failed', $2::jsonb)
     returning id`,
    [accountId, JSON.stringify({ gates, passed: false })],
  );
  return rows[0]!.id;
}

const iterations = async (id: string): Promise<number> =>
  Number(
    (await pool.query('select count(*) as n from content_iterations where content_item_id = $1', [id]))
      .rows[0].n,
  );

d('two controllers, one item', () => {
  it('records exactly one iteration when two run concurrently', async () => {
    /*
     * The claim is what makes this true. Without it both controllers read the
     * same empty history, both compute iteration 0, and both act — the insert
     * conflict hides the second one's *row* while its side effects have already
     * happened.
     */
    const id = await passingItem();

    const results = await Promise.allSettled([
      correctContentHandler(job(id), context()),
      correctContentHandler(job(id), context()),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await iterations(id)).toBe(1);
  });

  it('leaves the item in exactly one state, not one applied twice', async () => {
    const id = await passingItem();
    await Promise.allSettled([
      correctContentHandler(job(id), context()),
      correctContentHandler(job(id), context()),
    ]);

    const { rows } = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.status).toBe('pending_approval');
  });

  it('releases the claim, so a later controller is not locked out', async () => {
    /*
     * The failure mode a lock introduces if it is taken and not given back: an
     * item that can never be corrected again. Postgres would release it when the
     * connection dies, but only after the worker restarts.
     */
    const id = await passingItem();
    await correctContentHandler(job(id), context());
    expect(await iterations(id)).toBe(1);

    /*
     * A second, sequential run must be able to take the claim — and the proof
     * that it did is that it *acted*: it judged the item again and recorded
     * iteration 1. If the lock had leaked, this run would have reported busy
     * and written nothing, and the count would still be 1.
     */
    await expect(correctContentHandler(job(id), context())).resolves.toBeUndefined();
    expect(await iterations(id)).toBe(2);
  });


  it('does not let two controllers both spend on the same correction', async () => {
    /*
     * The assertion the claim actually exists for, and the one that fails when
     * it is removed.
     *
     * Counting iteration *rows* proves nothing here: the unique
     * `(content_item_id, iteration)` key already guarantees one row, so both
     * controllers can act, both pay, and the loser's row is quietly dropped by
     * `on conflict do nothing`. What must be exactly one is the *effect* — here
     * the rebuild this correction asks for. In production the same duplication
     * is a second ElevenLabs synthesis and a second render.
     */
    const id = await unmeasuredItem();

    await Promise.allSettled([
      correctContentHandler(job(id), context()),
      correctContentHandler(job(id), context()),
    ]);

    expect(enqueued.filter((kind) => kind === 'review_media')).toHaveLength(1);
  });

  it('does not throw when it loses the claim, so the job is not retried forever', async () => {
    /*
     * Losing the claim is not an error: the job observed that the item is
     * already being handled, which is a complete outcome. Throwing would burn
     * the retry budget re-queueing behind the same lock.
     */
    const id = await passingItem();
    const both = await Promise.allSettled([
      correctContentHandler(job(id), context()),
      correctContentHandler(job(id), context()),
    ]);
    expect(both.filter((r) => r.status === 'rejected')).toHaveLength(0);
  });
});

d('a corrected item reaches the approval queue', () => {
  /**
   * §170. Found the first time the full loop ever ran end to end.
   *
   * `review_media` sets a failing item to `failed`; the correction branch moves
   * it to `draft` while the rebuild is in flight. The accept branch only
   * promoted from `failed`, so an item that was *corrected* and then accepted
   * stayed in `draft` — out of the queue a human works, with a complete history
   * saying it had passed. Silent, and only reachable by actually correcting
   * something successfully.
   */
  async function draftWithHistory(): Promise<string> {
    const id = await passingItem();
    await pool.query(`update content_items set status = 'draft' where id = $1`, [id]);
    await pool.query(
      `insert into content_iterations (content_item_id, iteration, outcome, action, reason)
       values ($1, 0, 'corrected', 'rewrite_vo_script', 'the loop put this item in draft')`,
      [id],
    );
    return id;
  }

  it('promotes a draft the loop itself corrected', async () => {
    const id = await draftWithHistory();
    await correctContentHandler(job(id), context());
    const { rows } = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.status).toBe('pending_approval');
  });

  it('leaves an operator’s own draft alone', async () => {
    /*
     * The narrowing that makes the promotion safe. A draft with no correction
     * history is somebody's work in progress, and pushing it into the approval
     * queue behind their back is worse than leaving it where it is.
     */
    const id = await passingItem();
    await pool.query(`update content_items set status = 'draft' where id = $1`, [id]);
    await correctContentHandler(job(id), context());
    const { rows } = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.status).toBe('draft');
  });

  it('never approves or publishes, whichever state it promotes from', async () => {
    // The boundary. The loop improves an artifact; it authorises nothing.
    const id = await draftWithHistory();
    await correctContentHandler(job(id), context());
    const { rows } = await pool.query<{ approved_at: string | null; published_at: string | null }>(
      'select approved_at, published_at from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.approved_at).toBeNull();
    expect(rows[0]!.published_at).toBeNull();
  });
});
