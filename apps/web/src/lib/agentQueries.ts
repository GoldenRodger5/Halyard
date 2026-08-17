/**
 * Read models for the Agents and System surfaces.
 *
 * Every one of these reads a real table. The P0 brief is explicit that no
 * screen may be a placeholder, and the stricter version of that rule is the one
 * applied here: a screen shows what the database contains, including when the
 * database contains nothing. An empty runs table renders as "no agent has ever
 * run", which is the single most important fact this system currently has to
 * report.
 */
import { AGENT_REGISTRY, rollUp, type AgentContract, type CapabilityAuditState } from '@halyard/core';
import { query } from '@/lib/db';

export interface AgentRunRow {
  run_id: string;
  agent_id: string;
  agent_version: string;
  team: string;
  trigger: string;
  trigger_ref: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
  cost_usd: string | null;
  downstream_consumer: string | null;
  downstream_consumed_at: string | null;
}

export interface CapabilityRow {
  capability_id: string;
  kind: string;
  state: CapabilityAuditState;
  reason: string;
  declared_state: CapabilityAuditState | null;
  determined_at: string;
  previous_state: CapabilityAuditState | null;
  changed_at: string | null;
}

/**
 * The registry joined to whatever the Auditor last observed.
 *
 * The registry is the left side because it is the source of truth for *what
 * exists*; the observed state is a join because it may be absent. An agent with
 * no audited state shows as unaudited rather than as healthy — the absence of a
 * verdict is not a pass.
 */
export interface AgentOverviewRow {
  contract: AgentContract;
  observed: CapabilityRow | null;
  runs: number;
  lastRunAt: string | null;
  failures: number;
}

export async function getAgentOverview(): Promise<AgentOverviewRow[]> {
  const [states, stats] = await Promise.all([
    query<CapabilityRow>(
      `select capability_id, kind, state, reason, declared_state, determined_at,
              previous_state, changed_at
         from capability_audit_state where kind = 'agent'`,
    ),
    query<{ agent_id: string; runs: string; failures: string; last_run: string | null }>(
      `select agent_id,
              count(*) as runs,
              count(*) filter (where status in ('failed','refused')) as failures,
              max(started_at) as last_run
         from agent_runs group by agent_id`,
    ),
  ]);

  const stateById = new Map(states.map((s) => [s.capability_id.replace(/^agent:/, ''), s]));
  const statById = new Map(stats.map((s) => [s.agent_id, s]));

  return AGENT_REGISTRY.map((contract) => {
    const stat = statById.get(contract.agentId);
    return {
      contract,
      observed: stateById.get(contract.agentId) ?? null,
      runs: Number(stat?.runs ?? 0),
      failures: Number(stat?.failures ?? 0),
      lastRunAt: stat?.last_run ?? null,
    };
  });
}

export async function getAgentRuns(limit = 100): Promise<AgentRunRow[]> {
  return query<AgentRunRow>(
    `select run_id, agent_id, agent_version, team, trigger, trigger_ref, status,
            started_at, completed_at, duration_ms, error, cost_usd,
            downstream_consumer, downstream_consumed_at
       from agent_runs
      order by started_at desc
      limit $1`,
    [limit],
  );
}

export async function getAgentRunsFor(agentId: string, limit = 50): Promise<AgentRunRow[]> {
  return query<AgentRunRow>(
    `select run_id, agent_id, agent_version, team, trigger, trigger_ref, status,
            started_at, completed_at, duration_ms, error, cost_usd,
            downstream_consumer, downstream_consumed_at
       from agent_runs where agent_id = $1
      order by started_at desc limit $2`,
    [agentId, limit],
  );
}

export interface TeamRow {
  team: string;
  agents: AgentOverviewRow[];
  state: CapabilityAuditState;
}

/** Teams, rolled up to their worst member rather than their average. */
export async function getTeams(): Promise<TeamRow[]> {
  const overview = await getAgentOverview();
  const byTeam = new Map<string, AgentOverviewRow[]>();
  for (const row of overview) {
    byTeam.set(row.contract.team, [...(byTeam.get(row.contract.team) ?? []), row]);
  }

  return [...byTeam.entries()]
    .map(([team, agents]) => ({
      team,
      agents,
      state: rollUp(agents.map((a) => a.observed?.state ?? a.contract.declaredStatus)),
    }))
    .sort((a, b) => a.team.localeCompare(b.team));
}

/**
 * Versions the registry declares, against versions actually seen running.
 *
 * A version deployed and never invoked means the code shipped and the path
 * reaching it did not — invisible without this comparison, because the deploy
 * succeeded and the tests passed.
 */
export interface VersionRow {
  agentId: string;
  declared: string;
  seen: string[];
  neverInvoked: boolean;
}

export async function getVersions(): Promise<VersionRow[]> {
  const seen = await query<{ agent_id: string; agent_version: string; runs: string }>(
    `select agent_id, agent_version, count(*) as runs
       from agent_runs group by agent_id, agent_version order by agent_id`,
  );

  const byAgent = new Map<string, string[]>();
  for (const row of seen) {
    byAgent.set(row.agent_id, [...(byAgent.get(row.agent_id) ?? []), row.agent_version]);
  }

  return AGENT_REGISTRY.map((contract) => {
    const versions = byAgent.get(contract.agentId) ?? [];
    return {
      agentId: contract.agentId,
      declared: contract.version,
      seen: versions,
      // Only meaningful once something has run: an agent with no runs at all is
      // reported by the overview, not here.
      neverInvoked: versions.length > 0 && !versions.includes(contract.version),
    };
  });
}

// ── System health ──────────────────────────────────────────────────────────

export type HealthState = 'ok' | 'warn' | 'down' | 'unknown';

