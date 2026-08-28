/**
 * The Social Engine against a real database. §208, §209.
 *
 * The recommendation model and its ranking are unit-tested in
 * `packages/core/src/social`. What this proves is the part that only a database
 * can: that the evidence constraint actually refuses an unevidenced row, that
 * recommendations are built from real collected data rather than invented, and
 * that an operator's decision is not re-opened by the next run.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { buildAccountIntelligenceHandler } from './handlers/accountIntelligence.js';

const available = await databaseAvailable();
const maybe = available ? describe : describe.skip;

maybe('account intelligence and social recommendations', () => {
  let pool: pg.Pool;
  let accountId: string;
  const productId = 'recipefix';

  const ctx = () => ({ pool, log: () => undefined, enqueue: async () => undefined }) as never;
  const job = { payload: {} } as never;

  beforeAll(async () => {
    pool = await createIsolatedPool('social_engine', 6);
    await pool.query(
      `insert into products (id,name,connector_type) values ($1,'RecipeFix','mcp')
       on conflict (id) do nothing`,
      [productId],
    );
    const a = await pool.query<{ id: string }>(
      `insert into social_accounts (product_id, platform, persona, handle, capability_state)
       values ($1,'instagram','brand','@recipefix','live') returning id`,
      [productId],
    );
    accountId = a.rows[0]!.id;
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
  });

  /** A published post with comments on it, which is the real evidence source. */
  async function postWithComments(handles: string[], question = false): Promise<void> {
    const item = await pool.query<{ id: string }>(
      `insert into content_items
         (product_id, account_id, platform, persona, format, category, body, status,
          published_at, generation_meta)
       values ($1,$2,'instagram','brand','video','education','b','published', now(), $3::jsonb)
       returning id`,
      [productId, accountId, JSON.stringify({ creative: { type: 'how_to' } })],
    );
    const pub = await pool.query<{ id: string }>(
      `insert into publications (content_item_id, account_id, platform, platform_post_id, publish_mode, published_at)
       values ($1,$2,'instagram',$3,'direct', now()) returning id`,
      [item.rows[0]!.id, accountId, `p-${item.rows[0]!.id}`],
    );
    for (const handle of handles) {
      await pool.query(
        `insert into comments (publication_id, platform_comment_id, author_handle, body, posted_at, is_support_question)
         values ($1,$2,$3,'Lovely, does this work with oat flour?', now(), $4)`,
        [pub.rows[0]!.id, `${pub.rows[0]!.id}-${handle}`, handle, question],
      );
    }
  }

  it('the database refuses a recommendation with no evidence', async () => {
    await expect(
      pool.query(
        `insert into social_recommendations
           (account_id, product_id, platform, subject, subject_type, kind, relevance, confidence, rationale, evidence)
         values ($1,$2,'instagram','@nobody','creator','study',0.9,0.9,'because','[]'::jsonb)`,
        [accountId, productId],
      ),
    ).rejects.toThrow(/evidence_present/);
  });

  it('recommends nobody when nothing has been observed', async () => {
    await buildAccountIntelligenceHandler(job, ctx());
    const { rows } = await pool.query('select * from social_recommendations');
    expect(rows).toEqual([]);
  });

  it('ignores a one-off commenter, and recommends a repeat one', async () => {
    await postWithComments(['@once', '@twice']);
    await postWithComments(['@twice']);

    await buildAccountIntelligenceHandler(job, ctx());
    const { rows } = await pool.query<{ subject: string; kind: string; rationale: string }>(
      'select subject, kind, rationale from social_recommendations order by subject',
    );
    expect(rows.map((r) => r.subject)).toEqual(['@twice']);
    expect(rows[0]!.rationale).toMatch(/commented 2 times/);
  });

  it('marks a repeat questioner as someone to respond to', async () => {
    await postWithComments(['@asker'], true);
    await postWithComments(['@asker'], true);
    await buildAccountIntelligenceHandler(job, ctx());
    const { rows } = await pool.query<{ kind: string }>(
      `select kind from social_recommendations where subject = '@asker'`,
    );
    expect(rows[0]!.kind).toBe('respond');
  });

  it('accumulates evidence across runs instead of replacing it', async () => {
    const before = await pool.query<{ n: number }>(
      `select jsonb_array_length(evidence) as n from social_recommendations where subject = '@twice'`,
    );
    await buildAccountIntelligenceHandler(job, ctx());
    const after = await pool.query<{ n: number }>(
      `select jsonb_array_length(evidence) as n from social_recommendations where subject = '@twice'`,
    );
    expect(after.rows[0]!.n).toBeGreaterThan(before.rows[0]!.n);
  });

  /**
   * The operator's decision is authoritative. A new observation about a subject
   * they already dismissed must not quietly re-propose them.
   */
  it('does not re-open a recommendation the operator already decided', async () => {
    await pool.query(
      `update social_recommendations set status = 'dismissed', decided_at = now() where subject = '@twice'`,
    );
    await postWithComments(['@twice']);
    await buildAccountIntelligenceHandler(job, ctx());

    const { rows } = await pool.query<{ status: string }>(
      `select status from social_recommendations where subject = '@twice'`,
    );
    expect(rows[0]!.status).toBe('dismissed');
  });

  it('snapshots the account content mix and finds the convergence', async () => {
    const { rows } = await pool.query<{
      window_size: number;
      summary: string;
      findings: Array<{ dimension: string; kind: string }>;
    }>('select window_size, summary, findings from account_intelligence order by observed_at desc limit 1');

    expect(rows[0]!.window_size).toBeGreaterThan(0);
    // Every seeded post is `how_to`, so the treatment dimension has converged.
    expect(rows[0]!.findings.some((f) => f.dimension === 'treatment' && f.kind === 'overused')).toBe(
      true,
    );
  });
});
