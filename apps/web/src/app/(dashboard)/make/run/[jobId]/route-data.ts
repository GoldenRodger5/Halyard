/**
 * §356. What a run looks like from outside, while it is running.
 *
 * Read in one place so the page and the polling endpoint cannot disagree about
 * what a run *is* — which they would, being written separately and asked the
 * same question.
 */
import { query } from '@/lib/db';

export interface RunEvent {
  id: number;
  message: string;
  detail: Record<string, unknown> | null;
  at: string;
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
  agents: RunAgent[];
  /** Set once the run produced something an operator can look at. */
  contentItemId: string | null;
  /** True while there is any reason to keep polling. */
  live: boolean;
}

export async function loadRun(jobId: string): Promise<RunView | null> {
  const jobs = await query<{
    id: string;
    kind: string;
    status: string;
    attempts: number;
    last_error: string | null;
  }>('select id, kind, status, attempts, last_error from jobs where id = $1', [jobId]);
  const job = jobs[0];
  if (!job) return null;

  const events = await query<{
    id: number;
    message: string;
    detail: Record<string, unknown> | null;
    at: string;
  }>('select id, message, detail, at from job_events where job_id = $1 order by id', [jobId]);

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

  /*
   * The piece this run produced, found through the events rather than a column:
   * a job does not know what it made, and the handler already logs the id.
   */
  const contentItemId =
    events
      .map((event) => event.detail?.contentItemId)
      .filter((id): id is string => typeof id === 'string')
      .at(-1) ?? null;

  return {
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts,
    lastError: job.last_error,
    events: events.map((e) => ({ id: e.id, message: e.message, detail: e.detail, at: e.at })),
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
  };
}
