/*
 * The retention *window*, as an operator setting rather than a constant.
 *
 * 0035 built `purge_operational_logs(interval)` and deliberately gave it no
 * schedule and no number, because how long Halyard keeps an operator's data is
 * a product and legal question. That left a capability nobody could reach
 * without opening psql.
 *
 * This is the mechanism around it, still without answering the question:
 *
 *  · `null` — the default — means keep everything. No purge runs. Choosing
 *    that as the default is not a retention policy; it is the absence of one,
 *    which is the honest state until someone decides.
 *  · a number of days means the operator has decided, and the scheduled job
 *    enforces exactly what they chose.
 *
 * `audit_log` is out of scope either way: `purge_operational_logs` never
 * deletes from it, because what a human decided is a compliance record rather
 * than operational exhaust. Sentry has its own retention, set in the Sentry
 * project and not reachable from here at all.
 */
alter table settings
  add column log_retention_days integer
    check (log_retention_days is null or log_retention_days between 1 and 3650);

comment on column settings.log_retention_days is
  'Operator-chosen retention for operational logs (jobs, notifications, agent_runs, capability_probes). NULL means keep everything — the absence of a policy, not a policy. Never applies to audit_log.';

-- The job that applies it. Both lists change together, per gotcha 1.
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
  'cluster_rejections', 'purge_logs'
));
