/*
 * P0 — the agent operating system.
 *
 * Three tables that together let Halyard prove what actually ran, rather than
 * describe what was built.
 *
 * ## What deliberately is NOT here
 *
 * **The registry itself.** `packages/core/src/agents/registry.ts` is the
 * canonical agent registry and it stays in code: it is versioned with the
 * implementation it describes, it is typed, and it cannot drift from the
 * codebase between deploys the way a table would. A registry table would need
 * syncing, and a sync that silently fails would produce exactly the phantom
 * this whole phase exists to eliminate.
 *
 * **A second job log.** `jobs` already records job execution. An agent run is a
 * narrower thing that happens *inside* a job — three agents run inside one
 * `generate` job — so `agent_runs` references the trigger rather than replacing
 * it.
 *
 * **A second capability concept.** `social_accounts.capability_state` and
 * `provider_capabilities` already exist and are untouched. They answer "can
 * this account post"; `capability_audit_state` answers "is this capability
 * actually wired". Different axes, deliberately separate tables.
 */

-- ── Agent execution records ────────────────────────────────────────────────
--
-- Every meaningful agent execution. Written by a wrapper at the LLM client
-- seam, which means an agent gains telemetry without its own code changing —
-- no call site was modified to make this table fill up.
create table if not exists agent_runs (
  run_id uuid primary key default gen_random_uuid(),

  -- The registry key. Deliberately NOT a foreign key: the registry lives in
  -- code, and a run recorded for an agent later removed from the registry is
  -- still true and still worth keeping.
  agent_id text not null,
  agent_version text not null,
  team text not null,

  /*
   * What caused this run.
   *
   * `job` covers the worker; `ui_action` covers a server action; `schedule`
   * covers the scheduler; `test` covers a run recorded during a test, which is
   * kept and marked rather than discarded so a test-only agent is visibly
   * test-only rather than looking exercised.
   */
  trigger text not null check (trigger in ('job', 'ui_action', 'schedule', 'test', 'manual', 'unknown')),
  trigger_ref text,

  -- References rather than payloads: prompts and drafts are large, and a run
  -- log that stores them becomes the largest table in the database within a
  -- week. The reference is enough to find the real thing.
  input_ref jsonb not null default '{}'::jsonb,
  output_ref jsonb not null default '{}'::jsonb,

  status text not null check (status in ('running', 'succeeded', 'failed', 'refused', 'skipped')),

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  retry_count integer not null default 0,
  error text,

  -- Cost, where the client reports it. Agent-level spend is otherwise
  -- impossible to attribute after the fact.
  cost_usd numeric(10, 6),

  /*
   * Proof the output was used.
   *
   * The architecture is explicit that an agent is not implemented until its
   * output is consumed. Producing output nobody reads is one of the named
   * failure patterns, and it cannot be detected statically when the consumer is
   * a database row — so the consumer stamps it here.
   */
  downstream_consumer text,
  downstream_consumed_at timestamptz,

  created_at timestamptz not null default now()
);

comment on table agent_runs is
  'One row per agent execution. Proves invocation, which no amount of static analysis can.';
comment on column agent_runs.downstream_consumed_at is
  'Stamped by whatever reads the output. Null means produced-but-unused, which is a tracked failure pattern.';

create index if not exists agent_runs_agent_idx on agent_runs (agent_id, started_at desc);
create index if not exists agent_runs_status_idx on agent_runs (status, started_at desc)
  where status in ('failed', 'refused');
create index if not exists agent_runs_unconsumed_idx on agent_runs (agent_id)
  where downstream_consumed_at is null and status = 'succeeded';

-- ── Capability state ───────────────────────────────────────────────────────
--
-- The Auditor's verdict, persisted so the UI reads a fact rather than
-- recomputing an opinion, and so a state *change* is detectable.
create table if not exists capability_audit_state (
  -- 'agent:copywriter', 'job:collect_signals', 'gate:coherence'
  capability_id text primary key,
  kind text not null check (kind in ('agent', 'job', 'gate', 'integration', 'feature')),

  state text not null check (state in (
    'implemented_exercised',
    'implemented_partial',
    'implemented_no_caller',
    'planned',
    'blocked',
    'regression'
  )),

  -- One sentence an operator can act on. A colour with no reason is the same
  -- failure as a gate with no measurement: it looks like information.
  reason text not null,

  -- The evidence the state was derived from, so a surprising state is arguable
  -- rather than merely asserted.
  evidence jsonb not null default '{}'::jsonb,

  -- What the contract *claimed*, when it differs from what was observed.
  -- Divergence is the interesting column on this table.
  declared_state text,

  determined_at timestamptz not null default now(),
  determined_by text not null default 'auditor',

  -- Kept so a transition can be noticed. Green to orange is an alert; orange to
  -- orange is noise, and a system that reports noise gets ignored.
  previous_state text,
  changed_at timestamptz
);

