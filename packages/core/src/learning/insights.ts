/**
 * What the account actually taught us. §204.
 *
 * Halyard had a `learning` team with one agent in it, and that agent clustered
 * *operator rejections* — it learned what a human disliked before publication,
 * which is useful and is not the same thing as learning what an audience did
 * afterwards. Nothing read `post_metrics` and turned it into a belief, so every
 * creative decision was made from priors that no result could ever revise.
 *
 * ## The shape of the problem
 *
 * The temptation is a table of "insights" written by a model reading a
 * dashboard. That produces confident sentences with nothing behind them, and it
 * fails the only test that matters: whether a later decision changes because of
 * it. So this module is deterministic arithmetic over observations, and the
 * sentence is generated last, from numbers that already exist.
 *
 * ## Three honesties this inherits
 *
 * **`null` is unmeasured; `0` is measured zero** (gotcha 9). An unmeasured post
 * is excluded from both cohorts, not counted as a zero — the same rule
 * `performance.ts` already enforces, and for the same reason: a fabricated zero
 * moves the mean of every real observation beside it.
 *
 * **A single result is not a rule.** Status climbs `observed` → `inferred` →
 * `validated`, and the climb needs sample size *and* repetition across distinct
 * evidence windows. One post that did well produces an `observed` note with low
 * confidence, which is what it is.
 *
 * **Contradiction lowers confidence rather than being discarded.** `reconcile`
 * takes an existing belief and new evidence and moves the belief; it never
 * silently keeps the old direction, and it never silently overwrites it either.
 */

export type InsightScope = 'global' | 'platform' | 'account';

/**
 * How much weight a belief has earned.
 *
 * `observed` — seen, not yet enough to act on.
 * `inferred` — enough sample and a real effect; acted on with reduced weight.
 * `validated` — held up across separate windows; acted on at full weight.
 */
export type InsightStatus = 'observed' | 'inferred' | 'validated';

/** One published thing, its features, and what happened. */
export interface ContentObservation {
  contentItemId: string;
  platform: string;
  accountId: string;
  publishedAt: Date;
  /**
   * The creative decisions this content embodied — `creative_type`,
   * `hook_family`, `duration_bucket`, `posting_hour`, and so on.
   *
   * Deliberately open. A feature is anything a later decision could act on,
   * and constraining the set here would mean editing this file to learn about
   * something new.
   */
  features: Record<string, string | number | boolean | null | undefined>;
  /**
   * The normalised outcome, from `performance_scores`. **Null means the post
   * was never measured** and the observation is excluded, not zeroed.
   */
  score: number | null;
}

export interface InsightEvidence {
  /** Observations carrying the feature value. */
  supporting: string[];
  /** Observations without it, which the cohort is compared against. */
  contradicting: string[];
  windowStart: Date;
  windowEnd: Date;
}

export interface Insight {
  scope: InsightScope;
  /** Null at `global` scope; set at the scope it belongs to. */
  platform: string | null;
  accountId: string | null;
  feature: string;
  featureValue: string;
  /** Mean score of the cohort, and of everything else. */
  cohortMean: number;
  baselineMean: number;
  /** Relative difference. Positive means the feature did better. */
  lift: number;
  sampleSize: number;
  baselineSize: number;
  status: InsightStatus;
  confidence: number;
  /** How many distinct evidence windows have agreed. Drives `validated`. */
  corroborations: number;
  evidence: InsightEvidence;
  /** One line an operator can read, generated from the numbers above. */
  observation: string;
  /** What a later decision should do about it. */
  recommendation: string;
  /** When this should be recomputed rather than trusted. */
  reviewAfter: Date;
}

export interface InsightOptions {
  /**
   * Minimum cohort size before a belief can leave `observed`.
   *
   * Defaults to 20 to match `settings.learning_min_posts_per_category`, which
   * the analytics screens already use for exactly this judgement. One threshold,
   * two readers.
   */
  minSample?: number;
  /** Cohorts smaller than this are not even reported. */
  floorSample?: number;
  /** Relative lift treated as a full-strength effect. */
  fullEffect?: number;
  /** How long a belief stands before it wants recomputing. */
  freshnessDays?: number;
  now?: Date;
}

