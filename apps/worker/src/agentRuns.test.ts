/**
 * Execution records, against a real Postgres.
 *
 * The lifecycle matters more than any single field: a run that begins and never
 * finishes must stay visibly `running` rather than disappearing, because an
 * agent that dies mid-call is exactly the case where the record is the only
 * evidence there was.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { markOutputConsumed, postgresAgentRunSink, recordingClient } from './agentRuns.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('agentruns', 6);
}, 120_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from agent_runs');
});

const ok = { text: 'draft', model: 'stub', inputTokens: 5, outputTokens: 9, costUsd: 0.002 };

d('agent run lifecycle', () => {
  it('records a run from begin to succeeded', async () => {
    const sink = postgresAgentRunSink(pool);
    const runId = await sink.begin({
      agentId: 'copywriter',
      agentVersion: '1.0',
      team: 'content',
      trigger: 'job',
      triggerRef: 'job-1',
      inputRef: { promptVersion: 'copywriter.v1' },
    });
    expect(runId).toBeTruthy();

    const midway = await pool.query<{ status: string; completed_at: string | null }>(
      'select status, completed_at from agent_runs where run_id = $1',
      [runId],
    );
    // Visibly running, not absent. An agent that dies mid-call leaves this row
    // as the only evidence it started.
    expect(midway.rows[0]!.status).toBe('running');
    expect(midway.rows[0]!.completed_at).toBeNull();

    await sink.finish(runId!, { status: 'succeeded', durationMs: 120, costUsd: 0.002 });

    const done = await pool.query<{ status: string; duration_ms: number; cost_usd: string }>(
      'select status, duration_ms, cost_usd from agent_runs where run_id = $1',
      [runId],
    );
    expect(done.rows[0]!.status).toBe('succeeded');
    expect(done.rows[0]!.duration_ms).toBe(120);
    expect(Number(done.rows[0]!.cost_usd)).toBeCloseTo(0.002, 5);
  }, 60_000);

  it('records a failure with its reason', async () => {
    const sink = postgresAgentRunSink(pool);
    const runId = await sink.begin({
      agentId: 'copywriter',
      agentVersion: '1.0',
      team: 'content',
      trigger: 'job',
    });
    await sink.finish(runId!, { status: 'failed', error: 'model unavailable', durationMs: 40 });

    const { rows } = await pool.query<{ status: string; error: string }>(
      'select status, error from agent_runs where run_id = $1',
      [runId],
    );
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.error).toBe('model unavailable');
  }, 60_000);

  it('attributes a real completion through the recording client', async () => {
    const client = recordingClient(pool, { complete: async () => ok }, {
      trigger: 'job',
      triggerRef: 'job-9',
    });
    await client.complete({ system: 's', messages: [], promptVersion: 'hooks.v1' });

    const { rows } = await pool.query<{ agent_id: string; team: string; status: string }>(
      'select agent_id, team, status from agent_runs',
    );
    expect(rows).toHaveLength(1);
    // Attributed from the prompt version alone — the agent's own code was never
    // touched to make this happen.
    expect(rows[0]!.agent_id).toBe('hook-generator');
    expect(rows[0]!.team).toBe('content');
    expect(rows[0]!.status).toBe('succeeded');
  }, 60_000);

  it('records an unregistered prompt version rather than losing the run', async () => {
    const client = recordingClient(pool, { complete: async () => ok }, { trigger: 'job' });
    await client.complete({ system: 's', messages: [], promptVersion: 'ghost.v1' });

    const { rows } = await pool.query<{ agent_id: string }>('select agent_id from agent_runs');
    expect(rows[0]!.agent_id).toBe('unregistered:ghost.v1');
  }, 60_000);
});

d('downstream consumption', () => {
  it('stamps a run once its output is actually used', async () => {
    /**
     * "Output produced but unused" is a named failure pattern and it cannot be
     * detected statically when the consumer reads a database row an hour later.
     * The consumer says so, or nothing knows.
     */
    const sink = postgresAgentRunSink(pool);
    const runId = await sink.begin({
      agentId: 'copywriter',
      agentVersion: '1.0',
      team: 'content',
      trigger: 'job',
      triggerRef: 'item-42',
    });
    await sink.finish(runId!, { status: 'succeeded', durationMs: 10 });

    const stamped = await markOutputConsumed(pool, {
      agentId: 'copywriter',
      triggerRef: 'item-42',
      consumer: 'content_items.body',
    });
    expect(stamped).toBe(1);

    const { rows } = await pool.query<{ downstream_consumer: string; at: string | null }>(
      'select downstream_consumer, downstream_consumed_at as at from agent_runs where run_id = $1',
      [runId],
    );
    expect(rows[0]!.downstream_consumer).toBe('content_items.body');
    expect(rows[0]!.at).not.toBeNull();
  }, 60_000);

  it('does not stamp a failed run as consumed', async () => {
    // Nothing downstream can have used output that was never produced.
    const sink = postgresAgentRunSink(pool);
    const runId = await sink.begin({
      agentId: 'copywriter',
      agentVersion: '1.0',
      team: 'content',
      trigger: 'job',
      triggerRef: 'item-43',
    });
    await sink.finish(runId!, { status: 'failed', error: 'nope', durationMs: 5 });

    const stamped = await markOutputConsumed(pool, {
      agentId: 'copywriter',
      triggerRef: 'item-43',
      consumer: 'content_items.body',
    });
    expect(stamped).toBe(0);
  }, 60_000);

  it('is idempotent, so a re-read does not double-count', async () => {
    const sink = postgresAgentRunSink(pool);
    const runId = await sink.begin({
      agentId: 'copywriter',
      agentVersion: '1.0',
      team: 'content',
      trigger: 'job',
      triggerRef: 'item-44',
    });
    await sink.finish(runId!, { status: 'succeeded', durationMs: 10 });

    expect(
      await markOutputConsumed(pool, {
        agentId: 'copywriter',
        triggerRef: 'item-44',
        consumer: 'a',
      }),
    ).toBe(1);
    expect(
      await markOutputConsumed(pool, {
        agentId: 'copywriter',
        triggerRef: 'item-44',
        consumer: 'b',
      }),
    ).toBe(0);
  }, 60_000);
});

d('the database refuses impossible records', () => {
  it('rejects a status outside the lifecycle', async () => {
    await expect(
      pool.query(
        `insert into agent_runs (agent_id, agent_version, team, trigger, status)
         values ('x','1','content','job','finished-ish')`,
      ),
    ).rejects.toThrow();
  }, 60_000);

  it('rejects a trigger it does not recognise', async () => {
    // An unknown trigger means the run cannot be traced back to what caused it.
    await expect(
      pool.query(
        `insert into agent_runs (agent_id, agent_version, team, trigger, status)
         values ('x','1','content','vibes','running')`,
      ),
    ).rejects.toThrow();
  }, 60_000);
});
