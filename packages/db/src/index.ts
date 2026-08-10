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
  score_performance: { timeoutMs: 5 * 60_000, maxAttempts: 2, backoffSeconds: 300 },
  digest_email: { timeoutMs: 2 * 60_000, maxAttempts: 2, backoffSeconds: 300 },
  reconcile_schedule: { timeoutMs: 2 * 60_000, maxAttempts: 2, backoffSeconds: 120 },
  mark_stale_assets: { timeoutMs: 2 * 60_000, maxAttempts: 2, backoffSeconds: 300 },
  // Apple's first report for a new request can take a day, so a "pending" result
  // is normal rather than a failure worth retrying quickly.
  collect_app_store: { timeoutMs: 5 * 60_000, maxAttempts: 2, backoffSeconds: 3600 },
};
