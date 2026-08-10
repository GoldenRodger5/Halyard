-- ═══════════════════════════════════════════════════════════════════════════
-- 0005 — Templates, renders, jobs
-- v1 §2, v1 §5, v1 §6
-- ═══════════════════════════════════════════════════════════════════════════

create table templates (
  id               text primary key,               -- 'transformation_diff_v2'
  product_id       text references products(id) on delete cascade,
  renderer         text not null check (renderer in ('satori','remotion','playwright')),
  format           text not null,
  aspect_ratio     text not null,                  -- '1:1' | '4:5' | '9:16' | '16:9' | '2:3'
  props_schema     jsonb not null default '{}'::jsonb,
  description      text,
  preview_asset_id uuid references assets(id) on delete set null,
  -- build pack §2 step 4: templates you reject are disabled rather than deleted
  enabled          boolean not null default true,
  disabled_reason  text,
  created_at       timestamptz not null default now()
);

alter table series
  add constraint series_template_fk
  foreign key (template_id) references templates(id) on delete set null;

create table renders (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid references content_items(id) on delete cascade,
  template_id     text not null references templates(id),
  renderer        text not null check (renderer in ('satori','remotion','playwright')),
  input_props     jsonb not null,                  -- exact props — renders are reproducible
  output_asset_id uuid references assets(id) on delete set null,
  slide_index     int not null default 0,          -- carousel ordering
  quality         text not null default 'final'
                  check (quality in ('preview','final')),  -- v2 H.5: cheap preview renders
  status          text not null default 'queued'
                  check (status in ('queued','rendering','done','failed')),
  error           text,
  duration_ms     int,
  created_at      timestamptz not null default now()
);
create index renders_item_idx on renders (content_item_id, slide_index);

-- ───────────────────────────────────────────────────────────────────────────
-- Jobs — single table, FOR UPDATE SKIP LOCKED, worker polls every 2s (v1 §6)
-- ───────────────────────────────────────────────────────────────────────────
create table jobs (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null
                check (kind in ('generate','render','tts','capture','publish',
                                'collect_metrics','collect_signals','collect_comments',
                                'collect_attribution','refresh_tokens','score_performance',
                                'digest_email','reconcile_schedule')),
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'queued'
                check (status in ('queued','running','done','failed','dead')),
  priority      int not null default 100,
  attempts      int not null default 0,
  max_attempts  int not null default 3,
  run_after     timestamptz not null default now(),
  locked_at     timestamptz,
  locked_by     text,
  last_error    text,
  -- Deduplication for jobs that must never be enqueued twice concurrently
  dedupe_key    text,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index jobs_claim_idx on jobs (status, run_after, priority) where status = 'queued';
create unique index jobs_dedupe_idx on jobs (dedupe_key)
  where dedupe_key is not null and status in ('queued','running');
