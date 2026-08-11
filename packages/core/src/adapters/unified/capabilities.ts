/**
 * What a unified provider can actually do, per platform. Milestone 49.
 *
 * The rule this file exists to enforce is the one `verify-flows` established and
 * the QC gates now follow: **assumed is not verified**. A provider's marketing
 * lists nine platforms; that tells you nothing about whether alt text survives
 * on Pinterest, whether a carousel is possible on Instagram, or whether TikTok
 * publishes publicly or to drafts.
 *
 * So every capability starts as `unknown` and only becomes `yes` or `no` when
 * `scripts/verify-provider.ts` has watched it happen against a real account. An
 * unknown capability is reported as unknown everywhere it matters, never
 * silently assumed to work and never silently reported as zero.
 */
import type { PlatformId } from '../types.js';

export type Capability = 'yes' | 'no' | 'unknown';

/**
 * Metrics Halyard's scoring actually reads.
 *
 * `activated` comes from the product's own attribution rather than any social
 * platform, so it is not listed here — but `saves` is, because saves carry two
 * to three times the weight of a like in `engagementRate()`, and a transport
 * that cannot return them changes what the scoring means.
 */
export const SCORED_METRICS = [
  'impressions',
  'reach',
  'likes',
  'comments',
  'shares',
  'saves',
  'videoViews',
  'watchTimeSeconds',
  'profileVisits',
  'linkClicks',
  'follows',
] as const;

export type ScoredMetric = (typeof SCORED_METRICS)[number];

export interface PlatformCapability {
  platform: PlatformId;
  /** Can this transport publish here at all? */
  publish: Capability;
  /** Public, or only to drafts the operator finishes by hand? */
  publishesPublicly: Capability;
  carousel: Capability;
  video: Capability;
  /** Short-form vertical video specifically — Reels, Shorts. */
  shortVideo: Capability;
  altText: Capability;
  scheduling: Capability;
  /** Metrics observed coming back, rather than metrics advertised. */
  metrics: ScoredMetric[];
  /** When it was last checked against a real account. */
  verifiedAt?: string;
  /** Anything the operator needs to know, in their language. */
  notes: string[];
}

export interface ProviderCapabilities {
  provider: string;
  /** Null until a probe has run. */
  verifiedAt: string | null;
  platforms: Partial<Record<PlatformId, PlatformCapability>>;
}

/** Everything unknown. The honest starting position for any provider. */
export function unverified(provider: string, platforms: PlatformId[]): ProviderCapabilities {
  return {
    provider,
    verifiedAt: null,
    platforms: Object.fromEntries(
      platforms.map((platform) => [
        platform,
        {
          platform,
          publish: 'unknown',
          publishesPublicly: 'unknown',
          carousel: 'unknown',
          video: 'unknown',
          shortVideo: 'unknown',
          altText: 'unknown',
          scheduling: 'unknown',
          metrics: [],
          notes: ['Never verified against a real account.'],
        } satisfies PlatformCapability,
      ]),
    ),
  };
}

/**
 * What the direct adapters return, so the gap is nameable.
 *
 * These are not aspirations: they are the fields each platform's own API
 * documents, which is what `collectMetrics` maps in each adapter.
 */
export const DIRECT_METRICS: Record<PlatformId, ScoredMetric[]> = {
  x: ['impressions', 'likes', 'comments', 'shares', 'linkClicks', 'profileVisits', 'videoViews'],
  instagram: ['impressions', 'reach', 'likes', 'comments', 'shares', 'saves', 'videoViews', 'profileVisits', 'follows'],
  threads: ['impressions', 'likes', 'comments', 'shares'],
  pinterest: ['impressions', 'saves', 'linkClicks', 'comments'],
  youtube: ['impressions', 'videoViews', 'watchTimeSeconds', 'likes', 'comments', 'shares'],
  tiktok: ['impressions', 'videoViews', 'watchTimeSeconds', 'likes', 'comments', 'shares'],
  bluesky: ['likes', 'comments', 'shares'],
};

/**
 * Metrics the provider's documentation says it returns.
 *
 * Recorded separately from what a probe observes, because the two disagree more
 * often than vendors admit — and because a metric that is documented but never
 * arrives is exactly the kind of thing that renders as a confident zero.
 *
 * Corrected against the analytics schema after an earlier reading of the
 * marketing pages concluded that saves were not available. They are:
 * `savesCount`, `clicksCount`, `profileVisitsCount`, `followsCount` and
 * `watchTimeMsAvg` all exist. The earlier conclusion made the unified transport
 * look far thinner than it is, and would have kept Instagram on a direct
 * adapter for a reason that was not true.
 */
export const BLOTATO_DOCUMENTED_METRICS: ScoredMetric[] = [
  'impressions',
  'reach',
  'likes',
  'comments',
  'shares',
  'saves',
  'videoViews',
  'watchTimeSeconds',
  'profileVisits',
  'linkClicks',
  'follows',
];

/**
 * What is lost by routing a platform through the provider instead of directly.
 *
 * `/analytics` renders this per platform rather than showing a zero, because a
 * zero and "this transport cannot see it" are different facts and only one of
 * them is a reason to change strategy.
 */
export function missingMetrics(
  platform: PlatformId,
  observed: ScoredMetric[],
): ScoredMetric[] {
  const direct = DIRECT_METRICS[platform] ?? [];
  return direct.filter((metric) => !observed.includes(metric));
}

/**
 * A sentence for `/analytics`, or null when nothing is lost.
 *
 * Saves get their own clause because they are weighted two to three times a
 * like: losing them does not thin the chart, it changes what the chart means.
 */
export function describeGap(platform: PlatformId, observed: ScoredMetric[]): string | null {
  const missing = missingMetrics(platform, observed);
  if (missing.length === 0) return null;

  const parts = [
    `Through the unified provider, ${platform} does not report ${missing.join(', ')}.`,
  ];
  if (missing.includes('saves')) {
    parts.push(
      'Saves are weighted two to three times a like in scoring, so posts here are scored on a different basis from platforms that report them.',
    );
  }
  if (missing.includes('linkClicks')) {
    parts.push(
      'Link clicks are unaffected: Halyard routes every published link through /r and counts them itself.',
    );
  }
  return parts.join(' ');
}

/** Has this capability been checked, whatever the answer? */
export function isVerified(capabilities: ProviderCapabilities, platform: PlatformId): boolean {
  return capabilities.platforms[platform]?.publish !== 'unknown';
}

/**
 * Can this account publish through this transport right now?
 *
 * Unknown is not permission. A transport that has never been verified for a
 * platform must not carry a real post on the assumption that it probably works.
 */
export function canPublish(
  capabilities: ProviderCapabilities,
  platform: PlatformId,
): { allowed: boolean; reason: string } {
  const capability = capabilities.platforms[platform];

  if (!capability || capability.publish === 'unknown') {
    return {
      allowed: false,
      reason:
        `The unified transport has never been verified for ${platform}. ` +
        'Run `pnpm verify-provider` against a real account first — publishing on an assumption is how a post lands somewhere unexpected.',
    };
  }
  if (capability.publish === 'no') {
    return {
      allowed: false,
      reason: `The unified provider cannot publish to ${platform}. ${capability.notes.join(' ')}`,
    };
  }
  return { allowed: true, reason: 'Verified against a real account.' };
}
