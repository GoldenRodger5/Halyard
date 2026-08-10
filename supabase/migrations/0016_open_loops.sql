-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 — Milestone 43: close every open loop
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. The GitHub connector was written but never selectable ───────────────
--
-- `GitHubConnector` has existed since round 2 and `products.connector_type`
-- only ever allowed mcp, rest or none, so no product could be configured to use
-- it. A product-less repo — anything shipped without a public API — is exactly
-- the case it serves.
alter table products drop constraint products_connector_type_check;
alter table products add constraint products_connector_type_check
  check (connector_type in ('mcp', 'rest', 'github', 'none'));

/**
 * Platform review submissions. Milestone 43, and round 3 A.2.
 *
 * Every platform except X and Bluesky gates public posting behind a manual
 * review that takes weeks of wall-clock time nobody can compress. "Blocked on
 * review" is only a real answer if the submission date is written down, so this
 * is where it lives — one row per submission per platform, with what was sent
 * and what came back.
 */
create table review_submissions (
  id              uuid primary key default gen_random_uuid(),
  product_id      text not null references products(id) on delete cascade,
  platform        text not null,
  -- What is being asked for: Meta App Review, the TikTok audit, Pinterest
  -- Standard access, the YouTube compliance audit.
  review_name     text not null,
  status          text not null default 'not_started'
                  check (status in ('not_started','preparing','submitted','changes_requested',
                                    'approved','rejected','abandoned')),
  submitted_at    timestamptz,
  decided_at      timestamptz,
  -- Their words, not a paraphrase.
  decision_notes  text,
  -- What the submission needed: a screen recording, a privacy policy URL, scopes.
  requirements    jsonb not null default '[]'::jsonb,
  demo_asset_id   uuid references assets(id) on delete set null,
  external_url    text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (product_id, platform, review_name)
);
create trigger review_submissions_touch before update on review_submissions
  for each row execute function public.touch_updated_at();

-- Backfill for a database that already has products. A fresh database gets these
-- from seed.sql, which runs *after* every migration — this is the third time
-- that ordering has caught a product-scoped insert (DECISIONS §12), so the rule
-- is now explicit: migrations backfill existing rows, seed.sql is the source.
insert into review_submissions (product_id, platform, review_name, requirements)
select p.id, v.platform, v.review_name, v.requirements::jsonb
  from products p
 cross join (values
   ('instagram', 'Meta App Review',
    '["instagram_content_publish scope","A screen recording of the whole OAuth flow","A public privacy policy URL","A working test account for the reviewer"]'),
   ('threads', 'Meta App Review — Threads API',
    '["threads_content_publish scope","Threads API product added to the app","Same recording and privacy policy as Instagram"]'),
   ('tiktok', 'Content Posting API audit',
    '["A screen recording showing the full publish flow","Verified URL ownership for the media domain","Assume rejection for an internal tool"]'),
   ('pinterest', 'Trial to Standard access',
    '["A screen recording showing the OAuth flow AND a real API call","A business account","At least one board"]'),
   ('youtube', 'API Services compliance audit',
    '["A demo video of the OAuth flow","A privacy policy URL","Answers on data retention and deletion"]')
 ) as v(platform, review_name, requirements)
 where p.kind = 'product'
on conflict (product_id, platform, review_name) do nothing;

-- ── 2. Rejection clusters need a lifecycle, not just a row ─────────────────
--
-- `rejectionClusters.ts` has been computing these since round 2 and nothing
-- ever displayed one. Accepting a cluster writes a real slop rule, so the
-- accepted rule is recorded here rather than only inside content_rules.
alter table rejection_clusters add column accepted_rule text;
alter table rejection_clusters add column accepted_at timestamptz;

-- ── 3. Watch terms produce signals ─────────────────────────────────────────
--
-- A single hit is noise. The same question asked three times is a content idea,
-- so promotion to a signal is by recurrence rather than by arrival.
alter table watch_hits add column promoted_at timestamptz;
alter table watch_terms add column min_occurrences int not null default 3;
alter table watch_terms add column last_hit_count int not null default 0;

create index watch_hits_question_idx on watch_hits (product_id, question, seen_at desc)
  where question = true;

-- The watch pass is a job kind.
alter table jobs drop constraint jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind in (
  'generate','render','tts','capture','publish','collect_metrics','collect_signals',
  'collect_comments','collect_attribution','refresh_tokens','score_performance',
  'digest_email','reconcile_schedule','mark_stale_assets','collect_app_store',
  'detect_release','collect_watch_terms'
));

select public.apply_admin_rls();
