/**
 * §494. Every paid call lands in the ledger, in the same table as model calls.
 *
 * `agent_runs.cost_usd` was the only record of spend, and it only saw the
 * LLM clients — images, the frame describer, the critic and the voice were
 * paid for and written nowhere. The operator learned the real number from a
 * billing page: twenty dollars in twelve hours against a recorded $2.29.
 *
 * One table rather than a second one, because the question is always the
 * same — *what did this piece cost, what did today cost* — and a sum over
 * one column answers it. The row is a completed run of a named agent
 * (`image-generator`, `vision-describer`, `creative-critic`,
 * `voice-synthesis`) with the units in `output_ref`, so a reader can tell
 * "$0.06 for one medium image" from "$0.06 for eleven thousand tokens".
 */
import type pg from 'pg';

export interface PaidCall {
  agentId: string;
  team?: string;
  /** The job that paid, so `content_item_costs` can attribute it to a piece. */
  jobId: string | undefined;
  model: string;
  costUsd: number;
  /** What was bought: images, tokens, characters. Free-form and small. */
  units: Record<string, number | string>;
  /** True when the price is a list-price estimate rather than a billed figure. */
  estimate?: boolean;
}

export async function recordPaidCall(pool: pg.Pool, call: PaidCall): Promise<void> {
  await pool
    .query(
      `insert into agent_runs
         (agent_id, agent_version, team, trigger, trigger_ref, input_ref, output_ref,
          status, cost_usd, started_at, completed_at, duration_ms)
       values ($1, 'paid-call', $2, 'job', $3, '{}'::jsonb, $4::jsonb,
               'succeeded', $5, now(), now(), 0)`,
      [
        call.agentId,
        call.team ?? 'content',
        call.jobId ?? null,
        JSON.stringify({ model: call.model, ...call.units, ...(call.estimate ? { estimate: true } : {}) }),
        Number(call.costUsd.toFixed(6)),
      ],
    )
    /* The ledger must never fail the work it records. It is logged by the caller. */
    .catch(() => undefined);
}

/** Today's paid calls in USD, for the budget guard and the home page. */
export async function spentTodayUsd(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ usd: string | null }>(
    `select sum(cost_usd)::text as usd from agent_runs
      where started_at >= date_trunc('day', now()) and cost_usd is not null`,
  );
  return Number(rows[0]?.usd ?? 0);
}
