/**
 * Autonomous editorial planning against the real schema.
 *
 * The pure test proves ranking. This proves the controller's durable contract:
 * one real signal becomes one auditable strategy row and one targeted generate
 * job — never a publish job, never a fan-out across every account.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  createIsolatedPool,
  databaseAvailable,
} from '../../../packages/db/src/__tests__/testDb.js';
import { planEditorialHandler } from './handlers/editorialCycle.js';

const available = await databaseAvailable();
const maybe = available ? describe : describe.skip;

maybe('autonomous editorial controller, end to end', () => {
  let pool: pg.Pool;
  let accountId: string;
  let signalId: string;
  const enqueued: Array<{
    kind: string;
    payload: Record<string, unknown>;
    options?: Record<string, unknown>;
  }> = [];

  beforeAll(async () => {
    pool = await createIsolatedPool('editorial_cycle', 4);

    await pool.query(
      `insert into products (id, name, connector_type, audience_timezone)
       values ('recipefix','RecipeFix','mcp','America/New_York')`,
    );
    await pool.query(
      `insert into onboarding_state
         (product_id, step_ingest_done, step_voice_done, step_calibration_done, step_templates_done)
       values ('recipefix', true, true, true, true)`,
    );
    await pool.query(`update settings set generation_enabled = true where id = true`);

    const account = await pool.query<{ id: string }>(
      `insert into social_accounts
         (product_id, platform, persona, handle, capability_state, provider_account_id)
       values ('recipefix','tiktok','brand','@recipefix','live','blotato-tiktok')
       returning id`,
    );
    accountId = account.rows[0]!.id;
    await pool.query(
      `insert into slots (product_id, platform, name, window_start, window_end)
       values ('recipefix','tiktok','morning','00:00','23:59')`,
    );

    const signal = await pool.query<{ id: string }>(
      `insert into signals
         (product_id, source, summary, raw, relevance, observed_at, confidence, velocity, platform)
       values (
         'recipefix',
         'trend',
         'People are asking how to keep high-protein breakfasts from turning chalky',
         '{"url":"https://example.com/trend","term":"high protein breakfast"}'::jsonb,
         0.9,
         now(),
         0.9,
         0.2,
         'tiktok'
       )
       returning id`,
    );
    signalId = signal.rows[0]!.id;
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
  });

  const ctx = () =>
    ({
      pool,
      log: () => undefined,
      enqueue: async (
        kind: string,
        payload: Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => {
        enqueued.push({ kind, payload, options });
      },
    }) as never;

  it('persists the real signal/account strategy before queuing one targeted generation', async () => {
    enqueued.length = 0;

    await planEditorialHandler(
      { id: 'editorial-job-1', kind: 'plan_editorial', payload: { productId: 'recipefix' } } as never,
      ctx(),
    );

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.kind).toBe('generate');
    expect(enqueued[0]!.payload).toMatchObject({
      productId: 'recipefix',
      preferredSignalId: signalId,
      onlyAccountId: accountId,
      onlyPlatform: 'tiktok',
      slotName: 'morning',
      limit: 1,
      autonomous: true,
    });
    const scheduledAt = new Date(String(enqueued[0]!.payload.scheduledAt));
    expect(Number.isNaN(scheduledAt.getTime())).toBe(false);
    expect(enqueued.some((job) => job.kind === 'publish')).toBe(false);

    const decisions = await pool.query<{
      id: string;
      signal_id: string;
      account_id: string;
      platform: string;
      evidence: string[];
      content_item_id: string | null;
      publish_earliest: string;
      publish_latest: string;
      timing_reason: string;
    }>(
      `select id, signal_id, account_id, platform, evidence, content_item_id,
              publish_earliest, publish_latest, timing_reason
         from strategy_decisions
        where product_id='recipefix'`,
    );
    expect(decisions.rows).toHaveLength(1);
    expect(decisions.rows[0]).toMatchObject({
      signal_id: signalId,
      account_id: accountId,
      platform: 'tiktok',
      content_item_id: null,
    });
    expect(decisions.rows[0]!.evidence).toContain('autonomy:editorial_cycle');
    expect(scheduledAt.getTime()).toBeGreaterThanOrEqual(
      new Date(decisions.rows[0]!.publish_earliest).getTime(),
    );
    expect(scheduledAt.getTime()).toBeLessThanOrEqual(
      new Date(decisions.rows[0]!.publish_latest).getTime(),
    );
    expect(decisions.rows[0]!.timing_reason).toContain('morning window');
    expect(enqueued[0]!.payload.strategyDecisionId).toBe(decisions.rows[0]!.id);
  });

  it('does not create a second autonomous decision for the same signal/account pair', async () => {
    enqueued.length = 0;

    await planEditorialHandler(
      { id: 'editorial-job-2', kind: 'plan_editorial', payload: { productId: 'recipefix' } } as never,
      ctx(),
    );

    expect(enqueued).toEqual([]);
    const decisions = await pool.query<{ n: string }>(
      `select count(*)::text as n from strategy_decisions where product_id='recipefix'`,
    );
    expect(Number(decisions.rows[0]!.n)).toBe(1);
  });
});
