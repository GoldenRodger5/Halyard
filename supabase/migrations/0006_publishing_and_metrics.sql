-- ═══════════════════════════════════════════════════════════════════════════
-- 0006 — Publications, metrics, attribution, scoring, audit
-- v1 §2, v1 §9
-- ═══════════════════════════════════════════════════════════════════════════

create table publications (
  id                uuid primary key default gen_random_uuid(),
  content_item_id   uuid not null references content_items(id) on delete cascade,
  account_id        uuid not null references social_accounts(id),
  platform          text not null,
  platform_post_id  text,
  permalink         text,
  publish_mode      text not null check (publish_mode in ('direct','draft')),
  manual_publish_url text,                          -- deep link for draft_only mode
  published_at      timestamptz,
  error             text,
  raw_response      jsonb,
  -- build pack §3: "publish succeeded but response was malformed" → success with
  -- unknown id, flagged for manual reconciliation. Never retried.
  needs_reconciliation boolean not null default false,
  -- v2 A.2 / I.2: X carries its link in a first reply, tracked as its own post.
  link_reply_post_id text,
  created_at        timestamptz not null default now()
);

-- ── Idempotency, the bug that must never ship ──────────────────────────────
-- Two layers:
--   1. one publication row per (content_item, account), regardless of outcome
--   2. one platform post id per account
create unique index publications_item_account_uniq
  on publications (content_item_id, account_id);
create unique index publications_platform_post_uniq
  on publications (account_id, platform_post_id)
  where platform_post_id is not null;

create table post_metrics (
  id              uuid primary key default gen_random_uuid(),
  publication_id  uuid not null references publications(id) on delete cascade,
  collected_at    timestamptz not null default now(),
  impressions int, reach int, likes int, comments int, shares int,
  saves int, video_views int, watch_time_seconds int,
  profile_visits int, link_clicks int,
  -- v2 I.9: follower growth per post is the signal; follower count is vanity
  follows int,
  raw jsonb,
  -- v2 A.5 / build pack §9: Pinterest's terms bar caching most API data.
  -- Rows carry their own purge deadline and a retention job enforces it.
  purge_after     timestamptz
);
create index post_metrics_series_idx on post_metrics (publication_id, collected_at desc);
create index post_metrics_purge_idx on post_metrics (purge_after) where purge_after is not null;

-- Pulled from PostHog, keyed on utm_content = content_item_id (v1 §9)
create table attribution (
  id                uuid primary key default gen_random_uuid(),
  content_item_id   uuid not null references content_items(id) on delete cascade,
  collected_at      timestamptz not null default now(),
  sessions int, signups int, activated_users int,
  adaptations int, saves int, cook_starts int, paid_conversions int
);
create index attribution_item_idx on attribution (content_item_id, collected_at desc);

create table performance_scores (
  content_item_id  uuid primary key references content_items(id) on delete cascade,
  score            numeric not null,
  reach_score      numeric,
  engagement_score numeric,
  conversion_score numeric,
  -- v1 §9: below ~1,000 impressions the score is shown greyed, "low confidence"
  low_confidence   boolean not null default true,
  computed_at      timestamptz not null default now(),
  notes            text
);

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor       text not null check (actor in ('human','system','worker')),
  action      text not null,
  entity_type text,
  entity_id   uuid,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_recent_idx on audit_log (created_at desc);
create index audit_log_entity_idx on audit_log (entity_type, entity_id, created_at desc);
