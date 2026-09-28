-- 0097 — autonomous editorial controller
--
-- The controller itself is deterministic/free. It chooses signal → account →
-- strategy before delegating to the existing generate pipeline. Public
-- publishing remains governed by the existing approval boundary and global
-- publishing_enabled kill switch.

-- Discovery terms may be operator-owned or Product-Brain-managed. Halyard
-- refreshes only the latter; a manual term is never overwritten or disabled
-- by an automatic Brain rebuild.
alter table watch_terms
  add column if not exists managed_by text,
  add column if not exists source_fact_ids uuid[] not null default '{}';

alter table watch_terms drop constraint if exists watch_terms_managed_by_check;
alter table watch_terms add constraint watch_terms_managed_by_check
  check (managed_by is null or managed_by in ('product_brain'));

alter table jobs drop constraint if exists jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind = any (array[
  'generate','render','tts','capture','publish',
  'collect_metrics','collect_signals','collect_comments','collect_attribution',
  'refresh_tokens','score_performance','digest_email','reconcile_schedule',
  'reconcile_delivery','generate_external_visual',
  'mark_stale_assets','collect_app_store','detect_release',
  'collect_watch_terms','draft_newsletter','send_newsletter','collect_reviews',
  'review_media','verify_feature','explore_product','cluster_rejections',
  'purge_logs','collect_product_evidence','build_product_brain',
  'verify_provider_capability','correct_content','learn_from_performance',
  'build_account_intelligence','generate_concepts','plan_editorial'
]));

insert into schema_version (id, version, applied_at)
values (true, '0097', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
