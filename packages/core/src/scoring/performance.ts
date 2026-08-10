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
  impressions: number;
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
  conversionScore: number;
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

export function engagementRate(input: ScoreInput): number {
  if (input.impressions <= 0) return 0;
  const engagements =
    (input.likes ?? 0) + (input.comments ?? 0) + (input.shares ?? 0) + (input.saves ?? 0);
  return engagements / input.impressions;
}

export function activatedPerThousand(input: ScoreInput): number {
  if (input.impressions <= 0) return 0;
  return ((input.activatedUsers ?? 0) / input.impressions) * 1000;
}

export function scorePosts(inputs: ScoreInput[]): PerformanceScore[] {
  const impressions = inputs.map((i) => i.impressions);
  const engagement = inputs.map(engagementRate);
  const conversion = inputs.map(activatedPerThousand);
  const anyAttribution = inputs.some((i) => (i.activatedUsers ?? 0) > 0);

  return inputs.map((input) => {
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
      conversionScore: Number(conversionScore.toFixed(4)),
      lowConfidence,
      notes,
    };
  });
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
    out.push(
      `Not enough data for a claim yet. Meaningful comparison needs about ${min} posts per category.`,
    );
  }
  return out;
}
