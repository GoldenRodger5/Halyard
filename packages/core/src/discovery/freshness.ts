/**
 * Discovery decays. §206.
 *
 * `signals` carried `relevance` and `created_at`, and `generate` selected from
 * them with `order by relevance desc nulls last, created_at desc`. Relevance is
 * the primary key of that sort, so **a six-month-old trend scored 0.9 outranks
 * today's scored 0.7, permanently.** A trend that has finished is not a weaker
 * opportunity than a fresh one; it is not an opportunity.
 *
 * §9 of the specification names this directly: "Do not reuse stale trends
 * merely because they exist in memory."
 *
 * ## Why a half-life per source rather than one expiry
 *
 * The sources age at genuinely different rates and flattening them would be
 * wrong in both directions. A platform trend is worthless in a week. A shipped
 * changelog entry is just as true a month later — the product still does the
 * thing. Giving both a thirty-day window keeps dead trends alive; giving both
 * three days throws away durable material.
 *
 * A seasonal signal is different again: it has a date rather than a decay, so it
 * is worth full value right up to its window and nothing after. That is
 * `expiresAt`, which any signal may carry and which overrides the curve.
 *
 * ## Velocity
 *
 * A trend that is still accelerating is worth more than one at the same size
 * that has stalled, and neither is visible from `relevance`. Optional, because
 * most sources cannot measure it, and absent means "no adjustment" rather than
 * "no growth" — the same distinction between unmeasured and zero that
 * `performance.ts` holds (gotcha 9).
 *
 * Pure. No clock of its own, no database — `now` is supplied so the curve is
 * testable at any point on it.
 */

export type SignalSource =
  | 'product_activity'
  | 'changelog'
  | 'editorial'
  | 'seasonal'
  | 'trend'
  | 'performance'
  | 'submission';

/**
 * Days for a signal's value to halve, by source.
 *
 * These are judgements about how the world works, not tuning constants, and
 * each is defensible in a sentence:
 */
export const HALF_LIFE_DAYS: Record<SignalSource, number> = {
  /** A platform trend is stale in a week and dead in two. */
  trend: 3,
  /** A conversation moves on, but the topic underneath lingers. */
  editorial: 14,
  /** Handled by `expiresAt`; the curve is a long backstop. */
  seasonal: 60,
  /** The product still does the thing a month later. */
  changelog: 45,
  product_activity: 30,
  /** A performance observation ages with the account's behaviour. */
  performance: 21,
  /** Someone took the trouble to send it; it keeps. */
  submission: 45,
};

export const DEFAULT_HALF_LIFE_DAYS = 14;

export interface DiscoverySignal {
  id: string;
  source: string;
  /** 0..1. Null means unscored, which is not the same as irrelevant. */
  relevance: number | null;
  /** When the thing was observed, which may predate the row. */
  observedAt: Date;
  /** A hard window, for signals that have one. Overrides the curve. */
  expiresAt?: Date | null;
  /** 0..1 in how much the observation is trusted. Null means unrecorded. */
  confidence?: number | null;
  /**
   * Rate of change where it could be measured. Positive is accelerating.
   * Null means unmeasured, and unmeasured is not zero.
   */
  velocity?: number | null;
  platform?: string | null;
}

const DAY_MS = 86_400_000;

/** How much of a signal's value survives to `now`. 1 at observation, → 0. */
export function freshness(signal: DiscoverySignal, now: Date = new Date()): number {
  if (signal.expiresAt && now.getTime() > signal.expiresAt.getTime()) return 0;

  const ageDays = Math.max(0, (now.getTime() - signal.observedAt.getTime()) / DAY_MS);
  const halfLife = HALF_LIFE_DAYS[signal.source as SignalSource] ?? DEFAULT_HALF_LIFE_DAYS;
  /* Exponential, so value falls fast at first and never quite reaches zero. */
  return Math.pow(0.5, ageDays / halfLife);
}

/**
 * A signal past its window, or decayed below the point of being worth a look.
 *
 * Named `isSignalStale` rather than `isStale` because `explorer/verify.ts`
 * already exports one, about a feature claim rather than a signal. Both are
 * re-exported from the core barrel, so the collision is a build error rather
 * than a subtle wrong import — which is the better failure.
 */
export const STALE_THRESHOLD = 0.05;

export function isSignalStale(signal: DiscoverySignal, now: Date = new Date()): boolean {
  return freshness(signal, now) < STALE_THRESHOLD;
}

/**
 * What a signal is actually worth right now.
 *
 * Relevance times freshness, then adjusted for confidence and velocity. Order
 * matters: freshness multiplies rather than subtracts, so a stale signal cannot
 * be rescued by a high relevance — which is exactly the failure being fixed.
 *
 * An unscored signal is treated as middling rather than worthless. `null`
 * relevance means nobody scored it, and dropping those would silently discard
 * every signal from a source that does not score.
 */
export function effectiveValue(signal: DiscoverySignal, now: Date = new Date()): number {
  const relevance = signal.relevance ?? 0.5;
  const base = relevance * freshness(signal, now);

  /* Unrecorded confidence is not low confidence. */
  const confidence = signal.confidence ?? 1;

  /*
   * Velocity is a modest tilt, not a multiplier — a trend that is accelerating
   * is worth more than a stalled one of the same size, and never worth more
   * than a highly relevant signal that is merely flat. Capped both ways so a
   * runaway measurement cannot dominate the ranking.
   */
  const tilt = signal.velocity == null ? 1 : 1 + Math.max(-0.3, Math.min(0.3, signal.velocity));

  return Math.round(base * confidence * tilt * 10_000) / 10_000;
}

/**
 * Rank signals by present worth, dropping the stale ones.
 *
 * Returns fewer than it was given, deliberately. A caller that wants twenty
 * signals and gets four has four worth acting on, and padding the list with
 * expired trends to reach a count is how they get published.
 */
export function rankSignals<T extends DiscoverySignal>(
  signals: T[],
  now: Date = new Date(),
  limit?: number,
): Array<T & { effectiveValue: number }> {
  const ranked = signals
    .filter((s) => !isSignalStale(s, now))
    .map((s) => ({ ...s, effectiveValue: effectiveValue(s, now) }))
    .sort((a, b) => b.effectiveValue - a.effectiveValue);
  return limit === undefined ? ranked : ranked.slice(0, limit);
}

/**
 * When a signal stops being worth acting on, for storage.
 *
 * Written at collection so a reader can filter in SQL without recomputing the
 * curve. The curve remains authoritative — this is a materialised convenience,
 * and `isSignalStale` is what decides.
 */
export function expiryFor(
  source: string,
  observedAt: Date,
  explicit?: Date | null,
): Date {
  if (explicit) return explicit;
  const halfLife = HALF_LIFE_DAYS[source as SignalSource] ?? DEFAULT_HALF_LIFE_DAYS;
  /* Where the curve crosses STALE_THRESHOLD: log0.5(0.05) ≈ 4.32 half-lives. */
  const lives = Math.log(STALE_THRESHOLD) / Math.log(0.5);
  return new Date(observedAt.getTime() + halfLife * lives * DAY_MS);
}
