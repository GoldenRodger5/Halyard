export * from './types.gen.js';
export * from './client.js';

/*
 * `PLATFORMS` and `Platform` used to live here, listing six platforms.
 *
 * They were a third copy of a list that already exists twice — `PlatformId` in
 * `@halyard/core/adapters/types.ts` and `social_accounts_platform_check` in the
 * database — and they had already drifted: both of the others include
 * `bluesky`, which has an adapter, a constraint entry and metric mappings. Any
 * caller reaching for "the platforms" from `@halyard/db` would have been handed
 * a list that silently omitted a connected platform.
 *
 * Nothing imported them, which is the only reason the drift cost nothing. They
 * are deleted rather than corrected: gotcha 1 in `CLAUDE.md` is about exactly
 * this shape, and the fix for a list written twice is not to write it a third
 * time. `PlatformId` is canonical, and `packages/db` cannot import it without
 * inverting the dependency — so `adapters.test.ts` now asserts that `PlatformId`
 * and the database constraint agree, which is the check that was missing.
 */

export const PERSONAS = ['founder', 'brand'] as const;
export type Persona = (typeof PERSONAS)[number];

export const CONTENT_CATEGORIES = [
  'transformation',
  'education',
  'community',
  'product',
  'founder_insight',
] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export const CONTENT_FORMATS = ['text', 'image', 'carousel', 'video', 'story', 'pin'] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

/** v1 §0 — capability gating is what makes "connect everything now" work. */
export const CAPABILITY_STATES = [
  'pending_auth',
  'draft_only',
  'live',
  'error',
  'disabled',
] as const;
export type CapabilityState = (typeof CAPABILITY_STATES)[number];

