/**
 * §356. What a run looks like from outside, while it is running.
 *
 * Read in one place so the page and the polling endpoint cannot disagree about
 * what a run *is* — which they would, being written separately and asked the
 * same question.
 */
import { agentsForStage, explainPiece, hasAccount, type PieceAccount } from '@halyard/core';
import { query } from '@/lib/db';

/** The bucket unattributed events land in. Named, never dropped — see §367. */
const UNATTRIBUTED_KEY = 'run';

export interface RunEvent {
  id: number;
  message: string;
  detail: Record<string, unknown> | null;
  at: string;
  /** §367. The production stage this came from, or null for the run itself. */
  stage: string | null;
}

/**
 * §367. One stage of a run, with everything it said.
 *
 * The feed was chronological because a log line had no author, so an operator
 * could read what happened and never see *who* — which is the thing they asked
 * to watch. Stages are grouped rather than filtered: an event's position in the
 * run still matters, so a lane keeps its own order and the lanes keep theirs.
 */
export interface RunStage {
  stage: string;
  /** The agent this lane is labelled with, from `STAGE_AGENTS`. */
  owner: string;
  /** Everyone else who contributes, in the order they act. */
  alongside: string[];
  team: string;
  doing: string;
  events: RunEvent[];
  /** Wall-clock across this stage's own events. Null when it said one thing. */
  spanMs: number | null;
}

export interface RunAgent {
  agentId: string;
  status: string;
  durationMs: number | null;
  costUsd: number | null;
  at: string;
}

export interface RunView {
  jobId: string;
  kind: string;
  status: string;
  attempts: number;
  lastError: string | null;
  events: RunEvent[];
  /** §367. The same events, grouped into the lanes that produced them. */
  stages: RunStage[];
  agents: RunAgent[];
  /** Set once the run produced something an operator can look at. */
  contentItemId: string | null;
  /** True while there is any reason to keep polling. */
  live: boolean;
  /**
   * §369. Why the piece is the way it is, assembled from the decisions that
   * were actually recorded. Null when the run has not recorded enough to say.
   */
  account: PieceAccount | null;
}

export async function loadRun(jobId: string): Promise<RunView | null> {
  const jobs = await query<{
    id: string;
    kind: string;
    status: string;
    attempts: number;
    last_error: string | null;
    payload: Record<string, unknown> | null;
  }>('select id, kind, status, attempts, last_error, payload from jobs where id = $1', [jobId]);
  const job = jobs[0];
  if (!job) return null;
  const jobPayload = job.payload;

  const events = await query<{
    id: number;
    message: string;
    detail: Record<string, unknown> | null;
    at: string;
    stage: string | null;
  }>('select id, message, detail, at, stage from job_events where job_id = $1 order by id', [
    jobId,
  ]);

  /*
   * Agent runs are matched on `trigger_ref`, which `recordingClient` sets to
   * the job id. A run with no agents is normal — a deterministic job calls no
   * models — and shows as an empty lane rather than an error.
   */
  const agents = await query<{
    agent_id: string;
    status: string;
    duration_ms: number | null;
    cost_usd: string | null;
    created_at: string;
  }>(
    `select agent_id, status, duration_ms, cost_usd, created_at
       from agent_runs where trigger_ref = $1 order by created_at`,
    [jobId],
  );

  const mapped: RunEvent[] = events.map((e) => ({
    id: e.id,
    message: e.message,
    detail: e.detail,
    at: e.at,
    stage: e.stage,
  }));

  /*
   * The piece this run produced, found through the events rather than a column:
   * a job does not know what it made, and the handler already logs the id.
   */
  const contentItemId =
    mapped
      .map((event) => event.detail?.contentItemId)
      .filter((id): id is string => typeof id === 'string')
      .at(-1) ?? null;

  /*
   * Lanes, in the order the stages first spoke rather than in `STAGE_ORDER`.
   *
   * A production skips stages, and a skipped stage that appeared in the list
   * anyway would read as one that ran and said nothing. Ordering by first
   * appearance also shows the run as it actually happened, which is the point
   * of watching it — if research ran after writing, the operator should see
   * that rather than a diagram of how it was supposed to go.
   */
  const byStage = new Map<string, RunEvent[]>();
  for (const event of mapped) {
    const key = event.stage ?? UNATTRIBUTED_KEY;
    const bucket = byStage.get(key);
    if (bucket) bucket.push(event);
    else byStage.set(key, [event]);
  }

  const stages: RunStage[] = [...byStage.entries()].map(([stage, laneEvents]) => {
    const agents = agentsForStage(stage);
    const first = new Date(laneEvents[0]!.at).getTime();
    const last = new Date(laneEvents[laneEvents.length - 1]!.at).getTime();
    return {
      stage,
      owner: agents.owner,
      alongside: agents.alongside,
      team: agents.team,
      doing: agents.doing,
      events: laneEvents,
      spanMs: laneEvents.length > 1 ? last - first : null,
    };
  });

  /*
   * §369. Built from the record rather than written by a model. Every director
   * logs its own reason, so the account is a reading of what happened — it has
   * no way to produce a sentence nobody wrote.
   */
  const overrides = jobPayload?.options ?? null;
  const built = explainPiece({
    events: mapped.map((e) => ({ message: e.message, detail: e.detail, stage: e.stage, at: e.at })),
    overrides: overrides as Record<string, string> | null,
  });
  const account = hasAccount(built) ? built : null;

  return {
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts,
    lastError: job.last_error,
    events: mapped,
    stages,
    agents: agents.map((a) => ({
      agentId: a.agent_id,
      status: a.status,
      durationMs: a.duration_ms,
      costUsd: a.cost_usd === null ? null : Number(a.cost_usd),
      at: a.created_at,
    })),
    contentItemId,
    /* Queued and running are live; done, dead and cancelled are not. */
    live: job.status === 'queued' || job.status === 'running',
    account,
  };
}
