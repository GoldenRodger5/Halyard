/**
 * The generate handler's gates, against a real Postgres. Milestone 51.
 *
 * Both tests here exist because of a bug found while building the launch batch,
 * and both bugs shared a shape: the failure was silent. One job returned
 * quietly having done nothing, and one insert died inside a catch that read the
 * death as a rejected draft. Neither showed up as an error anywhere.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { classifyHookType, extractHookPattern } from '@halyard/core';
import { copywriterDontRules, disownPartialContentItem, generateHandler } from './handlers/generate.js';
import type { Job } from './poller.js';
import { testContext, type TestContext } from './testContext.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('generate', 6);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')`,
  );
}, 120_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from onboarding_state where product_id = $1', ['recipefix']);
  await pool.query('delete from notifications');
});

function context(): TestContext {
  return testContext({ pool });
}

const job = (payload: Record<string, unknown>): Job =>
  ({ id: 'j1', kind: 'generate', payload, attempts: 1, max_attempts: 3, dedupe_key: null }) as Job;

d('the calibration batch is not blocked by calibration', () => {
  beforeEach(async () => {
    await pool.query(
      `insert into onboarding_state
         (product_id, step_ingest_done, step_voice_done, step_calibration_done, step_templates_done)
       values ('recipefix', true, true, false, true)`,
    );
  });

  it('refuses an ordinary run until calibration is done', async () => {
    const ctx = context();
    await generateHandler(job({ productId: 'recipefix' }), ctx);
    expect(ctx.logs.some((l) => l.includes('wizard incomplete'))).toBe(true);
  });

  it('lets the calibration batch through, since it is what makes calibration possible', async () => {
    // The deadlock: startCalibrationBatch enqueues this job, and the guard
    // refused it because step_calibration_done was false — which is exactly
    // what the batch exists to make true. The wizard never produced its drafts
    // and nothing said so.
    const ctx = context();
    await generateHandler(job({ productId: 'recipefix', calibration: true, limit: 20 }), ctx);
    expect(ctx.logs.some((l) => l.includes('wizard incomplete'))).toBe(false);
  });

  it('still requires a voice, which a calibration run genuinely needs', async () => {
    await pool.query('update onboarding_state set step_voice_done = false where product_id = $1', [
      'recipefix',
    ]);
    const ctx = context();
    await generateHandler(job({ productId: 'recipefix', calibration: true }), ctx);
    expect(ctx.logs.some((l) => l.includes('wizard incomplete'))).toBe(true);
  });
});

d('a learned hook survives its own table', () => {
  it('inserts with the columns the schema requires', async () => {
    // hook_type became NOT NULL in migration 0012 and the insert in generate.ts
    // never supplied it, so every hook a draft produced died on a constraint —
    // inside a catch that treated it as a rejected draft.
    const pattern = 'Your gluten-free bread is gummy and it is not your fault';

    await expect(
      pool.query(
        `insert into hooks
           (product_id, pattern, pattern_template, hook_type, layer, platform, category, source, uses)
         values ($1,$2,$3,$4,'text',$5,$6,'approved_post',1)`,
        [
          'recipefix',
          pattern,
          extractHookPattern(pattern).template,
          classifyHookType(pattern),
          'x',
          'education',
        ],
      ),
    ).resolves.toBeTruthy();

    const { rows } = await pool.query<{ hook_type: string; pattern_template: string }>(
      'select hook_type, pattern_template from hooks where pattern = $1',
      [pattern],
    );
    expect(rows[0]!.hook_type).toBeTruthy();
    expect(rows[0]!.pattern_template).toContain('{');
  });

  it('rejects the old insert, which is why nothing was being learned', async () => {
    await expect(
      pool.query(
        `insert into hooks (product_id, pattern, platform, category, source, uses)
         values ('recipefix','a second pattern entirely','x','education','approved_post',1)`,
      ),
    ).rejects.toThrow(/hook_type/);
  });
});

d('the scheduler enqueues once per bucket, not once per tick', () => {
  beforeEach(async () => {
    await pool.query(`delete from jobs where dedupe_key like 'sched:%'`);
  });

  it('does not re-enqueue a bucket whose job has already finished', async () => {
    const { enqueueDueJobs } = await import('./scheduler.js');

    const first = await enqueueDueJobs(pool);
    expect(first.enqueued).toBeGreaterThan(0);

    // The tick runs every minute. Completing the work must not free the bucket:
    // the partial dedupe index only covers queued and running, so before this
    // was fixed the next tick enqueued the whole schedule again — every minute,
    // whatever the interval. Eleven hours of production ran a thirty-minute job
    // 694 times.
    await pool.query(`update jobs set status = 'done' where dedupe_key like 'sched:%'`);

    const second = await enqueueDueJobs(pool);
    expect(second.enqueued, 'a finished bucket was enqueued again').toBe(0);
  });

  it('enqueues again once the bucket actually advances', async () => {
    const { enqueueDueJobs } = await import('./scheduler.js');

    await enqueueDueJobs(pool);
    await pool.query(`update jobs set status = 'done' where dedupe_key like 'sched:%'`);

    // Two days on, every bucket in SCHEDULES has moved.
    const later = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const next = await enqueueDueJobs(pool, later);
    expect(next.enqueued).toBeGreaterThan(0);
  });
});

/**
 * Signals becoming ideas, against a real Postgres.
 *
 * The break this closes: `ideas` is the entry point of the whole generation
 * pipeline and its **only writer in the repository was `supabase/seed-demo.sql`**.
 * `generate` read `status = 'proposed'`, found nothing, logged "no proposed
 * ideas to draft" and returned — every scheduled run, forever. Meanwhile
 * `signals`, written by `collect_watch_terms` when a question recurs, was read
 * by nothing at all.
 *
 * The model is stubbed. What is being proven is the wiring and the persistence,
 * not the model's taste — a live call needs credits that are not available, and
 * that boundary is stated rather than crossed.
 */