export const CONTENT_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'awaiting_manual_publish',
  'failed',
  'rejected',
  'archived',
  'expired',
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const JOB_KINDS = [
  'generate',
  'render',
  'tts',
  'capture',
  'publish',
  'collect_metrics',
  'collect_signals',
  'collect_comments',
  'collect_attribution',
  'refresh_tokens',
  'score_performance',
  'digest_email',
  'reconcile_schedule',
  'mark_stale_assets',
  'collect_app_store',
  'detect_release',
  'collect_watch_terms',
  'draft_newsletter',
  'send_newsletter',
  'collect_reviews',
  /** Milestone 52: look at what was actually rendered. */
  'review_media',
  /** Phase 3: replay a feature claim and decide whether it still holds. */
  'verify_feature',
  /** Phase 3: walk the product and propose claims for verification. */
  'explore_product',
  /**
   * Turn repeated rejections into a pattern the copywriter can be told about.
   * Deterministic: the model half is optional and only names an unknown group.
   */
  'cluster_rejections',
  /**
   * Applies `settings.log_retention_days` via `purge_operational_logs`. Does
   * nothing at all while that setting is null, which is the default.
   */
  'purge_logs',
  /** P1: fetch the product's public surfaces into product_evidence. No model. */
  'collect_product_evidence',
  /** P1: run the product intelligence agents over collected evidence. */
  'build_product_brain',
  /** P2: probe what a transport can actually do, and record the observation. */
  'verify_provider_capability',
  /**
   * §165: diagnose a failing QC verdict and apply the smallest correction that
   * addresses it. Re-enters the existing pipeline rather than driving a second
   * one, so this job decides and delegates; it renders nothing itself.
   */
  'correct_content',
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

/** v1 §6 — per-kind timeouts, retries and backoff. */
export const JOB_POLICY: Record<
  JobKind,
  { timeoutMs: number; maxAttempts: number; backoffSeconds: number }
> = {
  generate: { timeoutMs: 5 * 60_000, maxAttempts: 2, backoffSeconds: 60 },
  render: { timeoutMs: 15 * 60_000, maxAttempts: 3, backoffSeconds: 10 },
  tts: { timeoutMs: 2 * 60_000, maxAttempts: 3, backoffSeconds: 30 },
  // A capture drives a real browser through a real adaptation twice — once to
  // verify and once to record — so it gets far longer than anything else here.
  capture: { timeoutMs: 20 * 60_000, maxAttempts: 2, backoffSeconds: 300 },
  publish: { timeoutMs: 5 * 60_000, maxAttempts: 3, backoffSeconds: 60 },
  collect_metrics: { timeoutMs: 5 * 60_000, maxAttempts: 3, backoffSeconds: 300 },
  collect_signals: { timeoutMs: 5 * 60_000, maxAttempts: 2, backoffSeconds: 300 },
  collect_comments: { timeoutMs: 5 * 60_000, maxAttempts: 3, backoffSeconds: 120 },
  collect_attribution: { timeoutMs: 5 * 60_000, maxAttempts: 3, backoffSeconds: 300 },
  refresh_tokens: { timeoutMs: 2 * 60_000, maxAttempts: 2, backoffSeconds: 120 },
  // Frame sampling plus one describer call per frame. Slow, and worth waiting
  // for: it is the only thing that looks at the finished media.
  review_media: { timeoutMs: 5 * 60_000, maxAttempts: 2, backoffSeconds: 90 },
  /**
   * Decides and delegates. The expensive work — synthesis, render, review —
   * happens in the jobs this one enqueues, so it needs neither a long timeout
   * nor many attempts. Two, because a transient database error should not
   * strand an item mid-correction with no controller ever running again.
   */
  correct_content: { timeoutMs: 2 * 60_000, maxAttempts: 2, backoffSeconds: 30 },
  /**
   * A real browser walking a real product flow. Generous, like `capture`, and
   * for the same reason: the thing being measured is someone's live app, and a
   * timeout that fires early records a refutation that never happened.
   */
  verify_feature: { timeoutMs: 10 * 60_000, maxAttempts: 2, backoffSeconds: 600 },
  /**
   * A browser walking up to a dozen pages, with a model call on each. The
   * longest job here by design, and the rarest — the product does not change
   * hourly, and this reads someone's live app.
   */
  explore_product: { timeoutMs: 20 * 60_000, maxAttempts: 2, backoffSeconds: 3600 },
  /**
   * Several plain HTTP fetches of someone's public site. Retried more freely
   * than the model jobs because it costs nothing but bandwidth, and evidence
   * that was expensive to gather is what everything downstream rests on.
   */
  collect_product_evidence: { timeoutMs: 5 * 60_000, maxAttempts: 3, backoffSeconds: 300 },
  /**
   * Five model calls over the collected evidence. Not retried aggressively: a
   * second attempt re-reads the same evidence and costs the same tokens to
   * reach the same conclusion.
   */
  build_product_brain: { timeoutMs: 10 * 60_000, maxAttempts: 2, backoffSeconds: 600 },
  /**
   * A probe against a live provider API. Two attempts, not more: a probe that
   * fails is a *result* — it records `unavailable` or `error` and that is
   * information — so hammering it would turn one honest unknown into five.
   */
  verify_provider_capability: { timeoutMs: 10 * 60_000, maxAttempts: 2, backoffSeconds: 900 },
  score_performance: { timeoutMs: 5 * 60_000, maxAttempts: 2, backoffSeconds: 300 },
  cluster_rejections: { timeoutMs: 5 * 60_000, maxAttempts: 2, backoffSeconds: 600 },
  purge_logs: { timeoutMs: 10 * 60_000, maxAttempts: 2, backoffSeconds: 600 },
  digest_email: { timeoutMs: 2 * 60_000, maxAttempts: 2, backoffSeconds: 300 },
  reconcile_schedule: { timeoutMs: 2 * 60_000, maxAttempts: 2, backoffSeconds: 120 },
  mark_stale_assets: { timeoutMs: 2 * 60_000, maxAttempts: 2, backoffSeconds: 300 },
  // Apple's first report for a new request can take a day, so a "pending" result
  // is normal rather than a failure worth retrying quickly.
  collect_app_store: { timeoutMs: 5 * 60_000, maxAttempts: 2, backoffSeconds: 3600 },
  // One GET of a homepage. If it cannot finish in a minute the site is down,
  // which is its own signal.
  detect_release: { timeoutMs: 60_000, maxAttempts: 2, backoffSeconds: 600 },
  // Several public endpoints, politely paced. A failure is usually one source
  // being down, which the handler already survives.
  collect_watch_terms: { timeoutMs: 5 * 60_000, maxAttempts: 2, backoffSeconds: 1800 },
  draft_newsletter: { timeoutMs: 5 * 60_000, maxAttempts: 2, backoffSeconds: 600 },
  // One retry only. A half-sent newsletter is worse than a late one, and the
  // handler marks the row failed with the provider's reason either way.
  send_newsletter: { timeoutMs: 10 * 60_000, maxAttempts: 2, backoffSeconds: 300 },
  collect_reviews: { timeoutMs: 5 * 60_000, maxAttempts: 2, backoffSeconds: 1800 },
};