export interface HealthCheck {
  id: string;
  label: string;
  state: HealthState;
  /** The measured value, so the state is arguable rather than asserted. */
  detail: string;
}

/**
 * The health foundation.
 *
 * Deliberately small and deliberately honest: `unknown` is a first-class state,
 * because a check that cannot run must not report `ok`. That is the same rule
 * the quality gates follow, applied to infrastructure.
 */
export async function getSystemHealth(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  // Database — if this throws, nothing below runs and the page shows the error.
  const dbStart = Date.now();
  await query('select 1');
  const dbMs = Date.now() - dbStart;
  checks.push({
    id: 'database',
    label: 'Database',
    state: dbMs < 500 ? 'ok' : 'warn',
    detail: `responded in ${dbMs} ms`,
  });

  const workers = await query<{ worker_id: string; seconds_ago: string }>(
    `select worker_id, extract(epoch from (now() - last_seen_at)) as seconds_ago
       from worker_heartbeats order by last_seen_at desc`,
  );
  const freshest = workers[0] ? Number(workers[0].seconds_ago) : null;
  checks.push({
    id: 'worker',
    label: 'Worker',
    state: freshest === null ? 'unknown' : freshest < 120 ? 'ok' : freshest < 600 ? 'warn' : 'down',
    detail:
      freshest === null
        ? 'no worker has ever sent a heartbeat'
        : `${workers.length} worker(s), last seen ${Math.round(freshest)}s ago`,
  });

  const queueRows = await query<{ status: string; n: string; oldest: string | null }>(
    `select status, count(*) as n, min(created_at) as oldest
       from jobs where status in ('queued','running','dead') group by status`,
  );
  const queued = Number(queueRows.find((r) => r.status === 'queued')?.n ?? 0);
  const dead = Number(queueRows.find((r) => r.status === 'dead')?.n ?? 0);
  checks.push({
    id: 'queue',
    label: 'Queue',
    state: dead > 0 ? 'warn' : queued > 200 ? 'warn' : 'ok',
    detail: `${queued} queued, ${dead} dead-lettered`,
  });

  const recent = await query<{ done: string; failed: string }>(
    `select count(*) filter (where status = 'done') as done,
            count(*) filter (where status = 'failed') as failed
       from jobs where finished_at > now() - interval '24 hours'`,
  );
  const done = Number(recent[0]?.done ?? 0);
  const failed = Number(recent[0]?.failed ?? 0);
  checks.push({
    id: 'jobs',
    label: 'Jobs (24h)',
    state: done === 0 ? 'unknown' : failed > done / 4 ? 'warn' : 'ok',
    detail: done === 0 ? 'no job finished in the last 24 hours' : `${done} done, ${failed} failed`,
  });

  const accounts = await query<{ capability_state: string; n: string }>(
    `select capability_state, count(*) as n from social_accounts group by capability_state`,
  );
  const live = Number(accounts.find((a) => a.capability_state === 'live')?.n ?? 0);
  const total = accounts.reduce((sum, a) => sum + Number(a.n), 0);
  checks.push({
    id: 'integrations',
    label: 'Integrations',
    state: total === 0 ? 'unknown' : live === 0 ? 'warn' : 'ok',
    detail: total === 0 ? 'no account connected' : `${live} of ${total} account(s) live`,
  });

  const agentRuns = await query<{ n: string }>('select count(*) as n from agent_runs');
  const runs = Number(agentRuns[0]?.n ?? 0);
  checks.push({
    id: 'agents',
    label: 'Agents',
    state: runs === 0 ? 'unknown' : 'ok',
    // The most important fact this system currently reports.
    detail: runs === 0 ? 'no agent has ever run' : `${runs} recorded execution(s)`,
  });

  return checks;
}

// ── Auditor ────────────────────────────────────────────────────────────────

export interface AuditorRunRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  findings_total: number;
  findings_error: number;
  findings_warning: number;
  capabilities_audited: number;
  git_sha: string | null;
  triggered_by: string;
}

export interface AuditorFindingRow {
  id: string;
  rule: string;
  severity: string;
  subject: string;
  subject_kind: string;
  detail: string;
  evidence: Record<string, unknown>;
}

export async function getLatestAudit(): Promise<{
  run: AuditorRunRow | null;
  findings: AuditorFindingRow[];
}> {
  const runs = await query<AuditorRunRow>(
    `select id, started_at, completed_at, duration_ms, findings_total, findings_error,
            findings_warning, capabilities_audited, git_sha, triggered_by
       from auditor_runs order by started_at desc limit 1`,
  );
  const run = runs[0] ?? null;
  if (!run) return { run: null, findings: [] };

  const findings = await query<AuditorFindingRow>(
    `select id, rule, severity, subject, subject_kind, detail, evidence
       from auditor_findings where auditor_run_id = $1
      order by case severity when 'error' then 0 when 'warning' then 1 else 2 end, rule`,
    [run.id],
  );
  return { run, findings };
}

/** Job kinds against handlers and schedules, read for the System → Jobs screen. */
export interface JobKindRow {
  kind: string;
  scheduled: boolean;
  runs24h: number;
  failed24h: number;
  lastRunAt: string | null;
}

export async function getJobKinds(): Promise<JobKindRow[]> {
  const rows = await query<{
    kind: string;
    runs: string;
    failed: string;
    last_run: string | null;
  }>(
    `select kind,
            count(*) filter (where finished_at > now() - interval '24 hours') as runs,
            count(*) filter (where status = 'failed' and finished_at > now() - interval '24 hours') as failed,
            max(finished_at) as last_run
       from jobs group by kind order by kind`,
  );

  return rows.map((r) => ({
    kind: r.kind,
    scheduled: false,
    runs24h: Number(r.runs),
    failed24h: Number(r.failed),
    lastRunAt: r.last_run,
  }));
}
