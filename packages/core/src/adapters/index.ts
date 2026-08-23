import { InstagramAdapter } from './instagram.js';
import { PinterestAdapter } from './pinterest.js';
import { ThreadsAdapter } from './threads.js';
import { TikTokAdapter } from './tiktok.js';
import { BlueskyAdapter } from './bluesky.js';
import { XAdapter } from './x.js';
import { YouTubeAdapter } from './youtube.js';
import { PublishError, type PlatformAdapter, type PlatformId } from './types.js';
import { UnifiedAdapter, type ProviderCapabilities } from './unified/index.js';

export * from './types.js';
export * from './unified/index.js';
export * from './oauth.js';
export * from './x.js';
export * from './instagram.js';
export * from './threads.js';
export * from './pinterest.js';
export * from './youtube.js';
export * from './tiktok.js';
export * from './bluesky.js';
export * from './dryRun.js';

const ADAPTERS: Record<PlatformId, PlatformAdapter> = {
  x: new XAdapter(),
  // Bluesky has no review gate and no per-post cost, and no native scheduling
  // at all — which is exactly why it is worth supporting.
  bluesky: new BlueskyAdapter(),
  instagram: new InstagramAdapter(),
  threads: new ThreadsAdapter(),
  pinterest: new PinterestAdapter(),
  youtube: new YouTubeAdapter(),
  tiktok: new TikTokAdapter(),
};

/**
 * Every registered platform, at runtime.
 *
 * `PlatformId` is a type and vanishes at compile time, so anything wanting to
 * walk all platforms — the delivery-capability tests, a capability table —
 * had to hand-write the list again. Derived from the registry, so a platform
 * added there cannot be missed here.
 */
export const PLATFORM_IDS = Object.keys(ADAPTERS) as PlatformId[];

export function getAdapter(platform: PlatformId): PlatformAdapter {
  const adapter = ADAPTERS[platform];
  if (!adapter) throw new Error(`No adapter registered for platform '${platform}'.`);
  return adapter;
}

export function allAdapters(): PlatformAdapter[] {
  return Object.values(ADAPTERS);
}

/** Env var names per platform, so the OAuth route reads them in one place. */
export const PLATFORM_CLIENT_ENV: Record<PlatformId, { id: string; secret: string }> = {
  x: { id: 'X_CLIENT_ID', secret: 'X_CLIENT_SECRET' },
  instagram: { id: 'META_APP_ID', secret: 'META_APP_SECRET' },
  threads: { id: 'META_APP_ID', secret: 'META_APP_SECRET' },
  tiktok: { id: 'TIKTOK_CLIENT_KEY', secret: 'TIKTOK_CLIENT_SECRET' },
  pinterest: { id: 'PINTEREST_APP_ID', secret: 'PINTEREST_APP_SECRET' },
  youtube: { id: 'GOOGLE_CLIENT_ID', secret: 'GOOGLE_CLIENT_SECRET' },
  // Bluesky uses an app password pasted by the operator, not a client app.
  bluesky: { id: 'BLUESKY_UNUSED', secret: 'BLUESKY_UNUSED' },
};

/**
 * v2 A.1 — the headline finding, as data. Every platform except X gates public
 * programmatic posting behind a manual review. The /accounts page renders this
 * so the operator never has to remember which review is which.
 */
export const REVIEW_GATES: Record<
  PlatformId,
  { review: string; unreviewedGives: string; typicalWeeks: string }
> = {
  x: {
    review: 'None',
    unreviewedGives: 'Full public posting, billed per call',
    typicalWeeks: '0',
  },
  instagram: {
    review: 'Meta App Review',
    unreviewedGives: 'Up to 25 test users',
    typicalWeeks: '2–4 per submission',
  },
  tiktok: {
    review: 'Content Posting API audit',
    unreviewedGives: 'SELF_ONLY posts, account must be private',
    typicalWeeks: 'Assume rejection for an internal tool',
  },
  pinterest: {
    review: 'Trial → Standard, video demo',
    unreviewedGives: 'Sandbox pins, visible only to the creator',
    typicalWeeks: '1–4',
  },
  youtube: {
    review: 'Compliance audit',
    unreviewedGives: 'Private uploads only',
    typicalWeeks: '2–6, no guaranteed timeline',
  },
  threads: {
    review: 'Meta App Review',
    unreviewedGives: 'Similar to Instagram',
    typicalWeeks: '2–4 per submission',
  },
  bluesky: {
    review: 'None',
    unreviewedGives: 'Full posting on an app password',
    typicalWeeks: '0',
  },
};

/**
 * Resolve an account to the adapter that will carry its post.
 *
 * The direct adapter is the default and the fallback. A `unified` account
 * routes through the provider, but only for a platform whose capability has
 * been verified — an unverified transport refuses at publish time rather than
 * silently sending a real post on an assumption.
 */
export function adapterForAccount(
  account: {
    platform: PlatformId;
    transport?: 'direct' | 'unified';
    provider_account_id?: string | null;
  },
  capabilities?: ProviderCapabilities | null,
): PlatformAdapter {
  const direct = getAdapter(account.platform);
  if (account.transport !== 'unified') return direct;

  if (!capabilities) {
    // No probe has ever run. Falling back to direct would quietly publish
    // through a path the operator did not choose, so this fails instead.
    throw new PublishError(
      `${account.platform} is set to the unified transport, but the provider has never been verified. ` +
        'Run `pnpm verify-provider` first.',
      'permanent',
    );
  }

  return new UnifiedAdapter({
    platform: account.platform,
    // The platform's own constraints still apply: character limits, aspect
    // ratios and link strategy are facts about the platform, not the transport.
    constraints: direct.constraints,
    capabilities,
  });
}
