-- 0085 — CreativePackage v1 on the existing creative model
--
-- Do NOT add a fourth creative hierarchy. `concepts`, `creative_briefs` and
-- `platform_variants` already represent package core → platform brief → actual
-- variant. This migration fills the fields v2 needs and adds only the missing
-- production-provider lineage.

-- ── Package core: concepts ────────────────────────────────────────────────

alter table concepts
  add column if not exists package_version int not null default 1,
  add column if not exists origin_kind text,
  add column if not exists origin_ref text,
  add column if not exists family text,
  add column if not exists audience_problem text,
  add column if not exists audience_awareness text,
  add column if not exists why_care_before_product text,
  add column if not exists payoff text,
  add column if not exists cta_direction jsonb not null default '{}'::jsonb,
  add column if not exists experiment jsonb not null default '{}'::jsonb,
  add column if not exists quality_bar jsonb not null default '[]'::jsonb,
  add column if not exists production_requirements jsonb not null default '[]'::jsonb;

alter table concepts drop constraint if exists concepts_family_check;
alter table concepts add constraint concepts_family_check check (
  family is null or family in (
    'proof_demo','transformation','teach','story_pov','entertainment_social','creator_style'
  )
);

alter table concepts drop constraint if exists concepts_audience_awareness_check;
alter table concepts add constraint concepts_audience_awareness_check check (
  audience_awareness is null or audience_awareness in (
    'unaware','problem_aware','solution_aware','product_aware','mixed'
  )
);

-- Preserve every old objective and add the explicit growth outcomes v2 needs.
alter table concepts drop constraint if exists concepts_objective_check;
alter table concepts add constraint concepts_objective_check check (objective in (
  'awareness','engagement','education','traffic','conversion','retention',
  'follower_growth','product_promotion','reach','follow','profile_visit',
  'site_visit','signup','activation','learning'
));


alter table concepts drop constraint if exists concepts_origin_kind_check;
alter table concepts add constraint concepts_origin_kind_check check (
  origin_kind is null or origin_kind in (
    'launch','campaign','daily','manual','opportunity','experiment'
  )
);

create unique index if not exists concepts_origin_unique_idx
  on concepts (product_id, origin_kind, origin_ref)
  where origin_kind is not null and origin_ref is not null;

comment on column concepts.origin_ref is
  'Stable idempotency key inside an origin, e.g. launch concept_key. Replanning updates the same package instead of creating duplicate creative lineage.';
comment on column concepts.family is
  'CreativePackage content family. Audience experience, not media format.';
comment on column concepts.why_care_before_product is
  'Why the audience should care before the product is mentioned; anti-ad-feed guard.';
comment on column concepts.production_requirements is
  'Provider-neutral capabilities the package needs before platform-specific overrides.';

-- ── Platform creative brief ───────────────────────────────────────────────

alter table creative_briefs
  add column if not exists format text,
  add column if not exists subtype text,
  add column if not exists hook text,
  add column if not exists caption_brief text,
  add column if not exists title_brief text,
  add column if not exists production_requirements jsonb not null default '[]'::jsonb,
  add column if not exists quality_bar jsonb not null default '[]'::jsonb;


create unique index if not exists creative_briefs_package_account_platform_idx
  on creative_briefs (concept_id, account_id, platform)
  where account_id is not null;
comment on column creative_briefs.production_requirements is
  'Provider-neutral production capabilities for this platform variant.';
comment on column creative_briefs.hook is
  'The actual native hook for this platform variant, not merely a hook treatment label.';


-- §218 originally allowed one variant per concept/platform, which cannot represent
-- two social identities on the same platform. A variant belongs to a brief,
-- and the brief owns the account, so identity is (brief, platform).
drop index if exists platform_variants_unique_idx;
create unique index if not exists platform_variants_brief_platform_idx
  on platform_variants (brief_id, platform)
  where brief_id is not null;

-- ── Production recipe: the missing provider lineage ──────────────────────

create table if not exists production_recipes (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references concepts(id) on delete cascade,
  brief_id uuid not null references creative_briefs(id) on delete cascade,
  platform_variant_id uuid references platform_variants(id) on delete set null,
  content_item_id uuid references content_items(id) on delete set null,

  mode text not null check (mode in ('calibration','production')),
  revision int not null default 1 check (revision >= 1),
  status text not null default 'planned' check (status in (
    'planned','producing','review_required','accepted','rejected','failed','obsolete'
  )),

  requirements jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  refusals jsonb not null default '[]'::jsonb,
  reasons jsonb not null default '[]'::jsonb,

  human_review_required boolean not null default true,
  estimated_cost_usd numeric,
  cost_cap_usd numeric,
  provider_versions jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists production_recipes_concept_idx
  on production_recipes (concept_id, created_at desc);
create index if not exists production_recipes_brief_idx
  on production_recipes (brief_id, created_at desc);
create index if not exists production_recipes_content_idx
  on production_recipes (content_item_id, created_at desc)
  where content_item_id is not null;
create unique index if not exists production_recipes_variant_revision_idx
  on production_recipes (platform_variant_id, revision)
  where platform_variant_id is not null;

create trigger production_recipes_touch before update on production_recipes
  for each row execute function public.touch_updated_at();

comment on table production_recipes is
  'Reproducible provider routing for one CreativePackage platform brief/variant. Metrics can later compare provider recipes rather than vague media types.';
comment on column production_recipes.human_review_required is
  'True for calibration and generated visual recipes until that production recipe is accepted for automation.';

alter table production_recipes enable row level security;
alter table production_recipes force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'production_recipes' and policyname = 'admin_all'
  ) then
    execute 'create policy admin_all on public.production_recipes for all
               using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.production_recipes from %I', r);
    end if;
  end loop;
end $$;

-- Content already has concept_id/brief_id. This closes the final provider link.
alter table content_items
  add column if not exists production_recipe_id uuid
    references production_recipes(id) on delete set null;

create index if not exists content_items_production_recipe_idx
  on content_items (production_recipe_id)
  where production_recipe_id is not null;

comment on column content_items.production_recipe_id is
  'The provider-routing recipe that produced the currently reviewed/published media version.';

insert into schema_version (id, version, applied_at)
values (true, '0085', now())
on conflict (id) do update
  set version = excluded.version, applied_at = excluded.applied_at;