const DEFAULTS = {
  minSample: 20,
  floorSample: 3,
  fullEffect: 0.25,
  freshnessDays: 30,
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Confidence, from sample size and effect size together.
 *
 * Neither alone is worth anything: a huge effect on four posts is noise, and a
 * 2% difference over four hundred is real and useless. Multiplying them means a
 * belief needs both, and keeps the number explainable — which matters more here
 * than statistical sophistication nobody can audit. It is deliberately not a
 * p-value; calling it one would imply a test that was not run.
 */
export function confidenceFor(
  sampleSize: number,
  baselineSize: number,
  lift: number,
  options: InsightOptions = {},
): number {
  const { minSample, fullEffect } = { ...DEFAULTS, ...options };
  const effective = Math.min(sampleSize, baselineSize);
  const sampleFactor = Math.min(1, effective / minSample);
  const effectFactor = Math.min(1, Math.abs(lift) / fullEffect);
  return Math.round(sampleFactor * effectFactor * 100) / 100;
}

function statusFor(
  sampleSize: number,
  baselineSize: number,
  confidence: number,
  corroborations: number,
  options: InsightOptions = {},
): InsightStatus {
  const { minSample } = { ...DEFAULTS, ...options };
  const enough = Math.min(sampleSize, baselineSize) >= minSample;
  if (!enough || confidence < 0.3) return 'observed';
  /* Validated needs the pattern to have survived a second, separate window. */
  if (corroborations >= 2 && confidence >= 0.6) return 'validated';
  return 'inferred';
}

function describe(
  feature: string,
  value: string,
  lift: number,
  scope: InsightScope,
  where: string | null,
): { observation: string; recommendation: string } {
  const direction = lift >= 0 ? 'outperforms' : 'underperforms';
  const pct = Math.abs(Math.round(lift * 100));
  const place =
    scope === 'account' ? ` for ${where}` : scope === 'platform' ? ` on ${where}` : '';

  return {
    observation: `${feature} "${value}" ${direction} the rest by ${pct}%${place}.`,
    recommendation:
      lift >= 0
        ? `Prefer ${value} where the material supports it${place}.`
        : `Avoid defaulting to ${value}${place}; it is not carrying its slot.`,
  };
}

/**
 * Turn observations into beliefs, one feature at a time.
 *
 * Each distinct value of each feature becomes a cohort, compared against every
 * other observation in the same scope. Cohorts below `floorSample` are not
 * reported at all — not as low-confidence beliefs, not as anything, because a
 * two-post cohort produces a sentence that reads like knowledge.
 */
export function computeInsights(
  observations: ContentObservation[],
  scope: InsightScope,
  options: InsightOptions = {},
): Insight[] {
  const opts = { ...DEFAULTS, ...options };
  const now = options.now ?? new Date();

  /* `null` is unmeasured. Excluded, never zeroed. */
  const measured = observations.filter((o) => o.score !== null);
  if (measured.length === 0) return [];

  const features = new Set<string>();
  for (const o of measured) for (const k of Object.keys(o.features)) features.add(k);

  const insights: Insight[] = [];

  for (const feature of features) {
    const values = new Set<string>();
    for (const o of measured) {
      const v = o.features[feature];
      if (v !== null && v !== undefined) values.add(String(v));
    }

    for (const value of values) {
      const cohort = measured.filter((o) => String(o.features[feature] ?? '') === value);
      const baseline = measured.filter(
        (o) =>
          o.features[feature] !== null &&
          o.features[feature] !== undefined &&
          String(o.features[feature]) !== value,
      );

      if (cohort.length < opts.floorSample || baseline.length < opts.floorSample) continue;

      const cohortMean = mean(cohort.map((o) => o.score!));
      const baselineMean = mean(baseline.map((o) => o.score!));
      /* Relative to the baseline, so a lift is comparable across features. */
      const lift = baselineMean === 0 ? 0 : (cohortMean - baselineMean) / Math.abs(baselineMean);

      const confidence = confidenceFor(cohort.length, baseline.length, lift, opts);
      const status = statusFor(cohort.length, baseline.length, confidence, 1, opts);

      const times = measured.map((o) => o.publishedAt.getTime());
      const where =
        scope === 'account'
          ? (cohort[0]?.accountId ?? null)
          : scope === 'platform'
            ? (cohort[0]?.platform ?? null)
            : null;

      const { observation, recommendation } = describe(feature, value, lift, scope, where);

      insights.push({
        scope,
        platform: scope === 'global' ? null : (cohort[0]?.platform ?? null),
        accountId: scope === 'account' ? (cohort[0]?.accountId ?? null) : null,
        feature,
        featureValue: value,
        cohortMean: Math.round(cohortMean * 1000) / 1000,
        baselineMean: Math.round(baselineMean * 1000) / 1000,
        lift: Math.round(lift * 1000) / 1000,
        sampleSize: cohort.length,
        baselineSize: baseline.length,
        status,
        confidence,
        corroborations: 1,
        evidence: {
          supporting: cohort.map((o) => o.contentItemId),
          contradicting: baseline.map((o) => o.contentItemId),
          windowStart: new Date(Math.min(...times)),
          windowEnd: new Date(Math.max(...times)),
        },
        observation,
        recommendation,
        reviewAfter: new Date(now.getTime() + opts.freshnessDays * 86_400_000),
      });
    }
  }

  /* Strongest belief first: confidence, then the size of what it claims. */
  return insights.sort(
    (a, b) => b.confidence - a.confidence || Math.abs(b.lift) - Math.abs(a.lift),
  );
}

/**
 * Move an existing belief in the light of new evidence.
 *
 * Three cases, and the middle one is the reason this function exists:
 *
 *   · **Agreement** — same direction. Corroboration increments, and a belief
 *     that has now held across two windows can reach `validated`.
 *   · **Contradiction** — opposite direction. Confidence is cut rather than the
 *     belief being kept or replaced. A pattern that reverses is not a new fact,
 *     it is a weaker one, and the recorded contradiction is what a later reader
 *     needs in order to distrust it.
 *   · **First sighting** — nothing to reconcile; the incoming belief stands.
 *
 * Corroboration never survives a contradiction: a belief that flipped has not
 * held across two windows, whatever it did before.
 */
export function reconcileInsight(existing: Insight | null, incoming: Insight): Insight {
  if (!existing) return incoming;

  const agrees = Math.sign(existing.lift) === Math.sign(incoming.lift);

  if (agrees) {
    const corroborations = existing.corroborations + 1;
    /* Agreement raises confidence, but never past what the evidence supports. */
    const confidence = Math.min(1, Math.round((incoming.confidence + 0.1) * 100) / 100);
    return {
      ...incoming,
      corroborations,
      confidence,
      status: statusFor(
        incoming.sampleSize,
        incoming.baselineSize,
        confidence,
        corroborations,
      ),
      evidence: {
        ...incoming.evidence,
        supporting: [...new Set([...existing.evidence.supporting, ...incoming.evidence.supporting])],
      },
    };
  }

  /*
   * Contradiction. The new direction is reported, because it is what the latest
   * window says — but confidence is halved rather than inherited, corroboration
   * resets, and the belief drops out of `validated`. The old cohort is kept as
   * contradicting evidence so the disagreement is visible rather than tidied.
   */
  const confidence = Math.round(Math.min(existing.confidence, incoming.confidence) * 50) / 100;
  return {
    ...incoming,
    corroborations: 1,
    confidence,
    status: statusFor(incoming.sampleSize, incoming.baselineSize, confidence, 1),
    evidence: {
      ...incoming.evidence,
      contradicting: [
        ...new Set([...existing.evidence.supporting, ...incoming.evidence.contradicting]),
      ],
    },
    observation: `${incoming.observation} Reversed against earlier evidence.`,
  };
}

/**
 * Beliefs a decision is allowed to act on.
 *
 * `observed` is excluded: it is a note, not a finding. Stale beliefs are
 * excluded too — a pattern past its review date is a pattern nobody has checked
 * against recent behaviour, and §9 of the specification is explicit that trend
 * knowledge decays.
 */
export function actionableInsights(
  insights: Insight[],
  now: Date = new Date(),
  minConfidence = 0.3,
): Insight[] {
  return insights.filter(
    (i) =>
      i.status !== 'observed' &&
      i.confidence >= minConfidence &&
      i.reviewAfter.getTime() > now.getTime(),
  );
}
