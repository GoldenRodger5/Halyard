import { InstagramAdapter } from './instagram.js';
import { PinterestAdapter } from './pinterest.js';
import { ThreadsAdapter } from './threads.js';
import { TikTokAdapter } from './tiktok.js';
import { XAdapter } from './x.js';
import { YouTubeAdapter } from './youtube.js';
import type { PlatformAdapter, PlatformId } from './types.js';

export * from './types.js';
export * from './oauth.js';
export * from './x.js';
export * from './instagram.js';
export * from './threads.js';
export * from './pinterest.js';
export * from './youtube.js';
export * from './tiktok.js';

const ADAPTERS: Record<PlatformId, PlatformAdapter> = {
  x: new XAdapter(),
  instagram: new InstagramAdapter(),
  threads: new ThreadsAdapter(),
  pinterest: new PinterestAdapter(),
  youtube: new YouTubeAdapter(),
  tiktok: new TikTokAdapter(),
};

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
};