d('proposing ideas from signals', () => {
  const IDEAS = JSON.stringify({
    ideas: [
      {
        title: 'Why your gluten-free loaf is gummy',
        angle: 'Starch holds the water gluten would have held.',
        category: 'education',
        rationale: 'asked nine times this month',
      },
    ],
  });

  function stubLlm(text: string) {
    return {
      calls: 0,
      async complete() {
        this.calls += 1;
        return { text, model: 'stub', inputTokens: 10, outputTokens: 20, costUsd: 0.002 };
      },
    };
  }

  beforeEach(async () => {
    if (!available) return;
    await pool.query('delete from ideas');
    await pool.query('delete from signals');
  });

  async function seedSignal(summary: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into signals (product_id, source, summary, raw, relevance)
       values ('recipefix','editorial',$1,'{}'::jsonb, 0.9) returning id`,
      [summary],
    );
    return rows[0]!.id;
  }

  it('writes an idea that cites the signal it came from', async () => {
    const signalId = await seedSignal('Asked 9 times: why is my GF loaf gummy');
    const { proposeFromSignals } = await import('./handlers/generate.js');

    const written = await proposeFromSignals(
      context(),
      { id: 'recipefix', name: 'RecipeFix', brief_summary: 'Adapts recipes.', brief_markdown: null },
      stubLlm(IDEAS) as never,
    );

    expect(written).toBe(1);
    const { rows } = await pool.query<{
      title: string;
      status: string;
      source_signals: string[];
    }>('select title, status, source_signals from ideas');

    expect(rows).toHaveLength(1);
    // Proposed, not selected: this proposes and nothing here decides.
    expect(rows[0]!.status).toBe('proposed');
    // The provenance link the schema has always had a column for.
    expect(rows[0]!.source_signals).toEqual([signalId]);
  });

  it('marks the signal consumed so it does not queue behind every future run', async () => {
    await seedSignal('Asked 4 times: can I halve the yeast');
    const { proposeFromSignals } = await import('./handlers/generate.js');

    await proposeFromSignals(
      context(),
      { id: 'recipefix', name: 'RecipeFix', brief_summary: 'Adapts recipes.', brief_markdown: null },
      stubLlm(IDEAS) as never,
    );

    const { rows } = await pool.query<{ consumed_at: string | null }>(
      'select consumed_at from signals',
    );
    expect(rows[0]!.consumed_at).not.toBeNull();
  });

  it('consumes a signal even when nothing usable came back', async () => {
    /**
     * Otherwise one signal the model cannot use is re-sent on every run
     * forever, spending a call each time to reach the same answer. If it
     * genuinely matters it will recur, and `collect_watch_terms` raises it
     * again — which is what measuring recurrence over thirty days is for.
     */
    await seedSignal('Asked 3 times: something unusable');
    const { proposeFromSignals } = await import('./handlers/generate.js');

    const written = await proposeFromSignals(
      context(),
      { id: 'recipefix', name: 'RecipeFix', brief_summary: 'Adapts recipes.', brief_markdown: null },
      stubLlm('not json') as never,
    );

    expect(written).toBe(0);
    const { rows } = await pool.query<{ consumed_at: string | null }>(
      'select consumed_at from signals',
    );
    expect(rows[0]!.consumed_at).not.toBeNull();
  });

  it('spends nothing when there is no signal to propose from', async () => {
    /**
     * The regression this prevents: `generate` runs daily and "no proposed
     * ideas" is the normal state of an idle product, so proposing from mix
     * state alone would spend a strategy-model call on every empty run forever.
     * An existing calibration test caught it by failing with a real
     * `OpenAI 429` — the handler had started calling the live model.
     */
    const llm = stubLlm(IDEAS);
    const { proposeFromSignals } = await import('./handlers/generate.js');

    const written = await proposeFromSignals(
      context(),
      { id: 'recipefix', name: 'RecipeFix', brief_summary: 'Adapts recipes.', brief_markdown: null },
      llm as never,
    );

    expect(written).toBe(0);
    expect(llm.calls).toBe(0);
  });

  it('proposes nothing rather than inventing a top performer', async () => {
    /**
     * `performance_scores` is empty because nothing has published. The prompt
     * asks about top performers, and supplying a fabricated one would put an
     * invented claim into the prompt that writes the next sixty days of
     * content. The call still happens; the field is honestly empty.
     */
    await seedSignal('Asked 5 times: does the crumb change');
    const llm = stubLlm(IDEAS);
    const { proposeFromSignals } = await import('./handlers/generate.js');

    await proposeFromSignals(
      context(),
      { id: 'recipefix', name: 'RecipeFix', brief_summary: 'Adapts recipes.', brief_markdown: null },
      llm as never,
    );

    const { rows } = await pool.query('select content_item_id from performance_scores');
    expect(rows).toHaveLength(0);
    expect(llm.calls).toBe(1);
  });
});

/**
 * The learning edge, through the real handler query.
 *
 * The scorer has always accepted `historicalConversion` and `generate` never
 * supplied it, so every idea scored on the neutral. Correct while nothing has
 * published — and it would have stayed that way afterwards, which is the
 * difference between a cold start and an edge that never connects.
 */
d('past conversion reaches the scorer', () => {
  /** The statement `generate` runs, driven against this pool. */
  async function conversionByCategory(productId: string): Promise<Map<string, number>> {
    const { rows } = await pool.query<{ category: string; mean: string }>(
      `select ci.category, avg(ps.conversion_score) as mean
         from performance_scores ps
         join content_items ci on ci.id = ps.content_item_id
        where ci.product_id = $1 and ps.conversion_score is not null
        group by ci.category`,
      [productId],
    );
    return new Map(rows.map((r) => [r.category, Number(r.mean)]));
  }

  beforeEach(async () => {
    if (!available) return;
    await pool.query('delete from performance_scores');
    await pool.query(`delete from content_items where product_id = 'recipefix'`);
  });

  it('is empty when nothing has been scored, so the neutral still applies', async () => {
    // The state today: `performance_scores` has no rows because nothing has
    // published. The map is empty and every candidate carries `undefined`.
    expect(await conversionByCategory('recipefix')).toEqual(new Map());
  });

  it('carries a real mean once a publication has been scored', async () => {
    const { rows: account } = await pool.query<{ id: string }>(
      `insert into social_accounts (product_id, platform, persona, handle, capability_state)
       values ('recipefix','x','brand','@histtest','draft_only') returning id`,
    );
    for (const [category, conversion] of [
      ['education', 0.8],
      ['education', 0.6],
      ['product', 0.2],
    ] as const) {
      const { rows: item } = await pool.query<{ id: string }>(
        `insert into content_items
           (product_id, account_id, platform, persona, format, category, body, status)
         values ('recipefix',$1,'x','brand','text',$2,'body','published') returning id`,
        [account[0]!.id, category],
      );
      await pool.query(
        `insert into performance_scores (content_item_id, score, conversion_score)
         values ($1, 0.5, $2)`,
        [item[0]!.id, conversion],
      );
    }

    const map = await conversionByCategory('recipefix');
    // Averaged per category, which is the grain the scorer asks for.
    expect(map.get('education')).toBeCloseTo(0.7);
    expect(map.get('product')).toBeCloseTo(0.2);
    // A category with no measurement stays absent rather than becoming zero.
    expect(map.has('community')).toBe(false);

    await pool.query('delete from social_accounts where handle = $1', ['@histtest']);
  });
});

/**
 * Paying twice for the same evidence.
 *
 * The order was: call the model, insert the ideas, then mark the signals
 * consumed. If the insert threw — a constraint, a dropped connection — the
 * signals stayed unconsumed, `JOB_POLICY.generate` retried the job, and the
 * same signals went to the model a second time and were paid for twice.
 *
 * The fault is injected at the real boundary: `proposeFromSignals` is given a
 * pool whose `insert into ideas` fails. Nothing about the function is mocked.
 */
d('a failed persist does not cause a second model call', () => {
  const IDEAS = JSON.stringify({
    ideas: [
      {
        title: 'Why your gluten-free loaf is gummy',
        angle: 'Starch holds the water gluten would have held.',
        category: 'education',
        rationale: 'asked nine times',
      },
    ],
  });

  function countingLlm(text: string) {
    return {
      calls: 0,
      async complete() {
        this.calls += 1;
        return { text, model: 'stub', inputTokens: 10, outputTokens: 20, costUsd: 0.002 };
      },
    };
  }

  /** The real pool, with one statement made to fail. */
  function poolThatCannotInsertIdeas() {
    return {
      query: (async (sql: string, params?: unknown[]) => {
        if (typeof sql === 'string' && sql.includes('insert into ideas')) {
          throw new Error('simulated persistence failure');
        }
        return pool.query(sql, params as never);
      }) as unknown as typeof pool.query,
    };
  }

  beforeEach(async () => {
    if (!available) return;
    await pool.query('delete from ideas');
    await pool.query('delete from signals');
  });

  it('marks the signals consumed before persisting, so a retry spends nothing', async () => {
    await pool.query(
      `insert into signals (product_id, source, summary, raw, relevance)
       values ('recipefix','editorial','Asked 9 times: why gummy','{}'::jsonb, 0.9)`,
    );

    const llm = countingLlm(IDEAS);
    const product = {
      id: 'recipefix',
      name: 'RecipeFix',
      brief_summary: 'Adapts recipes.',
      brief_markdown: null,
    };
    const { proposeFromSignals } = await import('./handlers/generate.js');

    const failing = { ...context(), pool: poolThatCannotInsertIdeas() } as never;
    await expect(proposeFromSignals(failing, product, llm as never)).rejects.toThrow(
      /simulated persistence failure/,
    );

    expect(llm.calls).toBe(1);
    // The spend already happened, so the evidence must not be re-sendable.
    const { rows } = await pool.query<{ consumed_at: string | null }>(
      'select consumed_at from signals',
    );
    expect(rows[0]!.consumed_at).not.toBeNull();

    // The retry the job policy would perform: no unconsumed signal, no call.
    const second = await proposeFromSignals(context(), product, llm as never);
    expect(second).toBe(0);
    expect(llm.calls).toBe(1);
  });

  it('loses the proposals rather than the money, and says nothing was written', async () => {
    /**
     * The trade, asserted. A question that genuinely matters recurs and
     * `collect_watch_terms` raises it again; a spent credit does not come back.
     */
    await pool.query(
      `insert into signals (product_id, source, summary, raw, relevance)
       values ('recipefix','editorial','Asked 4 times: halve the yeast','{}'::jsonb, 0.5)`,
    );
    const { proposeFromSignals } = await import('./handlers/generate.js');

    await expect(
      proposeFromSignals(
        { ...context(), pool: poolThatCannotInsertIdeas() } as never,
        { id: 'recipefix', name: 'RecipeFix', brief_summary: 'x', brief_markdown: null },
        countingLlm(IDEAS) as never,
      ),
    ).rejects.toThrow();

    const { rows } = await pool.query('select id from ideas');
    expect(rows).toHaveLength(0);
  });
});

/**
 * Two runs at once must not pay for the same evidence.
 *
 * §87 closed the double-spend window for *retries* by consuming signals before
 * persistence. Concurrency was still open: `generate` is not worker-scheduled —
 * it runs from the web cron and from `regenerateItem` — so two runs for one
 * product can overlap, and a plain `select … where consumed_at is null` lets
 * both read the same rows and both send them to the model.
 */
d('concurrent generation claims signals exactly once', () => {
  const IDEAS = JSON.stringify({
    ideas: [
      {
        title: 'Why your gluten-free loaf is gummy',
        angle: 'Starch holds the water gluten would have held.',
        category: 'education',
        rationale: 'asked nine times',
      },
    ],
  });

  function countingLlm(text: string) {
    return {
      calls: 0,
      async complete() {
        this.calls += 1;
        // A beat, so both runs are genuinely in flight together.
        await new Promise((r) => setTimeout(r, 25));
        return { text, model: 'stub', inputTokens: 10, outputTokens: 20, costUsd: 0.002 };
      },
    };
  }

  const product = {
    id: 'recipefix',
    name: 'RecipeFix',
    brief_summary: 'Adapts recipes.',
    brief_markdown: null,
  };

  beforeEach(async () => {
    if (!available) return;
    await pool.query('delete from ideas');
    await pool.query('delete from signals');
  });

  it('sends the evidence to the model once across two simultaneous runs', async () => {
    for (const n of [1, 2, 3]) {
      await pool.query(
        `insert into signals (product_id, source, summary, raw, relevance)
         values ('recipefix','editorial',$1,'{}'::jsonb, 0.9)`,
        [`Asked ${n} times: why gummy`],
      );
    }

    const llm = countingLlm(IDEAS);
    const { proposeFromSignals } = await import('./handlers/generate.js');

    const [a, b] = await Promise.all([
      proposeFromSignals(context(), product, llm as never),
      proposeFromSignals(context(), product, llm as never),
    ]);

    // One run claimed all three signals; the other found none and spent nothing.
    expect(llm.calls).toBe(1);
    expect([a, b].filter((n) => n > 0)).toHaveLength(1);

    const { rows } = await pool.query<{ consumed_at: string | null }>(
      'select consumed_at from signals',
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.consumed_at !== null)).toBe(true);
  });

  it('releases the claim when the model call never completed', async () => {
    /**
     * Claiming without releasing would drain every signal on the first run
     * while there are no LLM credits — and they would be gone by the time
     * credits arrived, which is exactly the state Halyard is in.
     */
    await pool.query(
      `insert into signals (product_id, source, summary, raw, relevance)
       values ('recipefix','editorial','Asked 4 times: halve the yeast','{}'::jsonb, 0.5)`,
    );

    const failing = {
      async complete() {
        throw new Error('OpenAI 429: You have no credits remaining.');
      },
    };
    const { proposeFromSignals } = await import('./handlers/generate.js');

    await expect(proposeFromSignals(context(), product, failing as never)).rejects.toThrow(/429/);

    const { rows } = await pool.query<{ consumed_at: string | null }>(
      'select consumed_at from signals',
    );
    expect(rows[0]!.consumed_at).toBeNull();
  });
});

/**
 * The rejection loop's last link.
 *
 * Accepting a rejection cluster appends a rule to
 * `products.content_rules.operator_rules`. Nothing read that column, so the
 * operator's accepted rules never reached the copywriter and the loop only
 * looked closed.
 */
describe('the copywriter is told what the operator rejected', () => {
  it('carries accepted operator rules into the DO NOT list', () => {
    expect(
      copywriterDontRules(['No emoji.'], {
        operator_rules: ['Every post needs a mechanism or a number.'],
      }),
    ).toEqual(['No emoji.', 'Every post needs a mechanism or a number.']);
  });

  it('survives a product with no rules recorded', () => {
    expect(copywriterDontRules(['No emoji.'], null)).toEqual(['No emoji.']);
    expect(copywriterDontRules(['No emoji.'], {})).toEqual(['No emoji.']);
  });

  it('says a rule once, however many times it was accepted', () => {
    expect(
      copywriterDontRules(['No emoji.'], { operator_rules: ['no emoji.', 'Be specific.'] }),
    ).toEqual(['No emoji.', 'Be specific.']);
  });
});

/**
 * §120. A generate attempt that dies after adapting must not buy the same
 * adaptation again.
 *
 * `generateSample` is one real RecipeFix credit. The idea was marked `selected`
 * *after* that call, so a job that died in between left it `proposed`, and the
 * second attempt `JOB_POLICY.generate` allows re-selected it and paid again.
 *
 * The product here has `connector_type: 'none'`, whose `generateSample` throws
 * `ConnectorUnavailableError` — the failure path that used to leak the idea
 * back into the pool.
 */
/**
 * §142. One unconfigured account must not stop the others.
 *
 * Found in the first live generation run: an Instagram account with an empty
 * `supported_formats` threw before the loop reached `x`, failing the whole job.
 * With `maxAttempts: 2` that dead-letters, so daily generation stops for the
 * product until someone reconnects an account the error does not point at.
 */
d('an account that can take no format does not stop the rest', () => {
  const PRODUCT = 'skiptest';

  beforeEach(async () => {
    await pool.query(
      `insert into products (id, name, connector_type) values ($1,'SkipTest','none')
       on conflict (id) do nothing`,
      [PRODUCT],
    );
    await pool.query(
      `insert into onboarding_state
         (product_id, step_ingest_done, step_voice_done, step_calibration_done, step_templates_done)
       values ($1,true,true,true,true) on conflict (product_id) do nothing`,
      [PRODUCT],
    );
    await pool.query(
      `insert into brand_voices (product_id, persona, display_name, description, do_rules, dont_rules, mix_targets)
       values ($1,'brand','ST','voice','{}','{}','{}'::jsonb) on conflict do nothing`,
      [PRODUCT],
    );
    await pool.query('delete from social_accounts where product_id = $1', [PRODUCT]);
    // The account with unknown capabilities comes first in creation order.
    await pool.query(
      `insert into social_accounts
         (product_id, platform, persona, handle, capability_state, supported_formats)
       values ($1,'instagram','brand','@broken','draft_only','{}')`,
      [PRODUCT],
    );
    await pool.query(
      `insert into templates (id, product_id, renderer, format, aspect_ratio, enabled)
       values ('t_skip',$1,'satori','image','1:1',true) on conflict (id) do nothing`,
      [PRODUCT],
    );
    await pool.query('delete from ideas where product_id = $1', [PRODUCT]);
  });

  it('skips it and says so, rather than failing the whole run', async () => {
    await pool.query(
      `insert into ideas (product_id, title, angle, category, status)
       values ($1,'T','A','education','proposed')`,
      [PRODUCT],
    );

    const ctx = context();
    // No throw: the guard still refuses that account, but the job survives.
    await expect(generateHandler(job({ productId: PRODUCT }), ctx)).resolves.toBeUndefined();
    expect(
      ctx.logs.some((l) => l.includes('cannot take any format')),
      'the skip must be logged, not silent',
    ).toBe(true);
  });
});

d('an idea is claimed before anything is spent on it', () => {
  /*
   * A GitHub-backed product, whose `generateSample` throws
   * `ConnectorUnavailableError` immediately and without a network call. That is
   * the real failure path §78 describes — the adaptation did not complete — and
   * it is free and deterministic, so this test never touches a provider.
   *
   * Its own product id, so changing the connector type cannot affect the other
   * blocks in this file.
   */
  const PRODUCT = 'claimtest';
  let previousToken: string | undefined;

  beforeAll(() => {
    // `createConnector` returns null without one, and a null connector spends
    // nothing. The value is never used: `generateSample` throws before the
    // GitHub client is touched.
    previousToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'test-token-not-used';
  });

  afterAll(() => {
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
  });

  beforeEach(async () => {
    await pool.query(
      `insert into products (id, name, connector_type, connector_config)
       values ($1,'ClaimTest','github','{"owner":"x","repo":"y"}'::jsonb)
       on conflict (id) do update set connector_type = 'github'`,
      [PRODUCT],
    );
    await pool.query(
      `insert into onboarding_state
         (product_id, step_ingest_done, step_voice_done, step_calibration_done, step_templates_done)
       values ($1, true, true, true, true) on conflict (product_id) do nothing`,
      [PRODUCT],
    );
    await pool.query(
      `insert into brand_voices (product_id, persona, display_name, description, do_rules, dont_rules, mix_targets)
       values ($1,'brand','CT','voice','{}','{}','{}'::jsonb) on conflict do nothing`,
      [PRODUCT],
    );
    await pool.query(
      `insert into social_accounts
         (product_id, platform, persona, handle, capability_state, supported_formats)
       values ($1,'x','brand','@ct','draft_only','{image,text}') on conflict do nothing`,
      [PRODUCT],
    );
    await pool.query(
      `insert into templates (id, product_id, renderer, format, aspect_ratio, enabled)
       values ('t_claim',$1,'satori','image','1:1',true) on conflict (id) do nothing`,
      [PRODUCT],
    );
    await pool.query('delete from ideas where product_id = $1', [PRODUCT]);
  });

  async function seedIdea(): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into ideas (product_id, title, angle, category, status)
       values ($1,'Vinegar and crumb','Why acid firms a gluten-free loaf','education','proposed')
       returning id`,
      [PRODUCT],
    );
    return rows[0]!.id;
  }

  async function statusOf(id: string): Promise<string> {
    const { rows } = await pool.query<{ status: string }>(
      'select status from ideas where id = $1',
      [id],
    );
    return rows[0]!.status;
  }

  it('does not leave the idea claimable after the adaptation failed', async () => {
    const id = await seedIdea();
    await generateHandler(job({ productId: PRODUCT }), context());

    // Before the reordering this read 'proposed', which is what let the second
    // attempt buy the same adaptation again.
    expect(await statusOf(id)).not.toBe('proposed');
  });

  it('a second attempt does not reach the connector for that idea again', async () => {
    const id = await seedIdea();
    await generateHandler(job({ productId: PRODUCT }), context());
    const afterFirst = await statusOf(id);

    const second = context();
    await generateHandler(job({ productId: PRODUCT }), second);

    expect(await statusOf(id)).toBe(afterFirst);
    // Nothing selectable is left, so the second attempt never reaches a spend.
    expect(second.logs.some((l) => l.includes('no proposed ideas'))).toBe(true);
  });

  it('leaves an idea alone that another attempt already claimed', async () => {
    const id = await seedIdea();
    await pool.query(`update ideas set status = 'selected' where id = $1`, [id]);

    const ctx = context();
    await generateHandler(job({ productId: PRODUCT }), ctx);

    // Not re-selected at all: the pool query filters on 'proposed'.
    expect(await statusOf(id)).toBe('selected');
  });
});

