/**
 * §217. The link that stalled the whole pipeline.
 *
 * Production held 5,833 `rss_items` and zero `signals`. `proposeFromSignals` is
 * the only producer of `ideas`; it reads `signals`; nothing wrote any. So
 * `generate` ran daily, found nothing, and exited cleanly — seven successful
 * runs and an empty pipeline behind them.
 *
 * These tests are about that break specifically, which is why they assert
 * against a real database: the dedupe is a SQL `not exists`, the status change
 * is a real constraint value, and neither is provable in memory.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { PROMOTE_PER_RUN, promoteToSignals } from './handlers/signals.js';

const available = await databaseAvailable();
const maybe = available ? describe : describe.skip;

maybe('rss_items become signals', () => {
  let pool: pg.Pool;
  const productId = 'recipefix';
  const ctx = () => ({ pool, log: () => undefined, enqueue: async () => undefined }) as never;

  async function seedItem(
    n: number,
    overrides: { clusterKey?: string; relevance?: number; expired?: boolean } = {},
  ): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into rss_items
         (source_id, product_id, guid, url, title, summary, published_at, fetched_at,
          cluster_key, feed_count, expires_at, relevance, status)
       values ($1,$2,$3,$4,$5,$6, now() - interval '2 hours', now(),
               $7, 3, now() + ($8 || ' hours')::interval, $9, 'new')
       returning id`,
      [
        sourceId,
        productId,
        `guid-${n}`,
        `https://example.invalid/${n}`,
        `Story number ${n}`,
        `A summary for story ${n}.`,
        overrides.clusterKey ?? `cluster-${n}`,
        overrides.expired ? '-1' : '48',
        overrides.relevance ?? 0.5,
      ],
    );
    return rows[0]!.id;
  }

  let sourceId: string;

  beforeAll(async () => {
    pool = await createIsolatedPool('signal_promotion', 4);
    await pool.query(
      `insert into products (id,name,connector_type) values ($1,'RecipeFix','mcp')
       on conflict (id) do nothing`,
      [productId],
    );
    const src = await pool.query<{ id: string }>(
      `insert into rss_sources (product_id, name, feed_url, weight)
       values ($1,'Example','https://example.invalid/feed',1) returning id`,
      [productId],
    );
    sourceId = src.rows[0]!.id;
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
  });

  it('promotes nothing when there is nothing collected', async () => {
    expect(await promoteToSignals(ctx(), productId)).toBe(0);
  });

  it('turns a fresh story into a usable signal', async () => {
    await seedItem(1, { relevance: 0.9 });
    expect(await promoteToSignals(ctx(), productId)).toBe(1);

    const { rows } = await pool.query<{
      source: string;
      summary: string;
      relevance: string;
      observed_at: string;
      expires_at: string;
      raw: { clusterKey: string; outlets: number };
    }>('select source, summary, relevance, observed_at, expires_at, raw from signals');

    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe('editorial');
    expect(rows[0]!.summary).toMatch(/Story number 1/);
    expect(Number(rows[0]!.relevance)).toBeCloseTo(0.9, 5);
    expect(rows[0]!.raw.clusterKey).toBe('cluster-1');
    /* §206: decay runs from publication, not from when the row was written. */
    expect(new Date(rows[0]!.observed_at).getTime()).toBeLessThan(Date.now() - 3_000);
    expect(new Date(rows[0]!.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('marks the story surfaced so it is not promoted twice', async () => {
    const { rows } = await pool.query<{ status: string }>(
      `select status from rss_items where guid = 'guid-1'`,
    );
    expect(rows[0]!.status).toBe('surfaced');
    expect(await promoteToSignals(ctx(), productId)).toBe(0);
  });

  it('never makes two signals from one cluster', async () => {
    /* The same story, carried by a second outlet. */
    await seedItem(2, { clusterKey: 'cluster-1', relevance: 0.8 });
    expect(await promoteToSignals(ctx(), productId)).toBe(0);
    const { rows } = await pool.query('select id from signals');
    expect(rows).toHaveLength(1);
  });

  it('ignores a story that has already expired', async () => {
    await seedItem(3, { expired: true, relevance: 1 });
    expect(await promoteToSignals(ctx(), productId)).toBe(0);
  });

  it('takes the most relevant first, and bounds the run', async () => {
    for (let i = 10; i < 10 + PROMOTE_PER_RUN + 3; i += 1) {
      await seedItem(i, { relevance: i / 100 });
    }
    const n = await promoteToSignals(ctx(), productId);
    expect(n).toBe(PROMOTE_PER_RUN);

    const { rows } = await pool.query<{ summary: string }>(
      `select summary from signals where raw ->> 'clusterKey' <> 'cluster-1'
        order by relevance desc limit 1`,
    );
    // Highest relevance seeded above is the largest index.
    expect(rows[0]!.summary).toMatch(new RegExp(`Story number ${10 + PROMOTE_PER_RUN + 2}`));
  });

  /**
   * The point of the whole change: what `proposeFromSignals` reads.
   */
  it('leaves signals that the idea proposer can actually claim', async () => {
    const { rows } = await pool.query<{ n: string }>(
      `select count(*)::text as n from signals
        where product_id = $1 and consumed_at is null`,
      [productId],
    );
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);
  });
});

