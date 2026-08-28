-- §218. The concept stage becomes a job kind.
--
-- Gotcha 1: this list and JOB_KINDS in packages/db/src/index.ts are the same
-- list written twice, and only handlerCoverage.test.ts notices a divergence.
alter table jobs drop constraint if exists jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind = any (array[
  'generate', 'render', 'tts', 'capture', 'publish', 'collect_metrics',
  'collect_signals', 'collect_comments', 'collect_attribution', 'refresh_tokens',
  'score_performance', 'digest_email', 'reconcile_schedule', 'mark_stale_assets',
  'collect_app_store', 'detect_release', 'collect_watch_terms', 'draft_newsletter',
  'send_newsletter', 'collect_reviews', 'review_media', 'verify_feature',
  'explore_product', 'cluster_rejections', 'purge_logs',
  'collect_product_evidence', 'build_product_brain', 'verify_provider_capability',
  'correct_content', 'learn_from_performance', 'build_account_intelligence',
  'generate_concepts'
]));
