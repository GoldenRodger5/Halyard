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
import { generateHandler } from './handlers/generate.js';
import type { HandlerContext, Job } from './poller.js';

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

function context(): HandlerContext & { logs: Array<{ message: string }> } {
  const logs: Array<{ message: string }> = [];
  return {
    pool,
    workerId: 'test',
    logs,
    log: (message: string) => logs.push({ message }),
    enqueue: async () => undefined,
  } as unknown as HandlerContext & { logs: Array<{ message: string }> };
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
    expect(ctx.logs.some((l) => l.message.includes('wizard incomplete'))).toBe(true);
  });

  it('lets the calibration batch through, since it is what makes calibration possible', async () => {
    // The deadlock: startCalibrationBatch enqueues this job, and the guard
    // refused it because step_calibration_done was false — which is exactly
    // what the batch exists to make true. The wizard never produced its drafts
    // and nothing said so.
    const ctx = context();
    await generateHandler(job({ productId: 'recipefix', calibration: true, limit: 20 }), ctx);
    expect(ctx.logs.some((l) => l.message.includes('wizard incomplete'))).toBe(false);
  });

  it('still requires a voice, which a calibration run genuinely needs', async () => {
    await pool.query('update onboarding_state set step_voice_done = false where product_id = $1', [
      'recipefix',
    ]);
    const ctx = context();
    await generateHandler(job({ productId: 'recipefix', calibration: true }), ctx);
    expect(ctx.logs.some((l) => l.message.includes('wizard incomplete'))).toBe(true);
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
