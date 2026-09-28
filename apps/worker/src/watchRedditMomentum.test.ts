import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import {
  createIsolatedPool,
  databaseAvailable,
} from '../../../packages/db/src/__tests__/testDb.js';
import { collectWatchTermsHandler } from './handlers/watch.js';

const available = await databaseAvailable();
const maybe = available ? describe : describe.skip;

maybe('Reddit discussion momentum becomes a general trend signal', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = await createIsolatedPool('watch_reddit_momentum', 4);
    await pool.query(
      `insert into products (id, name, connector_type)
       values ('recipefix','RecipeFix','mcp')`,
    );
    await pool.query(
      `insert into watch_terms (product_id, term, sources, min_occurrences)
       values ('recipefix','high protein breakfast','{reddit}',3)`,
    );
  }, 120_000);

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await pool?.end();
  });

  it('promotes an engaged cluster even when none of the hits is phrased as a question', async () => {
    const now = Math.floor(Date.now() / 1000);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              children: [0, 1, 2, 3].map((index) => ({
                data: {
                  title: `High protein breakfast prep result ${index + 1}`,
                  selftext: 'Sharing what worked this week.',
                  permalink: `/r/mealprep/comments/post${index}`,
                  author: `cook${index}`,
                  score: 12 + index,
                  num_comments: 4 + index,
                  created_utc: now - index * 3600,
                },
              })),
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await collectWatchTermsHandler(
      { id: 'reddit-watch-job', kind: 'collect_watch_terms', payload: { productId: 'recipefix' } } as never,
      { pool, log: () => undefined, enqueue: async () => undefined } as never,
    );

    const hits = await pool.query<{ n: string; questions: string }>(
      `select count(*)::text as n,
              count(*) filter (where question)::text as questions
         from watch_hits
        where product_id='recipefix' and source='reddit'`,
    );
    expect(Number(hits.rows[0]!.n)).toBe(4);
    expect(Number(hits.rows[0]!.questions)).toBe(0);

    const signals = await pool.query<{
      source: string;
      platform: string | null;
      summary: string;
      raw: Record<string, unknown>;
      velocity: string;
      relevance: string;
      confidence: string;
    }>(
      `select source, platform, summary, raw, velocity, relevance, confidence
         from signals
        where product_id='recipefix'`,
    );

    expect(signals.rows).toHaveLength(1);
    expect(signals.rows[0]).toMatchObject({
      source: 'trend',
      platform: null,
    });
    expect(signals.rows[0]!.summary).toContain('4 hit(s) in 7 days vs 0');
    expect(Number(signals.rows[0]!.velocity)).toBeCloseTo(0.3, 5);
    expect(Number(signals.rows[0]!.confidence)).toBeCloseTo(0.75, 5);
    expect(Number(signals.rows[0]!.relevance)).toBeGreaterThan(0.6);
    expect(signals.rows[0]!.raw).toMatchObject({
      trendKey: 'reddit:high protein breakfast',
      occurrences7d: 4,
      previous7d: 0,
    });
  });
});
