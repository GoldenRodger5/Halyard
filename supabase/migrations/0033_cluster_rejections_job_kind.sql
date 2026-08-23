/*
 * The rejection clusterer's job kind.
 *
 * `rejection_clusters` had a complete consumer and no producer: the dashboard
 * reads it, `clusterActions.ts` promotes a cluster into `brand_voices`, and
 * `dont_rules` reaches the copywriter prompt. Nothing ever inserted a row, so
 * the one loop that learns from the operator's own rejections never closed.
 *
 * `JOB_KINDS` in TypeScript and `jobs_kind_check` here are the same list
 * written twice — see 0031. Both change together or the first insert fails.
 */
alter table jobs drop constraint jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind in (
  'generate', 'render', 'tts', 'capture', 'publish',
  'collect_metrics', 'collect_signals', 'collect_comments', 'collect_attribution',
  'refresh_tokens', 'score_performance', 'digest_email', 'reconcile_schedule',
  'mark_stale_assets', 'collect_app_store', 'detect_release', 'collect_watch_terms',
  'draft_newsletter', 'send_newsletter', 'collect_reviews', 'review_media',
  'verify_feature', 'explore_product',
  'collect_product_evidence', 'build_product_brain',
  'verify_provider_capability',
  'cluster_rejections'
));
