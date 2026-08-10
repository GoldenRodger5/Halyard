-- ═══════════════════════════════════════════════════════════════════════════
-- 0008 — Operator settings (kill switch), onboarding state, worker health
-- v1 §10, build pack §2, build pack §8
-- ═══════════════════════════════════════════════════════════════════════════

-- Singleton settings row. `id` is pinned so there can only ever be one.
create table settings (
  id                    boolean primary key default true check (id),
  -- v1 §10 — the kill switch. Checked at the top of every publish job.
  publishing_enabled    boolean not null default false,
  publishing_disabled_reason text,
  generation_enabled    boolean not null default true,
  alert_email           text,
  daily_digest_enabled  boolean not null default true,
  -- Cold-start honesty (v2 G.4): the learning loop activates at ~20 posts per
  -- category. Below that the UI says so rather than rendering a confident chart.
  learning_min_posts_per_category int not null default 20,
  updated_at            timestamptz not null default now()
);
insert into settings (id) values (true);

create trigger settings_touch before update on settings
  for each row execute function public.touch_updated_at();

-- ── build pack §2 — the first-run wizard is not optional ───────────────────
-- Until steps 1..4 are complete the daily generation cron does not run, and
-- Halyard says so explicitly rather than producing bad content silently.
create table onboarding_state (
  product_id            text primary key references products(id) on delete cascade,
  step_ingest_done      boolean not null default false,
  step_voice_done       boolean not null default false,
  step_calibration_done boolean not null default false,
  step_templates_done   boolean not null default false,
  step_accounts_done    boolean not null default false,
  calibration_batch_id  uuid,
  calibration_reviewed  int not null default 0,
  calibration_target    int not null default 20,
  voice_answers         jsonb not null default '{}'::jsonb,
  completed_at          timestamptz,
  updated_at            timestamptz not null default now()
);

create trigger onboarding_state_touch before update on onboarding_state
  for each row execute function public.touch_updated_at();

-- Calibration drafts (build pack §2 step 3): 20 drafts with no intent to publish.
-- Every rejection asks why, in one line. That line is the whole point.
create table calibration_reviews (
  id              uuid primary key default gen_random_uuid(),
  product_id      text not null references products(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  verdict         text not null check (verdict in ('approved','rejected','edited')),
  reason          text,
  edited_body     text,
  reviewed_at     timestamptz not null default now(),
  unique (content_item_id)
);

-- ── build pack §8 — missing heartbeat is the only way to detect a dead worker
create table worker_heartbeats (
  worker_id    text primary key,
  last_seen_at timestamptz not null default now(),
  version      text,
  detail       jsonb not null default '{}'::jsonb
);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null
             check (kind in ('auth_failure','duplicate_publish_abort','queue_depth',
                             'worker_missing','render_failure','digest','connector_down')),
  severity   text not null default 'warning' check (severity in ('info','warning','critical')),
  title      text not null,
  body       text,
  entity_type text,
  entity_id  uuid,
  sent_at    timestamptz,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_unread_idx on notifications (created_at desc) where read_at is null;
