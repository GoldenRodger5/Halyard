-- Blotato and other unified providers acknowledge a publish before the social
-- platform settles it. Add an explicit reconciliation job so a submission
-- receipt can never be mistaken for a public post.

alter table jobs drop constraint if exists jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind = any (array[
  'generate','render','tts','capture','publish',
  'collect_metrics','collect_signals','collect_comments','collect_attribution',
  'refresh_tokens','score_performance','digest_email','reconcile_schedule',
  'reconcile_delivery','mark_stale_assets','collect_app_store','detect_release',
  'collect_watch_terms','draft_newsletter','send_newsletter','collect_reviews',
  'review_media','verify_feature','explore_product','cluster_rejections',
  'purge_logs','collect_product_evidence','build_product_brain',
  'verify_provider_capability','correct_content','learn_from_performance',
  'build_account_intelligence','generate_concepts'
]));

insert into schema_version (id, version, applied_at)
values (true, '0083', now())
on conflict (id) do update
  set version = excluded.version, applied_at = excluded.applied_at;
