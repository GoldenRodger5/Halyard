/**
 * §165. The iteration history is append-only, against a real Postgres.
 *
 * The operator-facing promise of self-correction is a readable history —
 * "version 0 failed because X, version 1 attempted Y, version 2 passed". A
 * history that can be rewritten is not evidence of anything, and this codebase
 * has already watched a verdict get silently overwritten minutes after being
 * measured (§151, where `review_media` replaced the whole `qc_results` object
 * and destroyed the caption cues `tts` had just written).
 *
 * So the guarantee is enforced by a trigger rather than by everyone remembering
 * to only insert. These assertions are what would fail if that trigger were
 * dropped — a plain unit test cannot see a database rule.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from './testDb.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let accountId: string;
let itemId: string;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('content_iterations', 8);

  /*
   * The fixtures this file needs, built rather than borrowed.
   *
   * Every test here used to start `select id from content_items limit 1` and
   * bail with `if (!itemId) return` — and an isolated database is created from
   * the migrations alone, with nothing seeded. So `itemId` was always empty,
   * every test returned before its first assertion, and the whole file reported
   * green while proving nothing. It is the exact failure this codebase keeps
   * finding elsewhere (§143, §70): a check that examined nothing and called it
   * a pass.
   */
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict (id) do nothing`,
  );
  const account = await pool.query<{ id: string }>(
    `insert into social_accounts (product_id, platform, persona, handle, capability_state)
     values ('recipefix','x','brand','@brand','draft_only') returning id`,
  );
  accountId = account.rows[0]!.id;
});

afterAll(async () => {
  if (pool) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  // Through the item: `content_iterations` refuses a direct DELETE, and the
  // cascade is the one removal path the guarantee deliberately allows.
  await pool.query('delete from content_items');
  itemId = await newItem();
});

async function newItem(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into content_items
       (product_id, account_id, platform, persona, format, category, body, status)
     values ('recipefix', $1, 'x', 'brand', 'text', 'education', 'body', 'draft')
     returning id`,
    [accountId],
  );
  return rows[0]!.id;
}

async function insert(iteration: number, outcome = 'generated'): Promise<void> {
  await pool.query(
    `insert into content_iterations (content_item_id, iteration, outcome, reason)
     values ($1, $2, $3, 'because')`,
    [itemId, iteration, outcome],
  );
}

d('content_iterations', () => {
  it('has a real item to attach history to', () => {
    /*
     * The guard on the guard. Every other test in this file is meaningless if
     * `itemId` is empty, and for the life of the file it was.
     */
    expect(itemId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('accepts an iteration', async () => {
    await insert(0);
    const { rows } = await pool.query('select iteration from content_iterations');
    expect(rows).toHaveLength(1);
  });

  it('refuses to let a recorded iteration be edited', async () => {
    /*
     * The load-bearing assertion. If this ever passes silently, "iteration 1
     * attempted Y" stops being a fact about what happened and becomes whatever
     * the last writer said.
     */
    await insert(0);
    await expect(
      pool.query(`update content_iterations set outcome = 'accepted'`),
    ).rejects.toThrow(/append-only/i);
  });

  it('refuses to let history be deleted', async () => {
    await insert(0);
    await expect(pool.query('delete from content_iterations')).rejects.toThrow(/append-only/i);
  });

  it('refuses two rows for the same iteration of the same item', async () => {
    // The controller may run twice for one iteration after a transient failure;
    // the second insert must not create a duplicate history entry.
    await insert(0);
    await expect(insert(0)).rejects.toThrow();
  });

  it('rejects an outcome nobody defined', async () => {
    await expect(insert(0, 'vibes')).rejects.toThrow();
  });

  it('lets the whole history go when the item does', async () => {
    /*
     * The one deletion that is allowed, and it has to be: the trigger guards
     * edits to history, not the removal of an item that no longer exists.
     * Without the cascade, deleting a content item would fail on a foreign key
     * that a trigger then refuses to let anyone clear.
     */
    const scratch = await newItem();
    await pool.query(
      `insert into content_iterations (content_item_id, iteration, outcome) values ($1, 0, 'generated')`,
      [scratch],
    );
    await expect(pool.query('delete from content_items where id = $1', [scratch])).resolves.toBeTruthy();
  });

  it('is the trigger doing the work, not a coincidence', async () => {
    /*
     * Proving the guard is load-bearing, and doing it *inside* the isolated
     * database — because Gotcha 8 is real and I walked into it: dropping the
     * trigger on the main schema and re-running these tests changed nothing,
     * since `createIsolatedPool` builds a separate database entirely. A tamper
     * that cannot reach the code under test proves only that the tamper missed.
     *
     * So the trigger is dropped here, the write that should have been refused
     * is shown to succeed, and it is put back. If someone removes the trigger
     * from the migration, the assertions above stop failing for the right
     * reason and this one starts failing instead.
     */
    await insert(0);

    await pool.query('drop trigger content_iterations_no_update on content_iterations');
    await expect(
      pool.query(`update content_iterations set outcome = 'accepted'`),
    ).resolves.toBeTruthy();

    await pool.query(
      `create trigger content_iterations_no_update before update on content_iterations
         for each row execute function content_iterations_are_append_only()`,
    );
    await expect(
      pool.query(`update content_iterations set outcome = 'escalated'`),
    ).rejects.toThrow(/append-only/i);
  });
});
