/**
 * Performance scoring. v1 §9 — deliberately conversion-weighted.
 *
 *   score = 0.15 × normalise(impressions)
 *         + 0.25 × normalise(engagement_rate)
 *         + 0.60 × normalise(activated_users_per_1k_impressions)
 *
 * Below roughly 1,000 impressions the score is shown greyed with "low
 * confidence", because a 5× difference on 40 impressions is noise.
 */

export interface ScoreInput {
  contentItemId: string;
  /**
   * **Null means unmeasured.** Zero means measured, and zero.
   *
   * The handler feeding this used `Number(row.impressions ?? 0)`, so a
   * published post whose metrics had never been collected — no `post_metrics`
   * row at all — arrived here indistinguishable from one the platform had
   * genuinely reported zero impressions for. It got a real score, a real
   * percentile, and a row in `performance_scores`.
   *
   * That is worse than one wrong score. `percentileRank` is computed over the
   * cohort, so every fabricated zero moves the score of every *measured* post
   * in the same run. Unmeasured posts are now excluded from both the population
   * and the output.
   */
  impressions: number | null;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  follows?: number;
  linkClicks?: number;
  activatedUsers?: number;
}

export interface PerformanceScore {
  contentItemId: string;
  score: number;
  reachScore: number;
  engagementScore: number;
  /**
   * Null when no attribution exists at all.
   *
   * `percentileRank(0, [0,0,0])` is **0.5** — ranking zeros against zeros
   * produces a confident-looking middle. That number is not a measurement, and
   * storing it made `conversion_score` indistinguishable from a post that
   * genuinely converted at the cohort median.
   *
   * Harmless while *nothing* has attribution, because the weight is zero and
   * every value is the same. It stops being harmless the moment attribution is
   * partial: §86's `historicalConversion` averages `conversion_score` per
   * category, and an average mixing real percentiles with synthetic 0.5s is a
   * number with no meaning that the idea scorer would treat as evidence.
   *
   * Null is what §68 established for exactly this: unmeasured is not zero, and
   * it is not the middle either.
   */
  conversionScore: number | null;
  lowConfidence: boolean;
  notes: string;
}

export const LOW_CONFIDENCE_IMPRESSIONS = 1000;

export const SCORE_WEIGHTS = { reach: 0.15, engagement: 0.25, conversion: 0.6 } as const;

/**
 * Percentile rank within the cohort, which is the only normalisation that is
 * meaningful across platforms with wildly different impression scales. A single
 * post scores 0.5 rather than 1.0 — one data point is not a leader.
 */
export function percentileRank(value: number, population: number[]): number {
  if (population.length <= 1) return 0.5;
  const below = population.filter((v) => v < value).length;
  const equal = population.filter((v) => v === value).length;
  return (below + equal / 2) / population.length;
}

/**
 * Not all engagement is equal. A save is worth two to three times a like to the
 * algorithm, and a share more again, so the rate is weighted rather than a flat
 * count. Milestone 27, Part D.
 *
 * The weights are stated here rather than buried in the formula so they can be
 * argued with.
 */
export const ENGAGEMENT_WEIGHTS = {
  like: 1,
  comment: 2,
  share: 3,
  /** Saves are the strongest available signal short of a follow. */
  save: 2.5,
  follow: 5,
} as const;

export function engagementRate(input: ScoreInput): number {
  if (input.impressions === null || input.impressions <= 0) return 0;
  const weighted =
    (input.likes ?? 0) * ENGAGEMENT_WEIGHTS.like +
    (input.comments ?? 0) * ENGAGEMENT_WEIGHTS.comment +
    (input.shares ?? 0) * ENGAGEMENT_WEIGHTS.share +
    (input.saves ?? 0) * ENGAGEMENT_WEIGHTS.save +
    (input.follows ?? 0) * ENGAGEMENT_WEIGHTS.follow;
  return weighted / input.impressions;
}

/** Unweighted, for display next to the weighted number. */
export function rawEngagementRate(input: ScoreInput): number {
  if (input.impressions === null || input.impressions <= 0) return 0;
  const engagements =
    (input.likes ?? 0) + (input.comments ?? 0) + (input.shares ?? 0) + (input.saves ?? 0);
  return engagements / input.impressions;
}

export function activatedPerThousand(input: ScoreInput): number {
  if (input.impressions === null || input.impressions <= 0) return 0;
  return ((input.activatedUsers ?? 0) / input.impressions) * 1000;
}

/**
 * Score every post that has actually been measured.
 *
 * Posts with `impressions: null` are **excluded entirely** — not scored zero,
 * not scored 0.5, not included in the cohort. Nothing is known about them, and
 * a score is a claim. `scorePosts` returning fewer rows than it was given is the
 * correct shape of that: the caller writes no `performance_scores` row, and the
 * post has no score rather than a wrong one.
 *
 * Use `unmeasured()` to find out how many were dropped, so a silently empty
 * scoring run is distinguishable from one with nothing to do.
 */
