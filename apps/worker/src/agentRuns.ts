/**
 * The Postgres sink for agent execution records.
 *
 * Thin on purpose. All the judgement lives in `core/agents/recorder.ts`; this
 * is the part that knows about a connection pool.
 */
import type pg from 'pg';
import {
  recordingLlmClient,
  type AgentRunFinish,
  type AgentRunSink,
  type AgentRunStart,
  type LlmClient,
  type RunTrigger,
} from '@halyard/core';

export function postgresAgentRunSink(pool: pg.Pool): AgentRunSink {
  return {
    async begin(start: AgentRunStart): Promise<string | null> {
      const { rows } = await pool.query<{ run_id: string }>(
        `insert into agent_runs
           (agent_id, agent_version, team, trigger, trigger_ref, input_ref, status)
         values ($1, $2, $3, $4, $5, $6, 'running')
         returning run_id`,
        [
          start.agentId,
          start.agentVersion,
          start.team,
          start.trigger,
          start.triggerRef ?? null,
          JSON.stringify(start.inputRef ?? {}),
        ],
      );
      return rows[0]?.run_id ?? null;
    },

    async finish(runId: string, finish: AgentRunFinish): Promise<void> {
      await pool.query(
        `update agent_runs
            set status = $2,
                output_ref = $3,
                error = $4,
                cost_usd = $5,
                duration_ms = $6,
                completed_at = now()
          where run_id = $1`,
        [
          runId,
          finish.status,
          JSON.stringify(finish.outputRef ?? {}),
          finish.error ?? null,
          finish.costUsd ?? null,
          finish.durationMs,
        ],
      );
    },
  };
}

/**
 * Stamp a run as having had its output actually used.
 *
 * The architecture treats "output produced but unused" as a named failure
 * pattern, and it is one static analysis cannot see: when the consumer is a
 * database row read by another job an hour later, the only way to know is for
 * that consumer to say so.
 *
 * Keyed by trigger reference rather than run id because the consumer usually
 * knows the content item, not the run — the copy on the queue screen was
 * produced by *some* copywriter run, and which one is the recorder's problem.
 */
export async function markOutputConsumed(
  pool: pg.Pool,
  input: { agentId: string; triggerRef: string; consumer: string },
): Promise<number> {
  const { rowCount } = await pool.query(
    `update agent_runs
        set downstream_consumer = $3,
            downstream_consumed_at = now()
      where agent_id = $1
        and trigger_ref = $2
        and status = 'succeeded'
        and downstream_consumed_at is null`,
    [input.agentId, input.triggerRef, input.consumer],
  );
  return rowCount ?? 0;
}

/**
 * An LLM client that records every agent execution it carries.
 *
 * Used at each place the worker builds a client. Wrapping here rather than
 * inside `createLlmClient` is deliberate: the recorder needs a pool and a
 * trigger, and `core` has neither — pushing the pool into core to avoid two
 * call sites would invert the dependency the whole package layout rests on.
 */
export function recordingClient(
  pool: pg.Pool,
  inner: LlmClient,
  context: { trigger: RunTrigger; triggerRef?: string | null },
): LlmClient {
  return recordingLlmClient(inner, postgresAgentRunSink(pool), context);
}
