/**
 * The Product Brain handlers, against a real Postgres.
 *
 * These cover the parts unit tests cannot: that evidence re-collection is
 * genuinely idempotent at the index, that a fact with no evidence is refused by
 * the database rather than by a caller remembering to check, and that
 * consumption is actually stamped — which before this phase nothing in
 * production did, leaving every agent permanently short of
 * `implemented_exercised`.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LlmClient } from '@halyard/core';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { buildBrainHandler } from './handlers/buildBrain.js';
import { upsertEvidence } from './handlers/collectEvidence.js';
import type { HandlerContext, Job } from './poller.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('brain', 6);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict (id) do nothing`,
  );
}, 180_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from product_facts');
  await pool.query('delete from product_evidence');
  await pool.query('delete from agent_runs');
  await pool.query(`delete from jobs where payload->>'productId' = 'recipefix'`);
});

const enqueued: Array<{ kind: string; payload: Record<string, unknown> }> = [];

function context(): HandlerContext {
  return {
    pool,
    workerId: 'test',
    log: () => undefined,
    enqueue: async (kind: string, payload: Record<string, unknown>) => {
      enqueued.push({ kind, payload });
    },
  } as unknown as HandlerContext;
}

function job(id = '11111111-1111-1111-1111-111111111111'): Job {
  return { id, kind: 'build_product_brain', payload: { productId: 'recipefix' } } as unknown as Job;
}

/** An LLM that replies with whatever each successive call should return. */
function scriptedLlm(replies: string[]): LlmClient {
  let i = 0;
  return {
    complete: async () => ({
      text: replies[Math.min(i++, replies.length - 1)] ?? '{"facts":[]}',
      costUsd: 0.001,
      inputTokens: 10,
      outputTokens: 10,
      model: 'stub',
    }),
  } as unknown as LlmClient;
}

async function seedEvidence(
  kind: string,
  sourceUrl: string,
  body: string,
  hash = sourceUrl,
): Promise<string> {
  const { id } = await upsertEvidence(context(), 'recipefix', {
    kind: kind as never,
    sourceUrl,
    contentHash: hash,
    title: sourceUrl,
    body,
    meta: {},
    collector: 'test',
  });
  return id;
}

