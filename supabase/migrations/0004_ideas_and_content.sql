-- ═══════════════════════════════════════════════════════════════════════════
-- 0004 — Signals, ideas, series, hooks, and content_items (the core table)
-- v1 §2 + v2 Part J (folded in rather than bolted on as ALTERs)
-- ═══════════════════════════════════════════════════════════════════════════

create table signals (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references products(id) on delete cascade,
  source        text not null
                check (source in ('product_activity','changelog','editorial',
                                  'seasonal','trend','performance','submission')),
  raw           jsonb not null default '{}'::jsonb,
  summary       text not null,
  relevance     numeric,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index signals_unconsumed_idx on signals (product_id, created_at desc)
  where consumed_at is null;

-- v2 I.3 — named recurring formats. Franchises build habit; one-off posts do not.
create table series (
  id             uuid primary key default gen_random_uuid(),
  product_id     text not null references products(id) on delete cascade,
  name           text not null,                    -- 'Fix This Recipe'
  description    text,
  template_id    text,                             -- FK added in 0005 (templates)
  cadence        text,                             -- 'weekly' | 'twice_weekly' | ...
  next_sequence  int not null default 1,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (product_id, name)
);

-- v2 I.4 — the first three to five words decide whether anything else is read.
create table hooks (
  id             uuid primary key default gen_random_uuid(),
  product_id     text references products(id) on delete cascade,
  pattern        text not null,
  platform       text,
  category       text,
  source         text not null default 'seeded'
                 check (source in ('seeded','calibration','approved_post','manual')),
  uses           int not null default 0,
  avg_stop_rate  numeric,
  avg_score      numeric,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index hooks_lookup_idx on hooks (product_id, platform, active);

create table ideas (
  id              uuid primary key default gen_random_uuid(),
  product_id      text not null references products(id) on delete cascade,
  title           text not null,
  angle           text not null,                   -- the actual insight
  category        text not null
                  check (category in ('transformation','education','community',
                                      'product','founder_insight')),
  rationale       text,                            -- why the system proposed it
  source_signals  uuid[] not null default '{}',
  series_id       uuid references series(id) on delete set null,

  score           numeric not null default 0,
  score_breakdown jsonb not null default '{}'::jsonb,
  -- {mix_debt, novelty, seasonal, product_signal, format_availability, historical}

  -- Novelty is cosine distance against the last 60 days. Stored as a plain float
  -- array and compared in TypeScript rather than pgvector — the working set is a
  -- few hundred rows, and this keeps the schema portable. See docs/DECISIONS.md.
  embedding       jsonb,

  status          text not null default 'proposed'
                  check (status in ('proposed','selected','used','rejected','expired','snoozed')),
  reject_reason   text,
  snoozed_until   timestamptz,
  expires_at      timestamptz,                     -- seasonal ideas
  created_at      timestamptz not null default now()
);
create index ideas_ranked_idx on ideas (product_id, status, score desc);

-- ───────────────────────────────────────────────────────────────────────────
-- content_items — the core table
-- ───────────────────────────────────────────────────────────────────────────
create table content_items (
  id              uuid primary key default gen_random_uuid(),
  product_id      text not null references products(id) on delete cascade,
  idea_id         uuid references ideas(id) on delete set null,
  account_id      uuid not null references social_accounts(id) on delete cascade,

  platform        text not null,
  persona         text not null check (persona in ('founder','brand')),
  format          text not null
                  check (format in ('text','image','carousel','video','story','pin')),
  category        text not null,

  -- Copy
  body            text not null default '',
  title           text,                            -- YouTube / Pinterest
  alt_text        text,                            -- v2 I.8: generate always, never null
  hashtags        text[] not null default '{}',
  link_url        text,                            -- pre-UTM
  final_link_url  text,                            -- UTM-stamped at schedule time

  -- Source material — the real product output this was built from
  product_artifact jsonb,

  -- Rendered media, ordered
  render_ids      uuid[] not null default '{}',

  -- Voiceover
  vo_script       text,
  vo_asset_id     uuid references assets(id) on delete set null,

  status          text not null default 'draft'
                  check (status in ('draft','pending_approval','approved','scheduled',
                                    'publishing','published','awaiting_manual_publish',
                                    'failed','rejected','archived','expired')),

  scheduled_at    timestamptz,
  published_at    timestamptz,
  slot_id         uuid,                            -- FK added in 0007 (slots)
  reschedule_count int not null default 0,         -- build pack §3: max 3, then expired

  -- Human feedback loop
  edited_by_human boolean not null default false,
  original_body   text,                            -- pre-edit, for learning
  regen_notes     text[] not null default '{}',
  reject_reason   text,
  approved_at     timestamptz,

  generation_meta jsonb not null default '{}'::jsonb, -- {model, prompt_version, tokens, cost_usd}

  -- ═══ v2 Part J additions ═══════════════════════════════════════════════
  -- Compliance (v2 Part C)
  ai_components   text[] not null default '{}',    -- copy|voiceover|imagery|motion|none
  disclosure_text text,
  requires_ai_label boolean
                  generated always as (
                    'voiceover' = any(ai_components) or 'imagery' = any(ai_components)
                  ) stored,

  -- QC (v2 Part F) — gate results shown in the queue so approval is informed
  qc_results      jsonb not null default '{}'::jsonb,
  claims          jsonb not null default '[]'::jsonb,

  -- Audio (v2 D.2) — generic third-party TTS is dropped entirely
  audio_mode      text not null default 'text_only'
                  check (audio_mode in ('founder_cloned','founder_recorded','text_only')),

  -- Franchises and repost decay (v2 I.3, I.6)
  series_id       uuid references series(id) on delete set null,
  sequence_number int,
  eligible_for_repost_at timestamptz,
  reposted_from_id uuid references content_items(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index content_items_schedule_idx on content_items (status, scheduled_at);
create index content_items_browse_idx on content_items (product_id, platform, created_at desc);
create index content_items_repost_idx on content_items (product_id, eligible_for_repost_at)
  where status = 'published';

create trigger content_items_touch before update on content_items
  for each row execute function public.touch_updated_at();

-- v2 Part C.3 — compliance as a code path, not a habit.
-- The publish job refuses to post when a label is required and no disclosure exists;
-- this constraint makes the same rule unbypassable at the storage layer.
alter table content_items add constraint content_items_ai_disclosure_check
  check (
    status not in ('approved','scheduled','publishing','published')
    or requires_ai_label = false
    or (disclosure_text is not null and length(trim(disclosure_text)) > 0)
  );
