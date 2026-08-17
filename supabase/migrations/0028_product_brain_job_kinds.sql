/*
 * The two Product Brain job kinds, in the database's own list.
 *
 * `JOB_KINDS` in TypeScript and `jobs_kind_check` in Postgres are the same list
 * written twice — exactly as 0024 warned when it added the Explorer kinds, and
 * exactly the trap this phase fell into: both handlers were registered, both
 * policies declared, the whole thing typechecked, and the first real insert
 * failed on a constraint.
 *
 * It was caught by an E2E test clicking the button rather than by any unit
 * test, because a unit test over the TypeScript constant alone passes happily
 * while the database refuses every row.
 *
 * `collect_product_evidence` is scheduled weekly and costs plain HTTP.
 * `build_product_brain` is not scheduled: collection chains it when something
 * was actually collected, so the model calls happen when there is new evidence
 * rather than on a timer.
 */
alter table jobs drop constraint jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind in (
  'generate', 'render', 'tts', 'capture', 'publish',
  'collect_metrics', 'collect_signals', 'collect_comments', 'collect_attribution',
  'refresh_tokens', 'score_performance', 'digest_email', 'reconcile_schedule',
  'mark_stale_assets', 'collect_app_store', 'detect_release', 'collect_watch_terms',
  'draft_newsletter', 'send_newsletter', 'collect_reviews', 'review_media',
  'verify_feature', 'explore_product',
  'collect_product_evidence', 'build_product_brain'
));
