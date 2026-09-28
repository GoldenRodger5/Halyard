-- 0086 — capability-specific production calibration.
--
-- 0085 established CreativePackage / ProductionRecipe lineage. This follow-up
-- is intentionally separate because 0085 had already been applied to live
-- before the calibration gate was designed. Never mutate an applied migration.

-- ── Accepted production capabilities ───────────────────────────────────────
-- A generative provider does not become production-safe merely because a key
-- exists. Calibration is product + capability specific: approved food B-roll
-- does not implicitly approve a synthetic presenter, nor does RecipeFix's
-- visual language approve KinoLog's.
create table if not exists production_provider_calibrations (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,
  provider text not null,
  capability text not null,
  recipe_key text not null default 'default',
  status text not null default 'candidate'
    check (status in ('candidate','accepted','rejected')),
  source_recipe_id uuid references production_recipes(id) on delete set null,
  notes text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, provider, capability, recipe_key)
);

create index if not exists production_provider_calibrations_product_idx
  on production_provider_calibrations (product_id, status, provider, capability);

create trigger production_provider_calibrations_touch
  before update on production_provider_calibrations
  for each row execute function public.touch_updated_at();

comment on table production_provider_calibrations is
  'Human-reviewed permission for a provider/capability recipe to participate in unattended production for one product.';

alter table production_provider_calibrations enable row level security;
alter table production_provider_calibrations force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='production_provider_calibrations' and policyname='admin_all'
  ) then
    execute 'create policy admin_all on public.production_provider_calibrations for all
               using (public.is_admin()) with check (public.is_admin())';
  end if;
end $$;

do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname=r) then
      execute format('revoke all on public.production_provider_calibrations from %I', r);
    end if;
  end loop;
end $$;


insert into schema_version (id, version, applied_at)
values (true, '0086', now())
on conflict (id) do update
  set version = excluded.version, applied_at = excluded.applied_at;
