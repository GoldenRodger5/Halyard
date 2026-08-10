/**
 * What is not yet knowable, said out loud. Milestone 51.
 *
 * On day one there is no performance data, no audience and no history. The
 * system has to be useful anyway, and it must not pretend otherwise.
 *
 * The failure mode this file exists to prevent is not a wrong number — it is a
 * *confident* number. A best-posting-time of 08:40 rendered identically whether
 * it came from four hundred posts or from a default nobody has ever tested is a
 * lie told by omission, and the operator will plan around it.
 *
 * So every readout that could be either learned or assumed carries which one it
 * is, and how far off the other one is.
 */

/** Where a number came from. Rendered, never inferred by the reader. */
export type Provenance = 'default' | 'learning' | 'measured';

export interface ColdStartReadout {
  provenance: Provenance;
  /** The label to put next to the number. Short. */
  label: string;
  /** The sentence that explains it. Full, no ellipsis. */
  detail: string;
  /** Observations behind it. */
  n: number;
  /** Observations needed before it is worth trusting. */
  needed: number;
}

/**
 * Posts per slot before a best-time claim is worth making.
 *
 * Twelve is not statistical rigour; it is the point at which a difference
 * between slots stops being explainable by which three posts happened to be
 * good. Anything smaller and the system would be recommending a time on the
 * strength of one lucky Tuesday.
 */
export const MIN_POSTS_PER_SLOT = 12;

/** Posts on a platform before per-platform comparison means anything. */
export const MIN_POSTS_PER_PLATFORM = 10;

/**
 * Describe a best-posting-time readout honestly.
 *
 * The slot windows Halyard ships are ordinary sensible hours, not a measurement
 * of this audience. Until enough posts have run through a slot, that is what it
 * says.
 */
export function describeSlotConfidence(postsInSlot: number): ColdStartReadout {
  if (postsInSlot === 0) {
    return {
      provenance: 'default',
      label: 'default',
      detail:
        `This window is a sensible default, not a measurement. Nothing has posted in it yet. ` +
        `After about ${MIN_POSTS_PER_SLOT} posts Halyard can compare it against the others and say something about your audience rather than about audiences in general.`,
      n: 0,
      needed: MIN_POSTS_PER_SLOT,
    };
  }
  if (postsInSlot < MIN_POSTS_PER_SLOT) {
    return {
      provenance: 'learning',
      label: 'still a default',
      detail:
        `${postsInSlot} of about ${MIN_POSTS_PER_SLOT} posts needed before this window can be compared with the others. ` +
        `Until then it is still the shipped default, and the number beside it describes those ${postsInSlot} posts rather than the window.`,
      n: postsInSlot,
      needed: MIN_POSTS_PER_SLOT,
    };
  }
  return {
    provenance: 'measured',
    label: 'measured',
    detail: `Computed from ${postsInSlot} posts in this window.`,
    n: postsInSlot,
    needed: MIN_POSTS_PER_SLOT,
  };
}

export interface FunnelCounts {
  impressions: number;
  clicks: number;
  signups: number;
  activated: number;
}

export interface FunnelHonesty {
  /** True when every stage is zero: nothing has happened rather than nothing working. */
  empty: boolean;
  /** What the operator should read into the numbers, or the absence of them. */
  message: string;
  /** Stages whose rate should be hidden rather than shown as 0.0%. */
  suppressRates: boolean;
}

/**
 * What a funnel of zeros means.
 *
 * "0.0% of the step before" is arithmetic on nothing, and it reads as a
 * catastrophic conversion rate rather than as an empty database. This is the
 * single most misleading thing an analytics page can render on day one.
 */
export function describeFunnel(counts: FunnelCounts, publishedPosts: number): FunnelHonesty {
  if (publishedPosts === 0) {
    return {
      empty: true,
      suppressRates: true,
      message:
        'Nothing has published yet, so there is nothing to measure. These are not low numbers, they are absent ones.',
    };
  }
  if (counts.impressions === 0) {
    return {
      empty: true,
      suppressRates: true,
      message:
        `${publishedPosts} post${publishedPosts === 1 ? '' : 's'} published but no metrics have come back yet. ` +
        'Platforms report on a delay, typically an hour or two, and some need a paid tier before they report at all.',
    };
  }
  if (counts.clicks === 0) {
    return {
      empty: false,
      suppressRates: true,
      message:
        'Impressions are arriving but nobody has clicked through yet. A rate needs both halves, so the conversion figures are held back rather than shown as zero.',
    };
  }
  if (counts.activated === 0) {
    return {
      empty: false,
      suppressRates: false,
      message:
        'Clicks are being counted, but no activation has been attributed yet. That needs the product to record utm_content on signup, which is the other half of the chain.',
    };
  }
  return { empty: false, suppressRates: false, message: '' };
}

export interface ColdStartState {
  publishedPosts: number;
  daysSinceFirstPost: number | null;
  platformsWithPosts: number;
  categoriesAtThreshold: number;
}

/**
 * One paragraph for the top of /analytics saying what is not yet measurable.
 *
 * Deliberately a single honest paragraph rather than a scattering of asterisks.
 * Somebody reading a chart should learn whether to believe it before they read
 * the chart, not after.
 */
export function describeWhatIsNotMeasurable(state: ColdStartState): string[] {
  const lines: string[] = [];

  if (state.publishedPosts === 0) {
    return [
      'Nothing has published yet, so nothing on this page is measured. Every default here is a starting position: sensible, untested against your audience, and worth revisiting once about thirty posts have run.',
    ];
  }

  lines.push(
    `${state.publishedPosts} post${state.publishedPosts === 1 ? '' : 's'} published${
      state.daysSinceFirstPost !== null ? ` over ${state.daysSinceFirstPost} days` : ''
    }.`,
  );

  if (state.categoriesAtThreshold < 2) {
    lines.push(
      'Conversion by category is the chart that decides strategy, and it needs two categories with enough posts each before a comparison means anything. Until then the difference between categories is mostly the difference between individual posts.',
    );
  }
  if (state.platformsWithPosts < 2) {
    lines.push(
      'Only one platform has posts, so there is nothing to compare it against. Platform comparison is the second chart worth waiting for.',
    );
  }
  if (state.daysSinceFirstPost !== null && state.daysSinceFirstPost < 14) {
    lines.push(
      'Under two weeks of history means no weekday or time-of-day pattern is separable from noise. Best-posting-time stays on its defaults until it is.',
    );
  }

  return lines;
}

/**
 * Whether an opportunity claim can be made at all.
 *
 * Used before generating any "X outperforms Y" line. The threshold is not
 * decoration: with three posts per category, a 1.5× ratio is one good post.
 */
export function canMakeClaim(
  samplesA: number,
  samplesB: number,
  minimum: number,
): { allowed: boolean; reason: string } {
  if (samplesA < minimum || samplesB < minimum) {
    return {
      allowed: false,
      reason: `Not enough data for a claim yet. A comparison needs about ${minimum} posts on each side; there are ${samplesA} and ${samplesB}.`,
    };
  }
  return { allowed: true, reason: '' };
}
