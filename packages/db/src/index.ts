export * from './types.gen.js';
export * from './client.js';

export const PLATFORMS = ['x', 'instagram', 'tiktok', 'pinterest', 'youtube', 'threads'] as const;
export type Platform = (typeof PLATFORMS)[number];

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
  /** P1: fetch the product's public surfaces into product_evidence. No model. */
  'collect_product_evidence',
  /** P1: run the product intelligence agents over collected evidence. */
  'build_product_brain',
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
  score_performance: { timeoutMs: 5 * 60_000, maxAttempts: 2, backoffSeconds: 300 },
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
