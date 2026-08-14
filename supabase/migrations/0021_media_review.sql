-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 — Reviewing what was actually rendered
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * A job that looks at the finished media.
 *
 * QC runs at *draft* time, on text, and that is where it has always run. The
 * visual and audio gates were built to read a probe of the rendered file — and
 * **no production code path has ever supplied one.** `runAllGates` takes
 * `visual` and `audio` as optional inputs; the render handler writes an asset
 * row and stops. So two of the gates have been structurally unable to run since
 * they were written, and the third, `visionScore`, was never populated either.
 *
 * The failure shape is the familiar one: an optional input that nobody provides
 * produces a gate that never objects, which reads exactly like a gate that
 * examined the media and found it fine.
 *
 * This job closes it. When every render for a content item is done, it probes
 * the file, samples frames, has them described, and runs the visual, audio and
 * coherence gates against what was actually produced rather than against what
 * was requested.
 */
alter table jobs drop constraint jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind in (
  'generate','render','tts','capture','publish','collect_metrics','collect_signals',
  'collect_comments','collect_attribution','refresh_tokens','score_performance',
  'digest_email','reconcile_schedule','mark_stale_assets','collect_app_store',
  'detect_release','collect_watch_terms','draft_newsletter','send_newsletter',
  'collect_reviews','review_media'
));

/**
 * What the describers observed, kept for the queue detail view.
 *
 * Stored rather than recomputed because a description costs a model call, and
 * because an operator asking "why did this fail" deserves to see the frame
 * descriptions that produced the verdict rather than a rule name.
 */
alter table content_items add column media_observations jsonb;

select public.apply_admin_rls();
