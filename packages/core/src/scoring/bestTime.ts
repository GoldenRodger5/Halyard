/**
 * Best time to post, from this account's own data. Milestone 31, Part A.
 *
 * Generic "best times to post" tables are averages across millions of accounts
 * in every category and timezone, which makes them wrong for any specific one.
 * Once there are enough posts, the account's own engagement is a better answer.
 *
 * Two rules keep this honest:
 *   · Below the sample threshold it returns nothing rather than a narrower
 *     window computed from noise.
 *   · It shows the computation, not just the answer, and never overrides a slot
 *     the operator pinned by hand.
 */

export interface PostTiming {
  /** ISO weekday, 1 = Monday. In the audience timezone. */
  weekday: number;
  /** Hour in the audience timezone, 0 to 23. */
  hour: number;
  /** Whatever performance measure the caller trusts. Usually the score. */
  score: number;
  platform: string;
}

/** Milestone 31: 30 or more posts per platform before this means anything. */
export const MIN_POSTS_FOR_TIMING = 30;

export interface TimingWindow {
  platform: string;
  /** Hour the window opens, in the audience timezone. */
  startHour: number;
  endHour: number;
  weekdays: number[];
  meanScore: number;
  samples: number;
  /** The working, so the recommendation can be argued with. */
  workings: string[];
}

export type TimingResult =
  | { ready: false; reason: string; samples: number }
  | { ready: true; windows: TimingWindow[] };

/**
 * Narrow the slot windows from measured performance.
 *
 * Hours are bucketed into three-hour bands, because posting is not precise
 * enough for an hourly recommendation to be real, and a band survives a few
 * outliers.
 */
export function computeBestTimes(
  posts: PostTiming[],
  options: { platform?: string; minSamples?: number; maxWindows?: number } = {},
): TimingResult {
  const minSamples = options.minSamples ?? MIN_POSTS_FOR_TIMING;
  const scoped = options.platform ? posts.filter((p) => p.platform === options.platform) : posts;

  if (scoped.length < minSamples) {
    return {
      ready: false,
      samples: scoped.length,
      reason:
        `${scoped.length} post${scoped.length === 1 ? '' : 's'}${options.platform ? ` on ${options.platform}` : ''}. ` +
        `Timing computed from fewer than ${minSamples} is noise, so the seeded windows stay as they are.`,
    };
  }

  const byPlatform = new Map<string, PostTiming[]>();
  for (const post of scoped) {
    if (!byPlatform.has(post.platform)) byPlatform.set(post.platform, []);
    byPlatform.get(post.platform)!.push(post);
  }

  const windows: TimingWindow[] = [];

  for (const [platform, platformPosts] of byPlatform) {
    if (platformPosts.length < minSamples) continue;

    const bands = new Map<number, PostTiming[]>();
    for (const post of platformPosts) {
      const band = Math.floor(post.hour / 3) * 3;
      if (!bands.has(band)) bands.set(band, []);
      bands.get(band)!.push(post);
    }

    const overallMean = mean(platformPosts.map((p) => p.score));

    const ranked = [...bands.entries()]
      // A band with one post is an anecdote.
      .filter(([, group]) => group.length >= 3)
      .map(([band, group]) => ({
        band,
        meanScore: mean(group.map((p) => p.score)),
        samples: group.length,
        weekdays: [...new Set(group.map((p) => p.weekday))].sort(),
      }))
      .sort((a, b) => b.meanScore - a.meanScore)
      .slice(0, options.maxWindows ?? 2);

    for (const entry of ranked) {
      const lift = overallMean > 0 ? (entry.meanScore / overallMean - 1) * 100 : 0;
      windows.push({
        platform,
        startHour: entry.band,
        endHour: entry.band + 3,
        weekdays: entry.weekdays,
        meanScore: Number(entry.meanScore.toFixed(3)),
        samples: entry.samples,
        workings: [
          `${entry.samples} posts between ${pad(entry.band)}:00 and ${pad(entry.band + 3)}:00`,
          `mean score ${entry.meanScore.toFixed(2)} against an account mean of ${overallMean.toFixed(2)}`,
          `${lift >= 0 ? '+' : ''}${lift.toFixed(0)}% versus posting at a random hour`,
        ],
      });
    }
  }

  if (windows.length === 0) {
    return {
      ready: false,
      samples: scoped.length,
      reason: 'Enough posts overall, but no three-hour band has three or more. Spread posting across the day before narrowing it.',
    };
  }

  return { ready: true, windows };
}

/**
 * Apply a computed window to a slot, unless the operator pinned it.
 *
 * A pinned slot is never overridden. The operator knows something the data does
 * not, and silently moving their slot is how a tool stops being trusted.
 */
export function applyWindow(
  slot: { name: string; windowStart: string; windowEnd: string; pinned?: boolean },
  window: TimingWindow,
): { windowStart: string; windowEnd: string; changed: boolean; note: string } {
  if (slot.pinned) {
    return {
      windowStart: slot.windowStart,
      windowEnd: slot.windowEnd,
      changed: false,
      note: `${slot.name} is pinned, so it was left alone. The data suggests ${pad(window.startHour)}:00 to ${pad(window.endHour)}:00.`,
    };
  }

  const start = `${pad(window.startHour)}:00`;
  const end = `${pad(window.endHour)}:00`;
  const changed = start !== slot.windowStart || end !== slot.windowEnd;

  return {
    windowStart: start,
    windowEnd: end,
    changed,
    note: changed
      ? `${slot.name} narrowed from ${slot.windowStart}–${slot.windowEnd} to ${start}–${end} on ${window.samples} posts.`
      : `${slot.name} already matches the data.`,
  };
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Wrap an hour into 00–23.
 *
 * The double modulo is load-bearing: JavaScript's `%` keeps the sign of the
 * left operand, so a bare `hour % 24` renders -1 as "-1" rather than "23". No
 * caller passes a negative hour today — bands are non-negative and only ever
 * grow — but this is the same negative-modulo family that put minus signs on
 * the analytics screen, and the guard costs nothing.
 */
function pad(hour: number): string {
  return String(((hour % 24) + 24) % 24).padStart(2, '0');
}