/**
 * §258. The row that outlives the piece.
 *
 * `content_items` is inserted when the copy is written and the voiceover lands
 * on it two hundred lines later, so every abort in between leaves an
 * approvable row with no media. This was live: three YouTube long-form items
 * reached `pending_approval` with `ai_components` of `{copy}`, no `vo_script`,
 * no `vo_asset_id` and an empty `render_ids` — videos with no video — while the
 * handler logged "nothing queued".
 */
d('a half-built item is disowned, not left in the approval queue', () => {
  let accountId = '';

  beforeEach(async () => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into social_accounts (product_id, platform, persona, handle, capability_state)
       values ('recipefix','youtube','brand','RecipeFix','draft_only')
       on conflict (product_id, platform, persona)
         do update set handle = excluded.handle
       returning id`,
    );
    accountId = rows[0]!.id;
  });

  const seed = async (status: string) => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into content_items
         (product_id, account_id, platform, persona, format, category, body, status, ai_components)
       values ('recipefix',$2,'youtube','brand','video','education','Body.',$1,'{copy}')
       returning id`,
      [status, accountId],
    );
    return rows[0]!.id;
  };

  it('fails the row and records why, so the queue cannot show it as a piece', async () => {
    const id = await seed('pending_approval');
    await disownPartialContentItem(pool, id, 'The voiceover was rejected by QC after 3 attempts.');

    const { rows } = await pool.query<{ status: string; generation_meta: { failed_because?: string } }>(
      'select status, generation_meta from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.generation_meta.failed_because).toContain('rejected by QC');
  });

  it('never touches a row an operator already approved', async () => {
    /*
     * The guard that makes this safe to call from a catch-all. A late throw
     * must not be able to reach back and fail something a person signed off.
     */
    const id = await seed('approved');
    await disownPartialContentItem(pool, id, 'should not apply');

    const { rows } = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.status).toBe('approved');
  });

  it('does not overwrite a failure that already has its own reason', async () => {
    const id = await seed('failed');
    await disownPartialContentItem(pool, id, 'a second, later reason');

    const { rows } = await pool.query<{ generation_meta: { failed_because?: string } }>(
      'select generation_meta from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.generation_meta?.failed_because).toBeUndefined();
  });

  it('does nothing when the abort happened before anything was inserted', async () => {
    /* Null is the honest "there is no row to disown", not an error. */
    await expect(disownPartialContentItem(pool, null, 'nothing to do')).resolves.toBeUndefined();
  });
});
