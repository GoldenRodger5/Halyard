-- ═══════════════════════════════════════════════════════════════════════════
-- 0011 — Milestones 22, 23, 24
--   · product_artifacts cache, so a 75-second adaptation is never paid twice
--   · connector call log and rate limiting
--   · products.kind, so a founder persona can exist without being a product
--   · content_items.about_product_id, so a founder post about RecipeFix is
--     still attributable to RecipeFix
--   · shipped_features, for the GitHub connector
-- ═══════════════════════════════════════════════════════════════════════════

-- ── M22: adaptation cache ──────────────────────────────────────────────────
-- An adaptation takes 60 to 75 seconds and spends real credits. The cache key
-- is the *request*, so the same source recipe and dietary set resolves instantly.
create table product_artifacts (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references products(id) on delete cascade,
  kind          text not null default 'recipe_adaptation',
  request_key   text not null,
  request       jsonb not null default '{}'::jsonb,
  raw           jsonb not null,
  headline      text,
  highlights    jsonb not null default '[]'::jsonb,
  visual_hints  text[] not null default '{}',
  duration_ms   int,
  fetched_at    timestamptz not null default now(),
  expires_at    timestamptz,
  hit_count     int not null default 0,
  unique (product_id, request_key)
);
create index product_artifacts_lookup_idx on product_artifacts (product_id, kind, fetched_at desc);

alter table content_items
  add column product_artifact_id uuid references product_artifacts(id) on delete set null;

-- ── M22: connector call log, for the health page and the rate limiter ──────
create table connector_calls (
  id           uuid primary key default gen_random_uuid(),
  product_id   text not null references products(id) on delete cascade,
  tool         text not null,
  ok           boolean not null,
  duration_ms  int,
  error        text,
  cached       boolean not null default false,
  called_at    timestamptz not null default now()
);
create index connector_calls_recent_idx on connector_calls (product_id, tool, called_at desc);

-- ── M23: a founder is a persona, not a product ─────────────────────────────
alter table products add column kind text not null default 'product'
  check (kind in ('product', 'personal'));

-- A founder post can be *about* a product without belonging to it. Analytics
-- attributes on about_product_id; the mix engine counts against product_id.
alter table content_items
  add column about_product_id text references products(id) on delete set null;
create index content_items_about_idx on content_items (about_product_id)
  where about_product_id is not null;

alter table ideas
  add column about_product_id text references products(id) on delete set null;

-- ── M24: shipped features, summarised from commits ─────────────────────────
create table shipped_features (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references products(id) on delete cascade,
  title         text not null,
  description   text not null,
  -- The raw material, kept so a summary can be audited against what shipped.
  source_refs   jsonb not null default '[]'::jsonb,  -- [{type, id, url, title}]
  shipped_at    timestamptz not null,
  user_facing   boolean not null default true,
  status        text not null default 'new'
                check (status in ('new', 'used', 'ignored')),
  content_item_id uuid references content_items(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (product_id, title, shipped_at)
);
create index shipped_features_triage_idx on shipped_features (product_id, status, shipped_at desc);

-- GitHub connector config lives on the product, alongside the MCP config.
alter table products add column repo_config jsonb not null default '{}'::jsonb;
  -- {owner, repo, branches: [], user_facing_paths: [], last_polled_at}

-- The brief drifts as the product ships. This is what the staleness warning
-- counts against.
alter table products add column brief_staleness_threshold int not null default 8;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS for the new tables.
--
-- 0010 enumerated tables by hand, which meant every future migration silently
-- shipped an unprotected table. This replaces that with a function that finds
-- any public table without RLS and applies the standard admin policy, so a new
-- migration only has to remember one line:
--
--     select public.apply_admin_rls();
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.apply_admin_rls()
returns int
language plpgsql
as $$
declare
  t record;
  applied int := 0;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and (c.relrowsecurity = false or c.relforcerowsecurity = false)
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('alter table public.%I force row level security', t.relname);
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t.relname and policyname = 'admin_all'
    ) then
      execute format(
        'create policy admin_all on public.%I for all
           using (public.is_admin()) with check (public.is_admin())', t.relname);
    end if;
    applied := applied + 1;
  end loop;
  return applied;
end;
$$;

select public.apply_admin_rls();