export function scorePosts(inputs: ScoreInput[]): PerformanceScore[] {
  const measured = inputs.filter(
    (i): i is ScoreInput & { impressions: number } => i.impressions !== null,
  );
  const impressions = measured.map((i) => i.impressions);
  const engagement = measured.map(engagementRate);
  const conversion = measured.map(activatedPerThousand);
  const anyAttribution = measured.some((i) => (i.activatedUsers ?? 0) > 0);

  return measured.map((input) => {
    const reachScore = percentileRank(input.impressions, impressions);
    const engagementScore = percentileRank(engagementRate(input), engagement);
    const conversionScore = percentileRank(activatedPerThousand(input), conversion);

    // With no attribution data at all, a conversion percentile is 0.5 for
    // everything and the weighting is meaningless. Redistribute rather than
    // pretending the number means something.
    const weights = anyAttribution
      ? SCORE_WEIGHTS
      : { reach: 0.35, engagement: 0.65, conversion: 0 };

    const score =
      weights.reach * reachScore +
      weights.engagement * engagementScore +
      weights.conversion * conversionScore;

    const lowConfidence = input.impressions < LOW_CONFIDENCE_IMPRESSIONS;

    const notes = !anyAttribution
      ? 'No attribution data yet, so the score is reach and engagement only. Conversion is the number that should decide strategy.'
      : lowConfidence
        ? `Only ${input.impressions} impressions. Treat the score as indicative.`
        : '';

    return {
      contentItemId: input.contentItemId,
      score: Number(score.toFixed(4)),
      reachScore: Number(reachScore.toFixed(4)),
      engagementScore: Number(engagementScore.toFixed(4)),
      conversionScore: anyAttribution ? Number(conversionScore.toFixed(4)) : null,
      lowConfidence,
      notes,
    };
  });
}

/**
 * The posts `scorePosts` refused to score, and why the count matters.
 *
 * "Nothing was scored because nothing is published" and "nothing was scored
 * because collection has never run" are different problems with different
 * fixes, and a scoring pass that reports neither looks identical in both cases.
 */
export function unmeasured(inputs: ScoreInput[]): string[] {
  return inputs.filter((i) => i.impressions === null).map((i) => i.contentItemId);
}

/**
 * v2 I.6 — good content can run again after 45 to 90 days, re-cut rather than
 * reposted identically. A strong post earns the shorter cooldown.
 */
export function repostEligibleAt(publishedAt: Date, score: number): Date {
  const days = score >= 0.8 ? 45 : score >= 0.6 ? 60 : 90;
  return new Date(publishedAt.getTime() + days * 86_400_000);
}

/**
 * v1 §8 — the opportunities panel. Written from data rather than by a model
 * where the comparison is arithmetic; the model only writes prose when there is
 * something real to say.
 */
export interface OpportunityInput {
  byCategory: Array<{ category: string; posts: number; activatedPer1k: number }>;
  byPlatform: Array<{ platform: string; posts: number; activatedPer1k: number; linkClicks: number }>;
  minPostsForClaim?: number;
}

export function findOpportunities(input: OpportunityInput): string[] {
  const min = input.minPostsForClaim ?? 20;
  const out: string[] = [];

  const categories = input.byCategory.filter((c) => c.posts >= min);
  if (categories.length >= 2) {
    const sorted = [...categories].sort((a, b) => b.activatedPer1k - a.activatedPer1k);
    const best = sorted[0]!;
    const worst = sorted[sorted.length - 1]!;
    if (worst.activatedPer1k > 0) {
      const ratio = best.activatedPer1k / worst.activatedPer1k;
      if (ratio >= 1.5) {
        out.push(
          `${best.category} converted ${ratio.toFixed(1)}× better than ${worst.category} over the window.`,
        );
      }
    }
  }

  const platforms = input.byPlatform.filter((p) => p.posts >= Math.ceil(min / 2));
  if (platforms.length >= 2) {
    const sorted = [...platforms].sort((a, b) => b.activatedPer1k - a.activatedPer1k);
    const best = sorted[0]!;
    const other = sorted.find((p) => p.platform !== best.platform && p.activatedPer1k > 0);
    if (other) {
      const ratio = best.activatedPer1k / other.activatedPer1k;
      const volumeRatio = other.posts / Math.max(best.posts, 1);
      if (ratio >= 1.5) {
        out.push(
          `${best.platform} link clicks convert at ${ratio.toFixed(1)}× ${other.platform}, on ${
            volumeRatio >= 2 ? `one-${Math.round(volumeRatio)}th the volume` : 'comparable volume'
          }.`,
        );
      }
    }
  }

  if (out.length === 0) {
    // "Not enough data" and "enough data, no difference worth acting on" are
    // different findings, and only one of them means keep waiting. Saying the
    // first when the second is true tells the operator to keep collecting
    // evidence they already have.
    const comparable = categories.length >= 2 || platforms.length >= 2;
    out.push(
      comparable
        ? `Nothing stands out yet. There is enough data to compare — ${categories.length} categories and ${platforms.length} platforms above the threshold — and no category or platform is running 1.5× another. That is a real finding, not a gap: it means the mix is not the lever right now.`
        : `Not enough data for a claim yet. Meaningful comparison needs about ${min} posts per category, and the busiest has ${Math.max(0, ...input.byCategory.map((c) => c.posts))}.`,
    );
  }
  return out;
}
