-- ═══════════════════════════════════════════════════════════════════════════
-- 0012 — Milestone 27: content quality and retention engineering
--
-- The hook stops being a string and becomes a subsystem: four coordinated
-- layers per variant, a named type, fatigue tracking, and experiments that make
-- "which hook won" answerable rather than anecdotal.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── I.10: hooks become typed, layered, and rotatable ───────────────────────
alter table hooks add column hook_type text;
alter table hooks add column layer text not null default 'text'
  check (layer in ('text', 'spoken', 'visual', 'caption'));
alter table hooks add column pattern_template text;   -- "Your {thing} is {problem}"
alter table hooks add column last_used_at timestamptz;
alter table hooks add column recency_weighted_score numeric;
alter table hooks add column format text;             -- carousel|single|reel|short|thread|pin

-- `source` already exists from 0004; widen it for swipe-file extraction.
alter table hooks drop constraint if exists hooks_source_check;
alter table hooks add constraint hooks_source_check
  check (source in ('seeded', 'calibration', 'approved_post', 'manual', 'swipe', 'generated'));

create index hooks_rotation_idx on hooks (product_id, hook_type, last_used_at desc nulls first);

/**
 * A hook is four coordinated artifacts, not one string. QC rejects a variant
 * whose layers contradict each other, or where the on-screen text is just the
 * spoken line transcribed.
 */
create table hook_variants (
  id                  uuid primary key default gen_random_uuid(),
  content_item_id     uuid not null references content_items(id) on delete cascade,
  hook_type           text not null,
  text_hook           text not null,          -- frame 1, 4 to 7 words
  spoken_hook         text,                   -- lands inside 1.5 seconds
  visual_direction    text,                   -- a pattern interrupt, never a title card
  caption_hook        text,                   -- works with no video context
  -- Null rather than a fabricated number at cold start. Never render a
  -- confident prediction over n=2.
  predicted_stop_rate numeric,
  prediction_basis    text,
  selected            boolean not null default false,
  -- I.9: same body, same render, same slot, only the hook varies.
  experiment_id       uuid,
  variant_label       text,
  rejected_reason     text,
  created_at          timestamptz not null default now()
);
create index hook_variants_item_idx on hook_variants (content_item_id, selected desc);
create index hook_variants_experiment_idx on hook_variants (experiment_id)
  where experiment_id is not null;

create table hook_experiments (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references products(id) on delete cascade,
  hypothesis    text not null,
  status        text not null default 'running'
                check (status in ('running', 'concluded', 'abandoned')),
  -- What is held constant, so a result means something.
  controls      jsonb not null default '{}'::jsonb,
  started_at    timestamptz not null default now(),
  concluded_at  timestamptz,
  outcome       text
);

-- ── Part C: retention engineering, as data rather than prompt advice ───────
alter table templates add column loop_ready boolean not null default false;
alter table templates add column opens_on_content boolean not null default true;
alter table templates add column min_pattern_interrupt_seconds int not null default 15;

-- TikTok and Reels reward replays more than anything else available, so
-- compositions for those platforms default to a loop-ready ending.
update templates set loop_ready = true
 where renderer = 'remotion' and format = 'video';

-- ── Part E: cadence ceilings per format, not just per platform per day ─────
--
-- Three to five short videos a week keeps the algorithm confident. Below three
-- the account is deprioritised; above seven, quality drops and average
-- retention degrades, which pulls the channel-level signal down with it.
create table format_cadence (
  id                uuid primary key default gen_random_uuid(),
  product_id        text not null references products(id) on delete cascade,
  format            text not null,
  weekly_floor      int not null default 0,
  weekly_ceiling    int not null default 7,
  reason            text,
  unique (product_id, format)
);

-- ── Part G: regeneration that learns ──────────────────────────────────────
--
-- Every rejection reason is already stored. This is where the pattern across
-- them gets named, so taste becomes legible to the operator and not only to the
-- system.
create table rejection_clusters (
  id             uuid primary key default gen_random_uuid(),
  product_id     text not null references products(id) on delete cascade,
  category       text,
  pattern        text not null,
  example_ids    uuid[] not null default '{}',
  occurrences    int not null default 0,
  suggested_rule text,
  status         text not null default 'surfaced'
                 check (status in ('surfaced', 'accepted', 'dismissed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger rejection_clusters_touch before update on rejection_clusters
  for each row execute function public.touch_updated_at();

-- ── Part F: the swipe file gets the fields generation actually needs ───────
alter table references_swipe add column format text;
alter table references_swipe add column category text;
alter table references_swipe add column hook_text text;
alter table references_swipe add column hook_type text;
alter table references_swipe add column author_handle text;
alter table references_swipe add column added_at timestamptz not null default now();

-- ── content_items carries its hook and its experiment ─────────────────────
alter table content_items add column hook_variant_id uuid references hook_variants(id) on delete set null;
alter table content_items add column experiment_id uuid references hook_experiments(id) on delete set null;
alter table content_items add column format_subtype text;
  -- carousel|single|reel_script|thread|insight|short|pin|take|tip

select public.apply_admin_rls();

-- ── Seeds ─────────────────────────────────────────────────────────────────

-- Cadence, from the research. The video ceiling is the one that matters.
--
-- Backfill only. The guard on the product existing means this inserts nothing on
-- a fresh database, where migrations run before seed.sql — so seed.sql owns
-- these rows and this exists for databases that predate them. DECISIONS §12.
insert into format_cadence (product_id, format, weekly_floor, weekly_ceiling, reason)
select 'recipefix', v.format, v.floor, v.ceiling, v.reason
  from (values
    ('video', 3, 5,
     'Below three per week the algorithm treats the account as lower priority. Above seven, quality drops and average retention degrades, which pulls the channel-level signal down.'),
    ('carousel', 2, 5, 'Carousels earn saves, which are worth more than likes, but they are expensive to make well.'),
    ('image', 2, 7, null),
    ('text', 3, 14, 'Cheap to produce and cheap to ignore. The ceiling exists to stop text crowding out everything else.'),
    ('pin', 5, 35, 'Pinterest is a search index, not a feed. Volume works here and nowhere else.')
  ) as v(format, floor, ceiling, reason)
 where exists (select 1 from products where id = 'recipefix')
on conflict (product_id, format) do nothing;

-- Existing seeded hooks get a type, so the taxonomy is populated from day one.
update hooks set hook_type = 'problem_state', layer = 'text'
 where pattern like 'Why your%' and hook_type is null;
update hooks set hook_type = 'contradiction', layer = 'text'
 where pattern like '%nobody asked for%' and hook_type is null;
update hooks set hook_type = 'specificity', layer = 'text'
 where pattern like '{n} changes%' and hook_type is null;
update hooks set hook_type = 'myth_bust', layer = 'text'
 where pattern like 'Doubling%' and hook_type is null;
update hooks set hook_type = 'confession', layer = 'text'
 where pattern like 'I shipped%' and hook_type is null;
update hooks set hook_type = 'problem_state', layer = 'text' where hook_type is null;

alter table hooks alter column hook_type set not null;
