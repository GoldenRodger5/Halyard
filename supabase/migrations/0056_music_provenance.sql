-- §239. The music model a production library actually needs, and the class
-- that decides whether a bed may reach a real post.
--
-- §221 built `music_beds` with mood, energy, tempo and first-class licence
-- fields, and deliberately left it empty: inventing a licensed track is the
-- same class of fabrication as inventing product evidence.
--
-- The danger was never *test audio*. It was test audio being
-- indistinguishable from licensed audio once it was in the table. So the
-- table now carries the distinction explicitly, and the publish path enforces
-- it:
--
--   licensed_production  a real licence exists, and `licence_proof` says where
--   test                 a fixture. Renders and previews only. Never published.
--   unverified           imported but nobody has confirmed the licence yet
--
-- Only `licensed_production` may be attached to a post that will be published.
-- That single column is what makes a fixture library safe to have.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'music_provenance') then
    create type music_provenance as enum ('licensed_production', 'test', 'unverified');
  end if;
end $$;

alter table music_beds
  add column if not exists provenance music_provenance not null default 'unverified',
  -- Where it came from, as a fact rather than a memory.
  add column if not exists source text,
  -- The receipt, licence key, purchase URL or file path that proves the grant.
  add column if not exists licence_proof text,
  -- Platforms this bed may NOT be used on, distinct from the allow-list.
  add column if not exists prohibited_platforms text[] not null default '{}',
  add column if not exists has_vocals boolean not null default false,
  -- Stems, where the licence includes them. Keyed by stem name.
  add column if not exists stems jsonb not null default '{}'::jsonb,
  add column if not exists active boolean not null default true,
  add column if not exists usage_count integer not null default 0,
  -- Accounts this bed is reserved for or barred from, when a licence is
  -- per-channel rather than per-organisation.
  add column if not exists account_restrictions text[] not null default '{}';

comment on column music_beds.provenance is
  'licensed_production may be published; test is for renders and previews only; unverified has not been confirmed. The publish path refuses anything but licensed_production.';
comment on column music_beds.licence_proof is
  'Where the grant can be checked: a receipt, a licence key, a purchase URL. A licence with no proof is unverified, whatever the licence column says.';

-- A bed claiming production licensing must say where the proof is. This is the
-- constraint that stops `provenance` becoming a checkbox somebody ticks.
alter table music_beds drop constraint if exists music_beds_production_needs_proof;
alter table music_beds add constraint music_beds_production_needs_proof
  check (provenance <> 'licensed_production' or (licence_proof is not null and length(trim(licence_proof)) > 0));

create index if not exists music_beds_selectable_idx
  on music_beds (provenance, active, mood, energy);

-- ── Usage memory ───────────────────────────────────────────────────────────
--
-- §239. "Do not simply rotate LRU."
--
-- `last_used_at` on the bed answers "when was this last used" and nothing
-- else. It cannot answer "has this account heard it", "did it work", or "how
-- often does this bed appear next to this treatment" — and those are the
-- questions selection and learning both need. One row per use.
create table if not exists music_usage (
  id uuid primary key default gen_random_uuid(),
  music_bed_id uuid not null references music_beds(id) on delete cascade,
  content_item_id uuid references content_items(id) on delete set null,
  brief_id uuid references creative_briefs(id) on delete set null,
  account_id uuid references social_accounts(id) on delete set null,
  platform text not null,
  -- What the piece was, so learning can join music to creative shape.
  treatment text,
  visual_language text,
  -- Why this bed. Recorded so a selection is answerable months later.
  reasons text[] not null default '{}',
  used_at timestamptz not null default now(),
  -- Filled by the learning job once the post has performance.
  score numeric(6,3),
  scored_at timestamptz
);

create index if not exists music_usage_bed_idx on music_usage (music_bed_id, used_at desc);
create index if not exists music_usage_account_idx on music_usage (account_id, used_at desc);

alter table music_usage enable row level security;
alter table music_usage force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='music_usage' and policyname='admin_all'
  ) then
    execute 'create policy admin_all on public.music_usage for all
               using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;

do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.music_usage from %I', r);
    end if;
  end loop;
end $$;