/**
 * §217. A brand's own verified capabilities are its discovery source.
 *
 * RSS is the right question for a founder reacting to the news and the wrong
 * one for a brand account. Production proved it: RecipeFix had five connected
 * accounts, zero RSS sources and therefore zero ideas, while the eight feeds
 * that existed belonged to the founder product whose only account is
 * unauthenticated.
 */
maybe('product facts become signals', () => {
  let pool: pg.Pool;
  const productId = 'brandproduct';
  const ctx = () => ({ pool, log: () => undefined, enqueue: async () => undefined }) as never;

  /**
   * Facts cite evidence, enforced by the database.
   *
   * The first version of this fixture inserted a bare fact and was refused:
   * "a product fact must cite at least one evidence row". That is the Product
   * Brain's provenance guarantee working exactly as intended — a capability
   * nobody observed cannot be recorded — so the fixture supplies real evidence
   * rather than the constraint being worked around.
   */
  async function seedFact(
    key: string,
    status: 'verified' | 'unverified',
    confidence = 0.8,
  ): Promise<string> {
    const evidence = await pool.query<{ id: string }>(
      `insert into product_evidence
         (product_id, kind, source_url, content_hash, title, body, collector)
       values ($1,'web_page',$2,$3,$4,$5,'test')
       returning id`,
      [
        productId,
        `https://example.invalid/${key}`,
        `hash-${key}`,
        `Evidence for ${key}`,
        `The product demonstrably can ${key}.`,
      ],
    );

    const { rows } = await pool.query<{ id: string }>(
      `insert into product_facts
         (product_id, category, key, value, detail, status, confidence,
          last_verified_at, evidence_ids, agent_id, agent_version, prompt_version)
       values ($1,'workflows',$2,$3,$4,$5,$6, now(), $7,
               'product-discovery','1.0','test.v1')
       returning id`,
      [
        productId,
        key,
        `It can ${key}`,
        `Detail about ${key}.`,
        status,
        confidence,
        [evidence.rows[0]!.id],
      ],
    );
    return rows[0]!.id;
  }

  beforeAll(async () => {
    pool = await createIsolatedPool('fact_promotion', 4);
    await pool.query(
      `insert into products (id,name,connector_type) values ($1,'Brand','mcp')
       on conflict (id) do nothing`,
      [productId],
    );
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
  });

  it('promotes nothing when the Brain has established nothing', async () => {
    const { promoteProductFacts } = await import('./handlers/signals.js');
    expect(await promoteProductFacts(ctx(), productId)).toBe(0);
  });

  /**
   * The rule that keeps unverified capability out of public content.
   */
  it('refuses a fact the Brain has not verified', async () => {
    /* `unverified` is the real status value; the Brain uses
       unverified/verified/refuted/unverifiable. */
    const { promoteProductFacts } = await import('./handlers/signals.js');
    await seedFact('guess', 'unverified', 0.99);
    expect(await promoteProductFacts(ctx(), productId)).toBe(0);
  });

  it('promotes a verified fact as a product_activity signal', async () => {
    const { promoteProductFacts } = await import('./handlers/signals.js');
    await seedFact('scale_a_recipe', 'verified', 0.9);
    expect(await promoteProductFacts(ctx(), productId)).toBe(1);

    const { rows } = await pool.query<{
      source: string;
      summary: string;
      confidence: string | null;
      raw: { factId: string; key: string };
    }>(`select source, summary, confidence, raw from signals where product_id = $1`, [productId]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe('product_activity');
    expect(rows[0]!.summary).toMatch(/It can scale_a_recipe/);
    expect(Number(rows[0]!.confidence)).toBeCloseTo(0.9, 5);
    expect(rows[0]!.raw.key).toBe('scale_a_recipe');
  });

  it('does not re-promote the same fact every run', async () => {
    const { promoteProductFacts } = await import('./handlers/signals.js');
    expect(await promoteProductFacts(ctx(), productId)).toBe(0);
  });

  it('leaves an unconsumed signal the idea proposer can claim', async () => {
    const { rows } = await pool.query<{ n: string }>(
      `select count(*)::text as n from signals
        where product_id = $1 and consumed_at is null`,
      [productId],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });
});
