-- §208, §209. Account intelligence and social recommendations.
--
-- Two tables, and the split between them is the point. An `account_intelligence`
-- row is Halyard looking at *itself* — the mix of what this account has
-- published and where that mix has gone wrong. A `social_recommendations` row is
-- Halyard looking *outward* at someone else, which is a claim about a third
-- party and is held to a higher standard: it cannot exist without evidence.

create table if not exists account_intelligence (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references social_accounts(id) on delete cascade,
  product_id text references products(id) on delete cascade,
  observed_at timestamptz not null default now(),

  -- How many published posts the snapshot was computed over. A snapshot over
  -- three posts is not a weak signal about the mix; it is not one.
  window_size integer not null,

  -- The distribution, by dimension and value. Recomputable from content_items,
  -- stored so a later reader can see what the mix looked like *then* rather
  -- than what it looks like now.
  slices jsonb not null default '[]',
  findings jsonb not null default '[]',
  gaps jsonb not null default '{}',
  exploration_share numeric,
  summary text not null,

  created_at timestamptz not null default now()
);

create index if not exists account_intelligence_recent_idx
  on account_intelligence (account_id, observed_at desc);

comment on table account_intelligence is
  'A snapshot of one account''s own content mix. Recomputable from content_items; stored so the mix at a past decision is visible.';

create table if not exists social_recommendations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references social_accounts(id) on delete cascade,
  product_id text references products(id) on delete cascade,
  platform text not null,

  subject text not null,
  subject_type text not null check (subject_type in
    ('creator','brand','community','publication','topic','conversation','question')),

  -- Every kind is something a *person* does in their own client. There is no
  -- follow_now, no reply, no dm, and none may be added: §3.2 and §8 of the
  -- specification both state that intelligence does not imply engagement
  -- automation, and `assertNoAutonomousAction` makes adding one a test failure.
  kind text not null check (kind in
    ('study','follow','investigate','collaborate','reference','respond','monitor','ignore')),

  relevance numeric not null check (relevance >= 0 and relevance <= 1),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  rationale text not null,

  -- Not nullable and not defaulted. A recommendation about a third party with
  -- no evidence is not a weak claim, it is not a claim, and the database
  -- refuses it rather than leaving that to the ranker.
  evidence jsonb not null,

  -- Recommendations decay like every other discovery item (§206).
  observed_at timestamptz not null default now(),
  expires_at timestamptz,

  -- The operator's disposition. Nothing acts on this; it exists so the same
  -- candidate is not re-surfaced every run.
  status text not null default 'proposed'
    check (status in ('proposed','accepted','dismissed','done')),
  decided_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint social_recommendations_evidence_present
    check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0)
);

-- One live recommendation per subject per account. A second observation updates
-- the row so its evidence accumulates, rather than producing a second opinion
-- about the same person that nobody reconciles.
create unique index if not exists social_recommendations_subject_idx
  on social_recommendations (account_id, platform, subject);

create index if not exists social_recommendations_open_idx
  on social_recommendations (account_id, status, relevance desc)
  where status = 'proposed';

comment on table social_recommendations is
  'Ranked, evidence-backed intelligence about accounts, communities and topics. Read by a person. Nothing here executes.';
comment on column social_recommendations.kind is
  'What a person might do. Contains no verb that touches a platform — see §209 and assertNoAutonomousAction.';
comment on column social_recommendations.evidence is
  'Non-empty by constraint. A recommendation about a third party without evidence is not a claim.';

-- RLS on both, matching every other table: enabled AND forced, one admin_all
-- policy on public.is_admin(), nothing for anon or authenticated.
do $$
declare t text;
begin
  foreach t in array array['account_intelligence', 'social_recommendations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t and policyname = 'admin_all'
    ) then
      execute format(
        'create policy admin_all on public.%I for all using (public.is_admin()) with check (public.is_admin())',
        t);
    end if;
  end loop;
end $$;

do $$
declare r text; t text;
begin
  foreach t in array array['account_intelligence', 'social_recommendations'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke all on public.%I from %I', t, r);
      end if;
    end loop;
  end loop;
end $$;

-- The job. Gotcha 1: this list and JOB_KINDS in packages/db/src/index.ts are the
-- same list written twice, and only handlerCoverage.test.ts notices a divergence.
alter table jobs drop constraint if exists jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind = any (array[
  'generate', 'render', 'tts', 'capture', 'publish', 'collect_metrics',
  'collect_signals', 'collect_comments', 'collect_attribution', 'refresh_tokens',
  'score_performance', 'digest_email', 'reconcile_schedule', 'mark_stale_assets',
  'collect_app_store', 'detect_release', 'collect_watch_terms', 'draft_newsletter',
  'send_newsletter', 'collect_reviews', 'review_media', 'verify_feature',
  'explore_product', 'cluster_rejections', 'purge_logs',
  'collect_product_evidence', 'build_product_brain', 'verify_provider_capability',
  'correct_content', 'learn_from_performance',
  -- §208
  'build_account_intelligence'
]));
