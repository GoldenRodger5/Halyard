-- §210. Why this, why now, why here.
--
-- Halyard could already choose what to make and how to tell it. What it could
-- not do was say why: `ideas` records a topic, `content_items` a platform,
-- `slots` a time, and nothing recorded the reasoning that joined them. "Why did
-- Halyard make this post" was answerable only by inference from three tables
-- each holding a third of the answer.
--
-- This is the missing link in the lineage §12 asks for:
--   signal → strategy_decision → idea → content_item → publication → metrics → insight
create table if not exists strategy_decisions (
  id uuid primary key default gen_random_uuid(),
  product_id text references products(id) on delete cascade,
  account_id uuid not null references social_accounts(id) on delete cascade,
  platform text not null,

  -- The opportunity this rests on. Nullable because an operator can compose
  -- without one, and a decision made by a person is still a decision.
  signal_id uuid references signals(id) on delete set null,
  -- Filled in when the decision produces work, closing the lineage forward.
  idea_id uuid references ideas(id) on delete set null,
  content_item_id uuid references content_items(id) on delete set null,

  objective text not null check (objective in
    ('awareness','engagement','education','traffic','conversion','retention',
     'follower_growth','product_promotion')),
  creation_mode text not null default 'create'
    check (creation_mode in ('create','reuse','remix','adapt')),

  why_now text not null,
  audience text not null,
  rationale text not null,

  preferred_treatments text[] not null default '{}',
  avoid_treatments text[] not null default '{}',

  publish_earliest timestamptz not null,
  publish_latest timestamptz not null,
  timing_reason text not null,

  -- The measurement plan, and the reason this table is worth having. A decision
  -- with no measurement cannot be wrong later, and a decision that cannot be
  -- wrong teaches nothing — which is the loop §204 exists to close.
  primary_metric text not null,
  -- Null is the normal early state and is deliberately not a guess: a threshold
  -- invented before any measurement would be met or missed for reasons
  -- unrelated to the content, and would then be learned from.
  success_threshold numeric,
  measurement_basis text not null,
  review_after timestamptz not null,

  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  -- Every input the decision rested on, for the lineage.
  evidence text[] not null default '{}',

  created_at timestamptz not null default now()
);

create index if not exists strategy_decisions_account_idx
  on strategy_decisions (account_id, created_at desc);
create index if not exists strategy_decisions_review_idx
  on strategy_decisions (review_after)
  where content_item_id is not null;

comment on table strategy_decisions is
  'Why a post was made: objective, timing, treatment leaning, and the one metric it is judged on. The missing link between a signal and a content item.';
comment on column strategy_decisions.success_threshold is
  'Null until an account baseline exists. Never guessed — a fabricated threshold becomes a fabricated lesson.';
comment on column strategy_decisions.primary_metric is
  'One metric. A decision measured against six can always be argued to have succeeded.';

alter table strategy_decisions enable row level security;
alter table strategy_decisions force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'strategy_decisions' and policyname = 'admin_all'
  ) then
    execute 'create policy admin_all on public.strategy_decisions for all
               using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.strategy_decisions from %I', r);
    end if;
  end loop;
end $$;
