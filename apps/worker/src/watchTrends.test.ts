import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { sealToken } from '@halyard/core';
import {
  createIsolatedPool,
  databaseAvailable,
} from '../../../packages/db/src/__tests__/testDb.js';
import { collectWatchTermsHandler } from './handlers/watch.js';

const available = await databaseAvailable();
const maybe = available ? describe : describe.skip;

maybe('official Pinterest trends become autonomous signals', () => {
  let pool: pg.Pool;
  const encryptionKey = Buffer.alloc(32, 7).toString('base64');
  const previousKey = process.env.TOKEN_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.TOKEN_ENCRYPTION_KEY = encryptionKey;
    pool = await createIsolatedPool('watch_pinterest_trends', 4);
    await pool.query(
      `insert into products (id, name, connector_type)
       values ('recipefix','RecipeFix','mcp')`,
    );
    await pool.query(
      `insert into social_accounts
         (product_id, platform, persona, handle, capability_state, access_token_enc)
       values ('recipefix','pinterest','brand','recipefix','live',$1)`,
      [sealToken('pinterest-access-token')],
    );
    await pool.query(
      `insert into watch_terms (product_id, term, sources, min_occurrences)
       values ('recipefix','protein','{pinterest}',3)`,
    );
  }, 120_000);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (previousKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = previousKey;
    await pool?.end();
  });

  it('promotes official momentum without pretending it is a recurring question', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            trends: [
              {
                keyword: 'high protein breakfast',
                pct_growth_wow: 30,
                pct_growth_mom: 100,
                pct_growth_yoy: 10,
                time_series: {
                  '2026-09-14': 70,
                  '2026-09-21': 82,
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await collectWatchTermsHandler(
      { id: 'watch-job', kind: 'collect_watch_terms', payload: { productId: 'recipefix' } } as never,
      { pool, log: () => undefined, enqueue: async () => undefined } as never,
    );

    const signal = await pool.query<{
      source: string;
      summary: string;
      raw: Record<string, unknown>;
      relevance: string;
      confidence: string;
      velocity: string;
      platform: string;
      observed_at: string;
      expires_at: string;
    }>(
      `select source, summary, raw, relevance, confidence, velocity, platform,
              observed_at, expires_at
         from signals
        where product_id='recipefix'`,
    );

    expect(signal.rows).toHaveLength(1);
    expect(signal.rows[0]).toMatchObject({
      source: 'trend',
      platform: 'pinterest',
    });
    expect(signal.rows[0]!.summary).toContain('30% WoW');
    expect(Number(signal.rows[0]!.velocity)).toBeCloseTo(0.3, 5);
    expect(Number(signal.rows[0]!.confidence)).toBeCloseTo(0.98, 5);
    expect(Number(signal.rows[0]!.relevance)).toBeCloseTo(0.9, 5);
    expect(signal.rows[0]!.raw).toMatchObject({
      trendKey: 'high protein breakfast',
      term: 'protein',
      pctGrowthWow: 30,
      pctGrowthMom: 100,
      sourceUrl: expect.stringContaining('pinterest.com/search/pins'),
    });
    expect(new Date(signal.rows[0]!.expires_at).getTime()).toBeGreaterThan(
      new Date(signal.rows[0]!.observed_at).getTime(),
    );

    const hit = await pool.query<{ question: boolean; signal_id: string | null }>(
      `select question, signal_id from watch_hits where product_id='recipefix'`,
    );
    expect(hit.rows).toHaveLength(1);
    expect(hit.rows[0]!.question).toBe(false);
    expect(hit.rows[0]!.signal_id).not.toBeNull();
  });
});
