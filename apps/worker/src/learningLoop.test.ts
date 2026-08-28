/**
 * The learning loop, against a real database. §204.
 *
 * Specification §13 asks for the loop to be demonstrated rather than asserted
 * about: publish and measure a controlled set, attribute metrics to exact
 * versions, form a supported pattern, store it with evidence and confidence,
 * then show a later plan using it — and show a counterexample changing the
 * belief instead of being ignored.
 *
 * Every row here goes through the real migrations, the real handler, and the
 * real unique index. A stubbed pool would prove the arithmetic, which
 * `insights.test.ts` already does; what this proves is that the arithmetic
 * survives contact with the schema — the upsert conflict target, the array
 * columns, the numeric round-tripping.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { learnFromPerformanceHandler } from './handlers/learn.js';
import { actionableInsights, selectCreativePlan, type Insight } from '@halyard/core';
import type { ProductArtifact } from '@halyard/core';

const available = await databaseAvailable();
const maybe = available ? describe : describe.skip;

maybe('the learning loop, end to end', () => {
  let pool: pg.Pool;
  let productId: string;
  let accountId: string;

  /*
   * Instagram, not TikTok. §179's `content_items_tiktok_needs_choices` refuses
   * a TikTok row without the creator's completed Direct Post panel — correctly,
   * and the first version of this fixture tripped it. The learning loop is
   * platform-agnostic, so the safety constraint stays untouched and the fixture
   * moves.
   */
  const DAY = 86_400_000;
  const start = new Date('2026-05-01T12:00:00Z');

  /** The handler's context, minus everything this job does not use. */
  const ctx = () =>
    ({
      pool,
      log: () => undefined,
      enqueue: async () => undefined,
    }) as never;

  const job = { payload: {} } as never;

  /**
   * A published, measured post. Real rows in the real tables: an item, a
   * publication, and a performance score, joined the way the handler joins.
   */
  async function publishMeasured(
    creativeType: string,
    score: number,
    dayOffset: number,
  ): Promise<string> {
    const item = await pool.query<{ id: string }>(
      `insert into content_items
         (product_id, account_id, platform, persona, format, category, body,
          status, published_at, generation_meta)
       values ($1,$2,'instagram','brand','video','education','body',
               'published', $3, $4::jsonb)
       returning id`,
      [
        productId,
        accountId,
        new Date(start.getTime() + dayOffset * DAY),
        JSON.stringify({ creative: { type: creativeType } }),
      ],
    );
    const id = item.rows[0]!.id;

    await pool.query(
      `insert into publications (content_item_id, account_id, platform, platform_post_id, publish_mode, published_at)
       values ($1,$2,'instagram',$3,'direct',$4)`,
      [id, accountId, `post-${id}`, new Date(start.getTime() + dayOffset * DAY)],
    );
    await pool.query(
      `insert into performance_scores (content_item_id, score, low_confidence, computed_at)
       values ($1,$2,false,now())`,
      [id, score],
    );
    return id;
  }

  async function storedInsights(): Promise<Array<Record<string, unknown>>> {
    const { rows } = await pool.query(
      `select * from learned_insights where scope='account' and feature='creative_type' order by feature_value`,
    );
    return rows;
  }

  beforeAll(async () => {
    pool = await createIsolatedPool('learning_loop', 6);
    productId = 'recipefix';
    await pool.query(
      `insert into products (id, name, connector_type) values ($1,'RecipeFix','mcp')
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

  it('learns nothing when nothing has been measured', async () => {
    await learnFromPerformanceHandler(job, ctx());
    expect(await storedInsights()).toEqual([]);
  });

  it('forms a belief once a real cohort exists, with both sides recorded', async () => {
    for (let i = 0; i < 25; i += 1) {
      await publishMeasured('feature_demo', 0.9, i);
      await publishMeasured('before_after', 0.3, i);
    }

    await learnFromPerformanceHandler(job, ctx());
    const rows = await storedInsights();
    expect(rows.length).toBe(2);

    const demo = rows.find((r) => r.feature_value === 'feature_demo')!;
    expect(Number(demo.lift)).toBeGreaterThan(0);
    expect(demo.sample_size).toBe(25);
    expect(demo.baseline_size).toBe(25);
    expect(demo.status).toBe('inferred');
    expect(Number(demo.confidence)).toBeGreaterThan(0.5);
    /* Evidence on both sides, so the belief can be checked and distrusted. */
    expect((demo.supporting_content_ids as string[]).length).toBe(25);
    expect((demo.contradicting_content_ids as string[]).length).toBe(25);
    expect(demo.observation).toMatch(/feature_demo/);

    /* Negative learning is first-class. */
    const weak = rows.find((r) => r.feature_value === 'before_after')!;
    expect(Number(weak.lift)).toBeLessThan(0);
    expect(weak.recommendation).toMatch(/Avoid/);
  });

  it('is idempotent — a second pass updates in place, it does not duplicate', async () => {
    await learnFromPerformanceHandler(job, ctx());
    const rows = await storedInsights();
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.feature_value === 'feature_demo')!.corroborations).toBe(2);
  });

  /**
   * The consumption half. A belief that changes nothing is not learning, so
   * this reads what the database holds and shows it moving a real decision.
   */
  it('changes which treatment a later plan chooses', async () => {
    const rows = await pool.query(
      `select scope, platform, account_id, feature, feature_value, cohort_mean, baseline_mean,
              lift, sample_size, baseline_size, status, confidence, corroborations,
              supporting_content_ids, contradicting_content_ids,
              evidence_window_start, evidence_window_end, observation, recommendation, review_after
         from learned_insights where scope='account' and feature='creative_type'`,
    );
    const insights: Insight[] = rows.rows.map((r) => ({
      scope: r.scope,
      platform: r.platform,
      accountId: r.account_id,
      feature: r.feature,
      featureValue: r.feature_value,
      cohortMean: Number(r.cohort_mean),
      baselineMean: Number(r.baseline_mean),
      lift: Number(r.lift),
      sampleSize: r.sample_size,
      baselineSize: r.baseline_size,
      status: r.status,
      confidence: Number(r.confidence),
      corroborations: r.corroborations,
      evidence: {
        supporting: r.supporting_content_ids ?? [],
        contradicting: r.contradicting_content_ids ?? [],
        windowStart: new Date(r.evidence_window_start),
        windowEnd: new Date(r.evidence_window_end),
      },
      observation: r.observation,
      recommendation: r.recommendation,
      reviewAfter: new Date(r.review_after),
    }));

    expect(actionableInsights(insights, new Date(start.getTime() + 26 * DAY)).length).toBeGreaterThan(0);

    /* An artifact that supports before_after and, with footage, feature_demo. */
    const artifact: ProductArtifact = {
      kind: 'recipe_adaptation',
      raw: {},
      headline: 'Gluten-free apple pie',
      highlights: [
        {
          type: 'swap',
          sourcePath: 'ingredients[0].changeReason',
          before: 'butter',
          after: 'olive oil',
          reason: 'Dairy-free and it keeps the crumb tender because the fat stays liquid.',
          alternative: null,
        },
      ],
      visualHints: [],
    };

    const withFootage = {
      platform: 'instagram',
      format: 'video',
      targetSeconds: 24,
      footage: { file: 'cap.mp4', durationMs: 4200 },
      now: new Date(start.getTime() + 26 * DAY),
    };

    const naive = selectCreativePlan(artifact, { ...withFootage, insights: [] })!;
    const informed = selectCreativePlan(artifact, { ...withFootage, insights })!;

    const naiveScore = naive.considered.find((c) => c.plan.creativeType === 'feature_demo')!.score;
    const informedCandidate = informed.considered.find(
      (c) => c.plan.creativeType === 'feature_demo',
    )!;

    // The belief moved the score, and it says which belief did it.
    expect(informedCandidate.score).toBeGreaterThan(naiveScore);
    expect(informedCandidate.learned).toBeGreaterThan(0);
    expect(informedCandidate.learnedFrom.join(' ')).toMatch(/feature_demo/);
    expect(informed.chosen.rationale).toMatch(/Measured performance argued for it/);
  });

  /**
   * Specification §13: "Introduce a counterexample and verify confidence
   * changes rather than blindly preserving the old rule."
   */
  it('weakens the belief when later results reverse it', async () => {
    const before = (await storedInsights()).find((r) => r.feature_value === 'feature_demo')!;
    expect(Number(before.lift)).toBeGreaterThan(0);
    const confidenceBefore = Number(before.confidence);

    /* A later window where the pattern is emphatically the other way. */
    for (let i = 0; i < 60; i += 1) {
      await publishMeasured('feature_demo', 0.1, 40 + i);
      await publishMeasured('before_after', 0.95, 40 + i);
    }

    await learnFromPerformanceHandler(job, ctx());

    const after = (await storedInsights()).find((r) => r.feature_value === 'feature_demo')!;
    expect(Number(after.lift)).toBeLessThan(0);
    expect(Number(after.confidence)).toBeLessThan(confidenceBefore);
    expect(after.status).not.toBe('validated');
    expect(after.corroborations).toBe(1);
    expect(after.observation).toMatch(/Reversed against earlier evidence/);
  });

  it('excludes unmeasured posts rather than counting them as zero', async () => {
    const before = (await storedInsights()).find((r) => r.feature_value === 'feature_demo')!;
    const sampleBefore = before.sample_size as number;

    /* Published, never measured: no performance_scores row at all. */
    for (let i = 0; i < 10; i += 1) {
      await pool.query(
        `insert into content_items
           (product_id, account_id, platform, persona, format, category, body,
            status, published_at, generation_meta)
         values ($1,$2,'instagram','brand','video','education','body','published',$3,$4::jsonb)`,
        [
          productId,
          accountId,
          new Date(start.getTime() + (200 + i) * DAY),
          JSON.stringify({ creative: { type: 'feature_demo' } }),
        ],
      );
    }

    await learnFromPerformanceHandler(job, ctx());
    const after = (await storedInsights()).find((r) => r.feature_value === 'feature_demo')!;
    expect(after.sample_size).toBe(sampleBefore);
  });

  it('excludes low-confidence scores, which are not observations', async () => {
    const before = (await storedInsights()).find((r) => r.feature_value === 'feature_demo')!;
    const sampleBefore = before.sample_size as number;

    for (let i = 0; i < 10; i += 1) {
      const id = await publishMeasured('feature_demo', 0.99, 300 + i);
      await pool.query('update performance_scores set low_confidence = true where content_item_id = $1', [id]);
    }

    await learnFromPerformanceHandler(job, ctx());
    const after = (await storedInsights()).find((r) => r.feature_value === 'feature_demo')!;
    expect(after.sample_size).toBe(sampleBefore);
  });
});
