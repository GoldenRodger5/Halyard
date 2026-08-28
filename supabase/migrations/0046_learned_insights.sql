-- §204. What the account taught us, and how much to trust it.
--
-- Halyard had a `learning` team containing one agent, and that agent clustered
-- *operator rejections* — what a human disliked before publication. Useful, and
-- not the same as learning what an audience did afterwards. Nothing read
-- `post_metrics` and turned it into a belief, so every creative decision was
-- made from priors that no result could revise.
--
-- The columns exist to keep a belief auditable rather than merely stored. A row
-- here is not "feature_demo is good"; it is a cohort mean, a baseline mean, the
-- ids on both sides, the window they came from, and a confidence derived from
-- sample size and effect together. Anyone can recompute it.
create table if not exists learned_insights (
  id uuid primary key default gen_random_uuid(),

  -- Global, platform, or account. Account-specific evidence should outweigh a
  -- generic assumption once it has the sample to justify it.
  scope text not null check (scope in ('global', 'platform', 'account')),
  platform text,
  account_id uuid references social_accounts(id) on delete cascade,
  product_id text references products(id) on delete cascade,

  -- The decision this belief is about, and which value of it.
  feature text not null,
  feature_value text not null,

  -- The arithmetic, kept so the sentence can be checked against it.
  cohort_mean numeric not null,
  baseline_mean numeric not null,
  lift numeric not null,
  sample_size integer not null,
  baseline_size integer not null,

  -- observed → inferred → validated. A single good post is `observed`, which is
  -- what it is; `validated` requires the pattern to survive a second window.
  status text not null check (status in ('observed', 'inferred', 'validated')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  corroborations integer not null default 1,

  -- Both sides. Contradicting evidence is stored, never tidied away: a belief
  -- whose disagreements are invisible cannot be distrusted by a later reader.
  supporting_content_ids uuid[] not null default '{}',
  contradicting_content_ids uuid[] not null default '{}',
  evidence_window_start timestamptz,
  evidence_window_end timestamptz,

  observation text not null,
  recommendation text not null,

  -- §9 of the specification: knowledge decays. Past this, a belief wants
  -- recomputing rather than trusting, and `actionableInsights` withholds it.
  review_after timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live belief per (scope, where, feature, value). Reconciliation updates the
-- row in place — that is what makes contradiction visible as a falling
-- confidence rather than as a second row nobody compares to the first.
create unique index if not exists learned_insights_unique_idx
  on learned_insights (
    scope,
    coalesce(platform, ''),
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    feature,
    feature_value
  );

create index if not exists learned_insights_actionable_idx
  on learned_insights (scope, feature, status, review_after desc);

comment on table learned_insights is
  'Beliefs derived from measured performance. Recomputable from the recorded cohorts; never written by a model.';
comment on column learned_insights.confidence is
  'Sample size and effect size multiplied. Deliberately not a p-value — calling it one would imply a test that was not run.';
comment on column learned_insights.contradicting_content_ids is
  'The comparison cohort, and after a reversal the earlier supporting set. Kept so a weakened belief shows its disagreement.';

-- The job that computes them. Gotcha 1: this list and JOB_KINDS in
-- packages/db/src/index.ts are the same list written twice, and only
-- handlerCoverage.test.ts notices when they disagree.
alter table jobs drop constraint if exists jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind = any (array[
  'generate', 'render', 'tts', 'capture', 'publish', 'collect_metrics',
  'collect_signals', 'collect_comments', 'collect_attribution', 'refresh_tokens',
  'score_performance', 'digest_email', 'reconcile_schedule', 'mark_stale_assets',
  'collect_app_store', 'detect_release', 'collect_watch_terms', 'draft_newsletter',
  'send_newsletter', 'collect_reviews', 'review_media', 'verify_feature',
  'explore_product', 'cluster_rejections', 'purge_logs',
  'collect_product_evidence', 'build_product_brain', 'verify_provider_capability',
  'correct_content',
  -- §204
  'learn_from_performance'
]));

-- RLS, matching every other table here: enabled AND forced, one admin_all policy
-- gated on public.is_admin(), no privileges for anon or authenticated.
--
-- Caught by `schema.test.ts`, which asserts the invariant across every table
-- rather than trusting each migration to remember. A learned belief carries the
-- ids of real content and the account it belongs to; it is exactly as sensitive
-- as the rows it was computed from.
alter table learned_insights enable row level security;
alter table learned_insights force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'learned_insights' and policyname = 'admin_all'
  ) then
    execute 'create policy admin_all on public.learned_insights for all
               using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.learned_insights from %I', r);
    end if;
  end loop;
end $$;
