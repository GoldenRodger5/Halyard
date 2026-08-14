/*
 * The feature inventory — Phase 3 of the agentic plan, verification first.
 *
 * The system's entire model of the product it markets is `products.brief_markdown`,
 * a document a human wrote. It cannot discover a feature nobody mentioned, and
 * it cannot notice one that changed.
 *
 * The unit here is deliberately **not** "a feature". It is a claim plus a way
 * to re-perform it. A list of features a model believed it saw would become the
 * ground truth every prompt draws on, and nothing downstream would ever
 * question it — an inventory nobody can check is worse than no inventory,
 * because it reads as knowledge.
 *
 * So every row carries `replay`: the steps that demonstrate the feature and the
 * things that must be observable when they run. `status` is decided by running
 * them, never by asserting them.
 */
create table if not exists feature_claims (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,

  -- What is being claimed, in words a person would use.
  name text not null,
  summary text not null,

  -- Where the claim came from. Kept because a claim from the brief and a claim
  -- from a crawl deserve different scepticism even at the same status.
  source text not null check (source in ('crawl', 'code', 'connector', 'brief', 'operator')),

  /*
   * The replayable demonstration: { steps: [...], } in the Explorer's step
   * vocabulary. Checked against `checkFlowSafety` before it is ever run — the
   * model proposes and code decides, because no prompt instruction is a control
   * when the other side of the click is a real account.
   */
  replay jsonb not null,

  -- What was observed when the claim was first made, for a human reading it later.
  evidence jsonb not null default '{}'::jsonb,

  /*
   * `unverifiable` is a real and distinct outcome, not a soft failure. A flow
   * that ran cleanly and asserted nothing confirms nothing, and calling that
   * `verified` is the most likely way this system starts lying.
   */
  status text not null default 'unverified'
    check (status in ('unverified', 'verified', 'refuted', 'unverifiable')),

  verified_at timestamptz,
  last_attempt_at timestamptz,
  attempts integer not null default 0,
  last_verdict text,

  -- Wall clock of the last successful replay. A feature that got ten times
  -- slower is a finding, not a pass.
  last_elapsed_ms integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One claim per named feature per product; re-discovery updates rather than
  -- accumulating near-duplicates that all look like separate evidence.
  unique (product_id, name)
);

comment on table feature_claims is
  'What the product can actually do, each entry carrying the steps that prove it. Never trusted without a replay.';
comment on column feature_claims.replay is
  'Steps and expectations in the Explorer vocabulary. Passed through checkFlowSafety before running.';
comment on column feature_claims.status is
  'unverifiable means the flow ran and asserted nothing — distinct from unverified, which means it has not run.';

create index if not exists feature_claims_verify_idx
  on feature_claims (product_id, status, verified_at nulls first);

alter table feature_claims enable row level security;
alter table feature_claims force row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'create policy feature_claims_admin on feature_claims for all to authenticated using (true) with check (true)';
    execute 'grant select, insert, update, delete on feature_claims to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on feature_claims from anon';
  end if;
end $$;
