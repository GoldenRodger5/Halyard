import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  createIsolatedPool,
  databaseAvailable,
} from '../../../packages/db/src/__tests__/testDb.js';
import { collectWatchTermsHandler } from './handlers/watch.js';

const available = await databaseAvailable();
const maybe = available ? describe : describe.skip;

maybe('Product Brain bootstraps discovery terms', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = await createIsolatedPool('watch_brain_terms', 4);
    await pool.query(
      `insert into products (id, name, connector_type)
       values ('kinolog','KinoLog','mcp')`,
    );

    const evidence = await pool.query<{ id: string }>(
      `insert into product_evidence
         (product_id, kind, source_url, content_hash, title, body, collector)
       values
         ('kinolog','web_page','https://kinolog.example/about','brain-a','About','Movie taste diary','test'),
         ('kinolog','app_store_listing','https://apps.example/kinolog','brain-b','Store','Movie recommendations','test')
       returning id`,
    );
    const ids = evidence.rows.map((row) => row.id);

    const facts = [
      ['content_pillars', 'movie_recommendation_explainers', 'Movie recommendation explainers and taste prediction receipts'],
      ['jobs_to_be_done', 'choose_what_to_watch', 'Pick something to watch based on personal taste rather than generic popularity'],
      ['personas', 'movie_night_planners', 'People choosing a movie with friends who want a fast confident pick'],
      ['workflows', 'letterboxd_import', 'Import a Letterboxd history to learn movie taste'],
    ] as const;

    for (const [category, key, value] of facts) {
      await pool.query(
        `insert into product_facts
           (product_id, category, key, value, status, confidence, evidence_ids, agent_id, agent_version)
         values ('kinolog',$1,$2,$3,'verified',0.85,$4::uuid[],'test','1')`,
        [category, key, value, ids],
      );
    }

    await pool.query(
      `insert into watch_terms (product_id, term, sources, enabled)
       values ('kinolog','operator chosen topic','{reddit}',true)`,
    );
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
  });

  it('creates bounded Brain-managed terms without changing the operator term', async () => {
    await collectWatchTermsHandler(
      {
        id: 'brain-watch',
        kind: 'collect_watch_terms',
        payload: { productId: 'kinolog', onlySources: [] },
      } as never,
      { pool, log: () => undefined, enqueue: async () => undefined } as never,
    );

    const rows = await pool.query<{
      term: string;
      managed_by: string | null;
      sources: string[];
      enabled: boolean;
      source_fact_ids: string[];
    }>(
      `select term, managed_by, sources, enabled, source_fact_ids
         from watch_terms
        where product_id='kinolog'
        order by term`,
    );

    const manual = rows.rows.find((row) => row.term === 'operator chosen topic')!;
    expect(manual).toMatchObject({
      managed_by: null,
      sources: ['reddit'],
      enabled: true,
    });

    const managed = rows.rows.filter((row) => row.managed_by === 'product_brain');
    expect(managed.length).toBeGreaterThanOrEqual(3);
    expect(managed.length).toBeLessThanOrEqual(8);
    expect(managed.map((row) => row.term)).toEqual(
      expect.arrayContaining([
        'movie recommendation explainers',
        'choose what watch',
        'movie night planners',
      ]),
    );
    expect(managed.every((row) => row.sources.includes('reddit') && row.sources.includes('pinterest'))).toBe(true);
    expect(managed.every((row) => row.source_fact_ids.length >= 1)).toBe(true);
  });

  it('refreshes its own rows idempotently instead of duplicating them', async () => {
    const before = await pool.query<{ n: string }>(
      `select count(*)::text as n from watch_terms where product_id='kinolog'`,
    );

    await collectWatchTermsHandler(
      {
        id: 'brain-watch-2',
        kind: 'collect_watch_terms',
        payload: { productId: 'kinolog', onlySources: [] },
      } as never,
      { pool, log: () => undefined, enqueue: async () => undefined } as never,
    );

    const after = await pool.query<{ n: string }>(
      `select count(*)::text as n from watch_terms where product_id='kinolog'`,
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  it('disables stale Brain-managed terms when the Brain no longer yields discovery topics', async () => {
    await pool.query(
      `update product_facts
          set category = 'identity'
        where product_id = 'kinolog'`,
    );

    await collectWatchTermsHandler(
      {
        id: 'brain-watch-3',
        kind: 'collect_watch_terms',
        payload: { productId: 'kinolog', onlySources: [] },
      } as never,
      { pool, log: () => undefined, enqueue: async () => undefined } as never,
    );

    const managed = await pool.query<{ enabled: boolean }>(
      `select enabled from watch_terms
        where product_id='kinolog' and managed_by='product_brain'`,
    );
    expect(managed.rows.length).toBeGreaterThan(0);
    expect(managed.rows.every((row) => row.enabled === false)).toBe(true);

    const manual = await pool.query<{ enabled: boolean }>(
      `select enabled from watch_terms
        where product_id='kinolog' and term='operator chosen topic'`,
    );
    expect(manual.rows[0]!.enabled).toBe(true);
  });
});
