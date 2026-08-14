/*
 * The two Explorer job kinds, in the database's own list.
 *
 * `JOB_KINDS` in TypeScript and `jobs_kind_check` in Postgres are the same list
 * written twice, and adding to one without the other is a bug that typechecks
 * cleanly and then fails at the first insert. Caught here by the scheduler
 * tests, which enqueue every scheduled kind against a real database — a unit
 * test over the TypeScript constant alone would have passed.
 *
 * `verify_feature` is scheduled (a slow sweep, one stale claim at a time).
 * `explore_product` deliberately is not: it costs model calls and may spend
 * product credits, so it stays a deliberate act rather than a background one.
 */
alter table jobs drop constraint jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind in (
  'generate', 'render', 'tts', 'capture', 'publish',
  'collect_metrics', 'collect_signals', 'collect_comments', 'collect_attribution',
  'refresh_tokens', 'score_performance', 'digest_email', 'reconcile_schedule',
  'mark_stale_assets', 'collect_app_store', 'detect_release', 'collect_watch_terms',
  'draft_newsletter', 'send_newsletter', 'collect_reviews', 'review_media',
  'verify_feature', 'explore_product'
));
