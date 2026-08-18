/*
 * The capability probe job kind, in the database's own list.
 *
 * `JOB_KINDS` in TypeScript and `jobs_kind_check` in Postgres are the same list
 * written twice — the trap 0024 warned about and 0028 fell into anyway. Adding
 * to one without the other typechecks cleanly and fails at the first insert.
 * `handlerCoverage.test.ts` compares the two against a real database, which is
 * the only thing that catches it.
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
  'verify_provider_capability'
));
