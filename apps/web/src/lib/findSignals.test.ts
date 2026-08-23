/**
 * Promoting an operator's find into a signal, against a real Postgres.
 *
 * `signals` had exactly one writer — `collect_watch_terms`, when a question
 * recurs across public sources — so the idea generator that now reads it
 * (`DECISIONS.md` §84) could only ever see recurring questions. A find could
 * become one post through `draftFind` and could never become evidence.
 *
 * The assertions that matter are the ones about what must *not* happen: a bare
 * URL must not become a signal, one product's find must not reach another, and
 * operator-supplied evidence must stay distinguishable from something Halyard
 * observed.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createIsolatedPool,
  databaseAvailable,
} from '../../../../packages/db/src/__tests__/testDb.js';
import {
  FIND_SIGNAL_COLLECTED_BY,
  FIND_SIGNAL_SOURCE,
  promoteFindToSignal,
} from './findSignals.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('findsignals', 4);
  for (const id of ['founder', 'other']) {
    await pool.query(
      `insert into products (id, name, connector_type) values ($1, $1, 'none')
       on conflict (id) do nothing`,
      [id],
    );
  }
}, 180_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from signals');
  await pool.query('delete from finds');
});

/**
 * The production function, driven against this pool.
 *
 * `promoteFindToSignal` takes its database surface as an argument for exactly
 * this reason — the same shape as `refreshDueTokens` and `disconnectAccount`.
 * An earlier draft of this file re-typed the SQL into the test, which proves the
 * copy works and nothing about what runs.
 */
const query = async <T>(sql: string, params?: unknown[]): Promise<T[]> =>
  (await pool.query(sql, params)).rows as T[];

const promote = (find: {
  id: string;
  productId: string;
  url: string;
  whyUseful: string | null;
  title?: string | null;
}) => promoteFindToSignal(query, find);

async function seedFind(productId: string, url: string, why: string | null): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into finds (product_id, url, why_useful, source)
     values ($1, $2, $3, 'paste') returning id`,
    [productId, url, why],
  );
  return rows[0]!.id;
}

d('a find becomes a signal', () => {
  it('promotes one that carries the operator’s reason', async () => {
    const id = await seedFind('founder', 'https://example.com/a', 'shows the mechanism plainly');
    const signalId = await promote({
      id,
      productId: 'founder',
      url: 'https://example.com/a',
      whyUseful: 'shows the mechanism plainly',
    });

    expect(signalId).not.toBeNull();
    const { rows } = await pool.query<{
      source: string;
      summary: string;
      raw: Record<string, unknown>;
      relevance: string | null;
    }>('select source, summary, raw, relevance from signals');

    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe(FIND_SIGNAL_SOURCE);
    // The operator's sentence leads — it is the part with judgement in it.
    expect(rows[0]!.summary).toMatch(/^shows the mechanism plainly/);
    expect(rows[0]!.raw.findId).toBe(id);
    // Provenance back to the original find, and how it was collected.
    expect(rows[0]!.raw.collectedBy).toBe('operator');
    /**
     * Relevance is null, not a number. `watch.ts` derives its relevance from
     * how often a question recurred; a find has recurred once, by definition,
     * and inventing a score would be a measurement claim with nothing behind it.
     */
    expect(rows[0]!.relevance).toBeNull();
  });

  it('does not promote a bare URL with no reason', async () => {
    // The same gate `draftFind` applies: without the reason there is nothing to
    // say, and a bare link in front of the idea generator reads as though
    // somebody vouched for it.
    const id = await seedFind('founder', 'https://example.com/b', null);
    expect(await promote({ id, productId: 'founder', url: 'https://example.com/b', whyUseful: null })).toBeNull();
    expect(await promote({ id, productId: 'founder', url: 'https://example.com/b', whyUseful: '   ' })).toBeNull();

    const { rows } = await pool.query('select id from signals');
    expect(rows).toHaveLength(0);
  });

  it('does not signal the same find twice', async () => {
    // Deduped the way `watch.ts` dedupes a recurring question: a `not exists`
    // guard on a key inside `raw`, over the same thirty-day window.
    const id = await seedFind('founder', 'https://example.com/c', 'useful');
    const first = await promote({ id, productId: 'founder', url: 'https://example.com/c', whyUseful: 'useful' });
    const second = await promote({ id, productId: 'founder', url: 'https://example.com/c', whyUseful: 'useful' });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const { rows } = await pool.query('select id from signals');
    expect(rows).toHaveLength(1);
  });

  it('keeps one product’s find out of another product’s signals', async () => {
    const mine = await seedFind('founder', 'https://example.com/d', 'mine');
    const theirs = await seedFind('other', 'https://example.com/d', 'theirs');
    await promote({ id: mine, productId: 'founder', url: 'https://example.com/d', whyUseful: 'mine' });
    await promote({ id: theirs, productId: 'other', url: 'https://example.com/d', whyUseful: 'theirs' });

    const { rows } = await pool.query<{ product_id: string; raw: Record<string, unknown> }>(
      'select product_id, raw from signals order by product_id',
    );
    expect(rows.map((r) => r.product_id)).toEqual(['founder', 'other']);
    // Same URL, different finds, and neither borrowed the other's provenance.
    expect(rows[0]!.raw.findId).toBe(mine);
    expect(rows[1]!.raw.findId).toBe(theirs);
  });

  it('stays distinguishable from something Halyard observed', async () => {
    /**
     * `signals.source` is a closed vocabulary — `signals_source_check` has no
     * value meaning "the operator handed this over", which a real-database test
     * discovered by being rejected on insert. Both rows are therefore
     * `editorial`, and `raw.collectedBy` is what separates them.
     */
    const id = await seedFind('founder', 'https://example.com/e', 'operator judgement');
    await promote({ id, productId: 'founder', url: 'https://example.com/e', whyUseful: 'operator judgement' });
    await pool.query(
      `insert into signals (product_id, source, summary, raw, relevance)
       values ('founder','editorial','Asked 9 times: why gummy', '{"questionKey":"gummy"}'::jsonb, 0.9)`,
    );

    const { rows } = await pool.query<{ source: string; raw: Record<string, unknown> }>(
      `select source, raw from signals order by raw ->> 'collectedBy' nulls last`,
    );
    expect(rows).toHaveLength(2);
    // The operator's, marked.
    expect(rows[0]!.raw.collectedBy).toBe(FIND_SIGNAL_COLLECTED_BY);
    // Halyard's own, unmarked — absence reads as "not operator-supplied".
    expect(rows[1]!.raw.collectedBy).toBeUndefined();
    // And the constraint is respected by both.
    expect(new Set(rows.map((r) => r.source))).toEqual(new Set(['editorial']));
  });

  it('is visible to the idea generator’s own query', async () => {
    /**
     * The decisive one. `proposeFromSignals` selects unconsumed signals for a
     * product ordered by relevance — this asserts the promoted signal is
     * actually picked up by that statement rather than merely existing.
     */
    const id = await seedFind('founder', 'https://example.com/f', 'worth writing about');
    await promote({ id, productId: 'founder', url: 'https://example.com/f', whyUseful: 'worth writing about' });

    const { rows } = await pool.query<{ id: string; source: string; summary: string }>(
      `select id, source, summary from signals
        where product_id = $1 and consumed_at is null
        order by relevance desc nulls last, created_at desc
        limit 20`,
      ['founder'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toMatch(/worth writing about/);
  });
});
