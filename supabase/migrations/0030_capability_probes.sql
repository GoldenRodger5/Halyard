/*
 * P2 — provenance for platform capability.
 *
 * `provider_capabilities` already existed and already held the right thing: the
 * current believed capability per provider, as jsonb, with a `verified_at`. It
 * has never had a row, because the probe that fills it (`verify-provider`) was
 * a script an operator had to remember to run — the same missing-ignition shape
 * `explore_product` had before P1 gave it a trigger.
 *
 * What was missing is the answer to two questions this phase has to be able to
 * answer about any capability:
 *
 *   Why does Halyard believe this account can do X?
 *   When was that belief actually verified?
 *
 * ## Why a probe table rather than more columns
 *
 * A capability belief is derived from an *observation*, and the observation is
 * the thing worth keeping: a probe that ran and found nothing is as informative
 * as one that confirmed something, and a belief column alone cannot express
 * "checked, and it failed" distinctly from "never checked". That is exactly the
 * `unknown`-versus-`no` distinction the whole capability model rests on.
 *
 * This reuses P1's evidence/belief *pattern* — observations are append-only and
 * beliefs cite them — without reusing P1's tables, because a capability probe
 * is not a product fact and forcing it into `product_evidence` would give that
 * table two meanings.
 *
 * ## What deliberately is NOT here
 *
 * **No new capability vocabulary.** `outcome` describes what happened to the
 * *probe*, not what the capability is. The capability verdict is computed by
 * `resolveCapability` in code, from this plus account state, platform
 * constraints and policy — it is not a column, because a stored verdict would
 * be a fourth opinion able to drift from the three it reconciles.
 */

create table if not exists capability_probes (
  id uuid primary key default gen_random_uuid(),

  -- Which transport was probed. Text rather than an enum: providers come and go
  -- faster than migrations, and an unknown provider is still a real observation.
  provider text not null,

  /*
   * Scope. Null means the probe was provider-wide rather than about one
   * platform or one action — a connectivity check is a real probe with a real
   * outcome and nothing more specific to attach itself to.
   */
  platform text,
  action text,

  method text not null check (method in ('live_api', 'dry_run', 'manual')),

  /*
   * What happened to the probe, which is not the same as what the capability is.
   *
   *   confirmed   — the thing was observed working
   *   refuted     — the thing was observed failing, definitively
   *   unavailable — the probe could not run at all (no credential, provider down)
   *   error       — the probe ran and broke in a way that proves nothing
   *
   * `unavailable` and `error` must never be read as `refuted`. A probe that
   * could not run tells you nothing about the capability, and collapsing the
   * two is how a missing API key becomes a permanent "not supported".
   */
  outcome text not null check (outcome in ('confirmed', 'refuted', 'unavailable', 'error')),

  detail text not null,
  -- Whatever the probe actually saw, kept verbatim for the same reason
  -- product_evidence keeps page bodies: a conclusion you cannot re-check is an
  -- assertion with a timestamp.
  observed jsonb not null default '{}'::jsonb,

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,

  -- 'job' | 'cli' | 'test', so a probe recorded during a test is visibly a test
  -- probe rather than looking like production evidence.
  triggered_by text not null default 'job',
  job_id uuid
);

create index if not exists capability_probes_recent_idx
  on capability_probes (provider, platform, started_at desc);

comment on column capability_probes.outcome is
  'What happened to the probe, not what the capability is. unavailable/error never mean refuted — a probe that could not run proves nothing.';

/*
 * Provenance on the belief, pointing at the observation behind it.
 *
 * `verified_at` already existed and already meant the right thing. What it
 * could not say is *how* — a capability believed because a probe watched it and
 * one believed because somebody ran the script by hand are different strengths
 * of evidence, and the UI has to be able to tell an operator which it is.
 */
alter table provider_capabilities
  add column if not exists probe_id uuid references capability_probes(id) on delete set null;
alter table provider_capabilities
  add column if not exists method text
    check (method is null or method in ('live_api', 'dry_run', 'manual'));

comment on column provider_capabilities.probe_id is
  'The observation this belief rests on. Null only for rows written before probes were recorded.';

-- RLS, matching every other table here: enabled AND forced, one admin_all policy
-- gated on public.is_admin(), no privileges for anon or authenticated.
alter table capability_probes enable row level security;
alter table capability_probes force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'capability_probes' and policyname = 'admin_all'
  ) then
    execute 'create policy admin_all on public.capability_probes for all
               using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.capability_probes from %I', r);
    end if;
  end loop;
end $$;
