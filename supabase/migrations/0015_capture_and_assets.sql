-- ═══════════════════════════════════════════════════════════════════════════
-- 0015 — Milestone 41: capture, the asset library, and staleness
-- ═══════════════════════════════════════════════════════════════════════════

-- Captures carry where they came from, so a still can be traced back to the
-- flow and the app version that produced it. Without that, "is this screenshot
-- current?" is unanswerable and the answer defaults to yes.
alter table assets add column flow_id text;
alter table assets add column app_version text;
alter table assets add column captured_at timestamptz;
alter table assets add column source_url text;
alter table assets add column original_filename text;
alter table assets add column checksum text;
alter table assets add column alt_text text;
-- Archived rather than deleted: an asset may already be inside a published post.
alter table assets add column archived_at timestamptz;
alter table assets add column archived_reason text;

create index assets_tags_idx on assets using gin (tags);
create index assets_flow_idx on assets (flow_id, captured_at desc) where flow_id is not null;
create index assets_live_idx on assets (product_id, created_at desc) where archived_at is null;

/**
 * One row per capture run, successful or not.
 *
 * "Never record blind" needs a record of what was verified and when, otherwise
 * the weekly gate is a job that runs rather than a fact anyone can check.
 */
create table capture_runs (
  id             uuid primary key default gen_random_uuid(),
  product_id     text not null references products(id) on delete cascade,
  flow_id        text not null,
  mode           text not null check (mode in ('verify', 'capture')),
  ok             boolean not null,
  base_url       text not null,
  app_version    text,
  started_at     timestamptz not null default now(),
  duration_ms    int,
  -- Per-step outcomes, so a failure names the step rather than a line number.
  steps          jsonb not null default '[]'::jsonb,
  -- The wall-clock windows Remotion speed-ramps.
  ramps          jsonb not null default '[]'::jsonb,
  asset_ids      uuid[] not null default '{}',
  video_asset_id uuid references assets(id) on delete set null,
  summary        text not null,
  failure_screenshot_path text
);
create index capture_runs_recent_idx on capture_runs (flow_id, started_at desc);

-- The app version discovery last saw, so a release can be detected without
-- anyone remembering to say one happened.
alter table products add column observed_app_version text;
alter table products add column observed_app_version_at timestamptz;

/**
 * Assets attached by hand, as opposed to media the render pipeline produced.
 *
 * These are two different things and conflating them loses information:
 * `render_ids` holds *render* rows, which have a slide index, a quality and a
 * failure state. An asset picked out of the library has none of those — it is
 * simply a file the operator chose. Publishing sends both.
 */
alter table content_items add column attached_asset_ids uuid[] not null default '{}';

-- The staleness sweep is a job, so it needs to be a legal job kind.
alter table jobs drop constraint jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind in (
  'generate','render','tts','capture','publish','collect_metrics','collect_signals',
  'collect_comments','collect_attribution','refresh_tokens','score_performance',
  'digest_email','reconcile_schedule','mark_stale_assets','collect_app_store'
));

/**
 * Metrics are cumulative counts and cannot be negative.
 *
 * A seed that used `hashtext(x) % n` — which is negative for about half of all
 * inputs, because hashtext returns a signed int4 — put negative impressions into
 * this table, and /analytics rendered "−3,449 impressions per post" without
 * complaint. A constraint turns that class of mistake into a failed insert
 * rather than a plausible-looking chart.
 */
alter table post_metrics add constraint post_metrics_non_negative check (
  coalesce(impressions, 0) >= 0 and coalesce(reach, 0) >= 0 and
  coalesce(likes, 0) >= 0 and coalesce(comments, 0) >= 0 and
  coalesce(shares, 0) >= 0 and coalesce(saves, 0) >= 0 and
  coalesce(link_clicks, 0) >= 0 and coalesce(follows, 0) >= 0 and
  coalesce(video_views, 0) >= 0 and coalesce(profile_visits, 0) >= 0
);

alter table attribution add constraint attribution_non_negative check (
  coalesce(sessions, 0) >= 0 and coalesce(signups, 0) >= 0 and
  coalesce(activated_users, 0) >= 0 and coalesce(adaptations, 0) >= 0 and
  coalesce(saves, 0) >= 0 and coalesce(cook_starts, 0) >= 0 and
  coalesce(paid_conversions, 0) >= 0
);

select public.apply_admin_rls();