comment on table capability_audit_state is
  'What the Auditor observed, not what a document claims. Documentation alone can never write a green row here.';

create index if not exists capability_audit_state_kind_idx on capability_audit_state (kind, state);

-- ── Auditor runs and findings ──────────────────────────────────────────────
--
-- Named `auditor_*` rather than `audit_*` because `audit_log` already exists
-- and means something else entirely: operator actions on entities. Reusing that
-- prefix would put two unrelated concepts one tab-completion apart.
create table if not exists auditor_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,

  -- Counts, so the trend is queryable without re-reading every finding.
  findings_total integer not null default 0,
  findings_error integer not null default 0,
  findings_warning integer not null default 0,

  capabilities_audited integer not null default 0,
  -- Which commit produced this verdict, so a finding can be traced to code.
  git_sha text,
  triggered_by text not null default 'manual'
);

create table if not exists auditor_findings (
  id uuid primary key default gen_random_uuid(),
  auditor_run_id uuid not null references auditor_runs(id) on delete cascade,

  -- 'agent.no_caller', 'job.no_handler', 'output.unconsumed'
  rule text not null,
  severity text not null check (severity in ('error', 'warning', 'info')),

  -- What the finding is about: an agent id, a job kind, a file path.
  subject text not null,
  subject_kind text not null check (subject_kind in ('agent', 'job', 'gate', 'integration', 'feature', 'source')),

  detail text not null,
  evidence jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists auditor_findings_run_idx on auditor_findings (auditor_run_id, severity);
create index if not exists auditor_findings_rule_idx on auditor_findings (rule, created_at desc);

-- ── RLS, matching every other table in this database ───────────────────────
--
-- The established Halyard model, from 0010 and 0020, and reused rather than
-- reinvented:
--
--   * RLS enabled AND forced, so the owning role is subject to policy too.
--   * One `admin_all` policy per table, gated on `public.is_admin()`. The
--     policy is **not** scoped `to authenticated` — it applies to every role
--     that does not bypass RLS, which is what makes it a boundary rather than
--     a suggestion.
--   * `anon` and `authenticated` are revoked entirely. Halyard reaches its data
--     over a direct server-side connection, not through PostgREST, so neither
--     role needs any privilege on these tables.
--
-- The worker is unaffected: it connects as a role with `rolbypassrls`, which
-- bypasses RLS regardless of FORCE. That is verified in `agentRls.test.ts`
-- rather than assumed here.
--
-- An earlier draft of this migration used `for all to authenticated using
-- (true) with check (true)`, which would have handed every authenticated
-- Supabase user unrestricted read and write over the agent execution log. It
-- was invisible in local testing because a plain Postgres has no `authenticated`
-- role, so the guarded block that created it never ran.
alter table agent_runs enable row level security;
alter table agent_runs force row level security;
alter table capability_audit_state enable row level security;
alter table capability_audit_state force row level security;
alter table auditor_runs enable row level security;
alter table auditor_runs force row level security;
alter table auditor_findings enable row level security;
alter table auditor_findings force row level security;

-- Policies are created unconditionally. A policy does not depend on a role
-- existing, and guarding it on one is how a table ends up RLS-enabled with no
-- policy at all — which denies everyone, including the paths that should work,
-- and looks like a permissions bug rather than a missing migration.
do $$
declare
  t text;
begin
  foreach t in array array['agent_runs', 'capability_audit_state', 'auditor_runs', 'auditor_findings'] loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t and policyname = 'admin_all'
    ) then
      execute format(
        'create policy admin_all on public.%I for all
           using (public.is_admin()) with check (public.is_admin())', t);
    end if;
  end loop;
end $$;

-- Grants are role-specific, so these are guarded: the roles exist on Supabase
-- and not on a plain Postgres.
do $$
declare
  t text;
  r text;
begin
  foreach t in array array['agent_runs', 'capability_audit_state', 'auditor_runs', 'auditor_findings'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke all on public.%I from %I', t, r);
      end if;
    end loop;
  end loop;
end $$;