d('evidence collection is idempotent', () => {
  it('does not insert a second row for unchanged content', async () => {
    const first = await seedEvidence('web_page', 'https://x.test/a', 'hello');
    const second = await seedEvidence('web_page', 'https://x.test/a', 'hello');

    expect(second).toBe(first);
    const { rows } = await pool.query<{ n: string }>(
      'select count(*) as n from product_evidence',
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('moves collected_at when the same content is seen again', async () => {
    const id = await seedEvidence('web_page', 'https://x.test/a', 'hello');
    await pool.query(
      `update product_evidence set collected_at = now() - interval '2 days' where id = $1`,
      [id],
    );

    await seedEvidence('web_page', 'https://x.test/a', 'hello');

    const { rows } = await pool.query<{ age: string }>(
      `select extract(epoch from now() - collected_at) as age from product_evidence where id = $1`,
      [id],
    );
    expect(Number(rows[0]!.age)).toBeLessThan(60);
  });

  it('inserts a new row when the content changed', async () => {
    await seedEvidence('web_page', 'https://x.test/a', 'hello', 'hash-1');
    await seedEvidence('web_page', 'https://x.test/a', 'goodbye', 'hash-2');

    const { rows } = await pool.query<{ n: string }>('select count(*) as n from product_evidence');
    expect(Number(rows[0]!.n)).toBe(2);
  });
});

d('the database refuses a fact with no evidence', () => {
  it('refuses to delete evidence a fact still cites', async () => {
    /**
     * `evidence_ids` is a `uuid[]` and Postgres cannot foreign-key an array
     * element, so without this the insert-time check was the only protection:
     * deleting the evidence left a fact citing a uuid resolving to nothing,
     * rendering with an empty provenance list — sourced-looking and unsourced.
     *
     * `restrict` rather than `cascade` on purpose. Cascading would silently
     * delete the conclusions, trading a visible dangling reference for an
     * invisible disappearance.
     */
    const id = await seedEvidence('web_page', 'https://x.test/cited', 'body');
    await pool.query(
      `insert into product_facts
         (product_id, category, key, value, evidence_ids, agent_id, agent_version)
       values ('recipefix','identity','cited','A fact', array[$1::uuid],
               'product-discovery','1.0')`,
      [id],
    );

    await expect(
      pool.query('delete from product_evidence where id = $1', [id]),
    ).rejects.toThrow(/cannot delete evidence/);

    // Deleting the conclusion first is allowed, because that is a deliberate act.
    await pool.query(`delete from product_facts where key = 'cited'`);
    await expect(
      pool.query('delete from product_evidence where id = $1', [id]),
    ).resolves.toBeTruthy();
  });

  it('rejects the insert rather than trusting the writer', async () => {
    /**
     * The single rule the whole design rests on, enforced where it cannot be
     * forgotten. A check in the handler would hold only for as long as every
     * future writer remembered it.
     */
    await expect(
      pool.query(
        `insert into product_facts (product_id, category, key, value, agent_id, agent_version)
         values ('recipefix','identity','x','y','product-discovery','1.0')`,
      ),
    ).rejects.toThrow(/must cite at least one evidence row/);
  });
});

d('building the brain', () => {
  it('writes facts, computes their status, and never takes one from the model', async () => {
    await seedEvidence('web_page', 'https://x.test/a', 'RecipeFix adapts recipes.');
    await seedEvidence('app_store_listing', 'https://apps.test/1', 'Adapts recipes.');

    /**
     * Both agents propose the same fact from *different* evidence, and both
     * insist it is verified with full confidence. The value must survive; the
     * assessment must not.
     */
    const claimVerified = (category: string) =>
      JSON.stringify({
        facts: [
          {
            category,
            key: 'what_it_is',
            value: 'Adapts recipes to dietary needs',
            status: 'verified',
            confidence: 1,
          },
        ],
      });

    await buildBrainHandler(job(), context(), {
      llm: scriptedLlm([claimVerified('identity'), claimVerified('app_store_positioning')]),
    });

    const { rows } = await pool.query<{
      category: string;
      value: string;
      status: string;
      confidence: string;
      agent_id: string;
      n_evidence: number;
    }>(
      `select category, value, status, confidence, agent_id,
              array_length(evidence_ids, 1) as n_evidence
         from product_facts order by category`,
    );

    expect(rows).toHaveLength(2);

    const identity = rows.find((r) => r.category === 'identity')!;
    expect(identity.value).toBe('Adapts recipes to dietary needs');
    expect(identity.agent_id).toBe('product-discovery');
    expect(identity.n_evidence).toBeGreaterThan(0);

    /**
     * The assertion this whole phase exists for.
     *
     * Each agent saw one source, so each fact rests on one observation — and
     * one observation is `unverified`, whatever the model claimed. The two
     * agents proposed into *different categories*, so they do not corroborate
     * each other either.
     */
    for (const row of rows) {
      expect(row.status, row.category).toBe('unverified');
      expect(Number(row.confidence), row.category).toBeLessThan(1);
    }
  });

  it('verifies a fact two agents found in genuinely different sources', async () => {
    await seedEvidence('web_page', 'https://x.test/a', 'Free to try.');
    await seedEvidence('app_store_listing', 'https://apps.test/1', 'Free to try.');

    /**
     * `pricing` is in both agents' remits, which is what makes this possible:
     * the same slot, the same value, from two genuinely different sources. That
     * is the one arrangement that earns `verified`, and it is earned by the
     * evidence rather than granted by either agent.
     */
    const pricing = JSON.stringify({
      facts: [{ category: 'pricing', key: 'entry_price', value: 'Free to try' }],
    });

    await buildBrainHandler(job(), context(), { llm: scriptedLlm([pricing, pricing]) });

    const { rows } = await pool.query<{
      status: string;
      confidence: string;
      last_verified_at: Date | null;
      n_evidence: number;
    }>(
      `select status, confidence, last_verified_at, array_length(evidence_ids, 1) as n_evidence
         from product_facts where category = 'pricing'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('verified');
    expect(rows[0]!.n_evidence).toBe(2);
    // A verified fact carries a verification time; an unverified one must not.
    expect(rows[0]!.last_verified_at).not.toBeNull();
  });

  it('records a contradiction without resolving it', async () => {
    await seedEvidence('web_page', 'https://x.test/a', 'Five pounds a month.');
    await seedEvidence('app_store_listing', 'https://apps.test/1', 'Nine pounds a month.');

    await buildBrainHandler(job(), context(), {
      llm: scriptedLlm([
        JSON.stringify({ facts: [{ category: 'pricing', key: 'monthly', value: '£5 a month' }] }),
        JSON.stringify({ facts: [{ category: 'pricing', key: 'monthly', value: '£9 a month' }] }),
        'The website may be showing a promotional price.',
      ]),
    });

    const { rows } = await pool.query<{
      value: string;
      contradicts: string | null;
      reconciliation: string | null;
    }>('select value, contradicts, reconciliation from product_facts order by value');

    expect(rows).toHaveLength(2);
    // Both sides kept, both pointed at each other, neither demoted.
    expect(rows.every((r) => r.contradicts !== null)).toBe(true);
    expect(rows[0]!.reconciliation).toContain('promotional');
  });

  it('stamps consumption for every agent whose output reached the table', async () => {
    await seedEvidence('web_page', 'https://x.test/a', 'RecipeFix adapts recipes.');

    // A run recorded against this job, as the recorder would have written it.
    await pool.query(
      `insert into agent_runs (agent_id, agent_version, team, trigger, trigger_ref, status,
                               completed_at)
       values ('product-discovery','1.0','product_intelligence','job',$1,'succeeded', now())`,
      [job().id],
    );

    await buildBrainHandler(job(), context(), {
      llm: scriptedLlm([
        JSON.stringify({ facts: [{ category: 'identity', key: 'what', value: 'A recipe adapter' }] }),
      ]),
    });

    const { rows } = await pool.query<{ consumer: string | null }>(
      `select downstream_consumer as consumer from agent_runs where agent_id = 'product-discovery'`,
    );
    expect(rows[0]!.consumer).toBe('product_facts');
  });

  it('does not stamp an agent whose every proposal was rejected', async () => {
    await seedEvidence('web_page', 'https://x.test/a', 'Something.');
    await pool.query(
      `insert into agent_runs (agent_id, agent_version, team, trigger, trigger_ref, status,
                               completed_at)
       values ('product-discovery','1.0','product_intelligence','job',$1,'succeeded', now())`,
      [job().id],
    );

    // A category outside the agent's remit: parsed, rejected, nothing stored.
    await buildBrainHandler(job(), context(), {
      llm: scriptedLlm([
        JSON.stringify({ facts: [{ category: 'visual_identity', key: 'x', value: 'warm' }] }),
      ]),
    });

    const facts = await pool.query<{ n: string }>('select count(*) as n from product_facts');
    expect(Number(facts.rows[0]!.n)).toBe(0);

    // Ran, but produced nothing usable — which is a different thing from ran
    // usefully, and the distinction is what `implemented_exercised` turns on.
    const { rows } = await pool.query<{ consumer: string | null }>(
      `select downstream_consumer as consumer from agent_runs where agent_id = 'product-discovery'`,
    );
    expect(rows[0]!.consumer).toBeNull();
  });

  it('does nothing at all when there is no evidence', async () => {
    await buildBrainHandler(job(), context(), { llm: scriptedLlm(['{"facts":[]}']) });
    const { rows } = await pool.query<{ n: string }>('select count(*) as n from product_facts');
    // An empty Brain is the correct outcome, not a reason to invent facts.
    expect(Number(rows[0]!.n)).toBe(0);
  });
});

d('consumption is stamped', () => {
  it('marks a run consumed, which nothing in production did before P1', async () => {
    /**
     * `deriveState` requires `outputConsumed` for `implemented_exercised`, and
     * `markOutputConsumed` had no production caller — so every agent was
     * capped at `implemented_partial` however often it ran. This asserts the
     * mechanism works end to end against a real row.
     */
    const { markOutputConsumed } = await import('./agentRuns.js');

    await pool.query(
      `insert into agent_runs (agent_id, agent_version, team, trigger, trigger_ref, status,
                               completed_at)
       values ('product-discovery','1.0','product_intelligence','job','brain-job','succeeded', now())`,
    );

    const stamped = await markOutputConsumed(pool, {
      agentId: 'product-discovery',
      triggerRef: 'brain-job',
      consumer: 'product_facts',
    });
    expect(stamped).toBe(1);

    const { rows } = await pool.query<{ consumer: string; at: Date | null }>(
      `select downstream_consumer as consumer, downstream_consumed_at as at
         from agent_runs where trigger_ref = 'brain-job'`,
    );
    expect(rows[0]!.consumer).toBe('product_facts');
    expect(rows[0]!.at).not.toBeNull();
  });
});
