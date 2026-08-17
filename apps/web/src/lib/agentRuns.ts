/**
 * Agent run recording, web side.
 *
 * Four agents are reachable only from the web tier — the co-pilot, the reply
 * drafter, the find drafter and the setup kit writer — plus the whole daily
 * take loop. Without this they would look permanently un-invoked, and the
 * Auditor would report five false orphans, which is a worse outcome than no
 * telemetry at all: a truth machine that lies in a knowable direction trains
 * people to discount it.
 */
import {
  recordingLlmClient,
  type AgentRunFinish,
  type AgentRunSink,
  type AgentRunStart,
  type LlmClient,
  type RunTrigger,
} from '@halyard/core';
import { query } from '@/lib/db';

export function agentRunSink(): AgentRunSink {
  return {
    async begin(start: AgentRunStart): Promise<string | null> {
      const rows = await query<{ run_id: string }>(
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
      await query(
        `update agent_runs
            set status = $2, output_ref = $3, error = $4, cost_usd = $5,
                duration_ms = $6, completed_at = now()
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

/** Wrap a client so the agents behind a server action are recorded. */
export function recordingClient(
  inner: LlmClient,
  context: { trigger: RunTrigger; triggerRef?: string | null },
): LlmClient {
  return recordingLlmClient(inner, agentRunSink(), context);
}
