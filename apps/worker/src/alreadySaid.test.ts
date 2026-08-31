/**
 * §401. Run the pipeline twice and it said the same thing twice.
 *
 * `research()` took a subject and no memory, so gluten always came back as
 * Beccari and 1728. The memory existed the whole time — `content_items.claims`
 * records every fact every piece used — and nothing read it, which is the same
 * shape as `renders.treatment` before §394.
 */
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createIsolatedPool,
  databaseAvailable,
  seedMinimal,
} from '../../../packages/db/src/__tests__/testDb.js';
import { alreadySaid } from './alreadySaid.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let ids: { productId: string; accountId: string; contentItemId: string };

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('already_said', 4);
  ids = await seedMinimal(pool);
}, 120_000);

afterAll(async () => {
  if (pool) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  /*
   * Status and age reset too, not only claims. The rejected-piece test left
   * `status = 'rejected'` behind and the next test then found nothing — a
   * failure that looked like a bug in the reader and was leaked state.
   */
  await pool.query(
    `update content_items set claims = '[]'::jsonb, status = 'approved', created_at = now()`,
  );
});

async function said(claims: string[], opts: { status?: string; ageDays?: number } = {}) {
  await pool.query(
    `update content_items
        set claims = $2::jsonb,
            status = coalesce($3, status),
            created_at = now() - ($4 || ' days')::interval
      where id = $1`,
    [
      ids.contentItemId,
      JSON.stringify(claims.map((text) => ({ text, source: 'test' }))),
      opts.status ?? null,
      String(opts.ageDays ?? 0),
    ],
  );
}

d('what this account has already said', () => {
  it('returns nothing when nothing has been said', async () => {
    const memory = await alreadySaid(pool, { productId: ids.productId });
    expect(memory.claims).toEqual([]);
  });

  it('returns the claims a piece made', async () => {
    await said(['Beccari isolated gluten in 1728', 'Hydration sets the crumb']);
    const memory = await alreadySaid(pool, { productId: ids.productId });
    expect(memory.claims).toContain('Beccari isolated gluten in 1728');
    expect(memory.claims).toContain('Hydration sets the crumb');
  });

  it('says a claim once however many platforms carried it', async () => {
    /* The same fact on four platforms is one fact to avoid, not four. */
    await said(['Beccari isolated gluten in 1728', 'Beccari isolated gluten in 1728']);
    const memory = await alreadySaid(pool, { productId: ids.productId });
    expect(memory.claims.filter((c) => c.includes('Beccari'))).toHaveLength(1);
  });

  it('forgets a claim old enough to use again', async () => {
    /*
     * Unbounded exclusion eventually forbids everything and leaves a subject
     * unwritable, which is worse than a repeat.
     */
    await said(['Beccari isolated gluten in 1728'], { ageDays: 400 });
    const memory = await alreadySaid(pool, { productId: ids.productId, days: 60 });
    expect(memory.claims).toEqual([]);
  });

  it('ignores a piece that was sent back', async () => {
    /* A rejected piece was never published, so it never said anything. */
    await said(['Beccari isolated gluten in 1728'], { status: 'rejected' });
    const memory = await alreadySaid(pool, { productId: ids.productId });
    expect(memory.claims).toEqual([]);
  });

  it('collects how recent pieces opened', async () => {
    await said(['a claim']);
    const memory = await alreadySaid(pool, { productId: ids.productId });
    expect(memory.openings.length).toBeGreaterThan(0);
  });
});
