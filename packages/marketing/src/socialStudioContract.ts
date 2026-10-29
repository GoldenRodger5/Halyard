/**
 * RecipeFix Social Studio authoring contracts.
 *
 * An IDEA is not a POST. Ideas, platform-native formats, quality evidence,
 * founder approval and provider publication capability are distinct.
 *
 * Pure, offline validation only. This file cannot publish or approve content.
 * Provider APIs and actual account authority must be separately verified.
 */
import { createHash } from 'node:crypto';

export const CORE_PLATFORMS = ['tiktok', 'instagram', 'youtube', 'x'] as const;
export type CorePlatform = (typeof CORE_PLATFORMS)[number];

export const CONTENT_CATEGORIES = {
  P01: { name: 'RecipeFix introduction', purpose: 'activation' },
  P02: { name: 'Recipe rescue / recipes to adapt', purpose: 'activation' },
  P03: { name: 'Feature magic / actual walkthrough', purpose: 'activation' },
  P04: { name: 'Nutrition goals and honest tradeoffs', purpose: 'activation' },
  P05: { name: 'Weekly cooking flow', purpose: 'retention' },
  P06: { name: 'Ingredient swap and method change', purpose: 'activation' },
  E01: { name: 'Cooking technique / teach something', purpose: 'qualified_reach' },
  E02: { name: 'Did you know / food science', purpose: 'qualified_reach' },
  E03: { name: 'Food history and culture', purpose: 'qualified_reach' },
  E04: { name: 'Kitchen math and scaling', purpose: 'qualified_reach' },
  E05: { name: 'Recipes / seasonal inspiration', purpose: 'qualified_reach' },
  C01: { name: 'Food games and interactive challenges', purpose: 'community' },
  C02: { name: 'Trivia, quiz, this-or-that', purpose: 'community' },
  C03: { name: 'Humor and cooking culture', purpose: 'community' },
  C04: { name: 'Real community Q&A', purpose: 'community' },
} as const;
export type ContentCategory = keyof typeof CONTENT_CATEGORIES;

/** Supported AUTHORING opportunities; verified API support is a separate gate. */
export const PLATFORM_FORMATS = {
  tiktok: ['short_video', 'photo_carousel'] as const,
  instagram: ['reel', 'feed_image', 'carousel', 'story'] as const,
  youtube: ['short_video'] as const,
  x: ['text', 'image', 'thread', 'video', 'poll'] as const,
} satisfies Record<CorePlatform, readonly string[]>;

export type PlatformFormat = (typeof PLATFORM_FORMATS)[CorePlatform][number];
export type MediaKind = 'video' | 'image' | 'audio';
export type BusinessPurpose = 'activation' | 'retention' | 'qualified_reach' | 'community';

export type CreativeIdea = {
  id: string;
  title: string;
  category: ContentCategory;
  targetAudience: string;
  whyWatch: string;
  visibleEvent: string;
  payoff: string;
  productBridge: string | null;
  sourceUrls: string[];
  authoringStatus: 'brief' | 'storyboard' | 'editing' | 'rendered' | 'founder_review';
};

export type CreativeAsset = {
  path: string;
  kind: MediaKind;
  sha256: string;
  /** E.g. 1080×1920 for a 9:16 reel. */
  width?: number;
  height?: number;
  durationSeconds?: number;
  origin: string;
  rights: string;
  altText?: string;
  synthetic?: boolean;
};

export type PlatformVariant = {
  id: string;
  ideaId: string;
  platform: CorePlatform;
  format: PlatformFormat;
  caption: string;
  title?: string;
  media: CreativeAsset[];
  /** Only for an X-native thread: main caption is the first post. */
  thread?: string[];
  /** Only for X-native polls; provider support must still be verified. */
  pollOptions?: string[];
  targetUrl?: string;
  cta?: string;
  account?: { id: string; ownerBrand: 'recipefix'; verified: boolean };
  /** ISO with timezone, no guessing about posting-time locality. */
  scheduledAt?: string;
  disclosure?: string;
  sourceUrls: string[];
};

export type CreativeQualityReview = {
  variantId: string;
  mediaHashes: string[];
  checkedAt: string;
  /** A reviewer actually inspected the FULL exported content, including text/art. */
  visuallyReviewed: boolean;
  /** If there is sound, hearing is an explicit separate requirement. */
  sound: 'audibly_reviewed' | 'silent_by_design' | 'unverified';
  sourceAndRightsChecked: boolean;
  criticalDefects: string[];
  founderDecision: 'unreviewed' | 'rejected' | 'revise' | 'approved';
};

/** A founder's approval must bind to final copy, assets, account, and time. */
export type ExactApproval = {
  variantId: string;
  fingerprint: string;
  approvedAt: string;
  approvedBy: 'founder';
};

export type ProviderCapability = {
  platform: CorePlatform;
  format: PlatformFormat;
  provider: string;
  verifiedAccountId: string;
  /** Explicitly distinguish true unattended publish from notification-only. */
  mode: 'automatic' | 'notification_only';
  verifiedAt: string;
  evidence: string;
};

export type Readiness = {
  ready: boolean;
  reasons: string[];
  delivery: 'automatic' | 'notification_only' | 'unknown';
};

const isHexDigest = (value: string): boolean => /^[a-f0-9]{64}$/i.test(value);
const nonBlank = (value: string | null | undefined): boolean => Boolean(value && value.trim());
const formatIsValid = (platform: CorePlatform, format: string): boolean =>
  (PLATFORM_FORMATS[platform] as readonly string[]).includes(format);
const errorsForMedia = (asset: CreativeAsset): string[] => {
  const errors: string[] = [];
  if (!nonBlank(asset.path) || !isHexDigest(asset.sha256)) errors.push('asset path/hash is missing or invalid');
  if (!nonBlank(asset.origin) || !nonBlank(asset.rights)) errors.push('asset origin/rights are required');
  if (asset.kind === 'image' && !nonBlank(asset.altText)) errors.push('image alt text is required');
  if (asset.width !== undefined && asset.width <= 0) errors.push('invalid media width');
  if (asset.height !== undefined && asset.height <= 0) errors.push('invalid media height');
  return errors;
};

export function validateIdea(idea: CreativeIdea): string[] {
  const errors: string[] = [];
  if (!nonBlank(idea.id) || !nonBlank(idea.title) || !nonBlank(idea.targetAudience)) errors.push('idea identity/audience required');
  if (!CONTENT_CATEGORIES[idea.category]) errors.push('unknown category');
  if (!nonBlank(idea.whyWatch) || !nonBlank(idea.visibleEvent) || !nonBlank(idea.payoff)) errors.push('idea needs an opening, actual visual event and payoff');
  if (!Array.isArray(idea.sourceUrls)) errors.push('source links must be an array (possibly empty)');
  return errors;
}

export function validateVariant(variant: PlatformVariant): string[] {
  const errors: string[] = [];
  if (!nonBlank(variant.id) || !nonBlank(variant.ideaId)) errors.push('variant needs stable identity');
  if (!CORE_PLATFORMS.includes(variant.platform)) errors.push('unsupported core platform');
  if (!formatIsValid(variant.platform, variant.format)) errors.push('format incompatible with platform');
  if (!nonBlank(variant.caption)) errors.push('caption/body is required');
  if (variant.media.some((asset) => errorsForMedia(asset).length)) errors.push('media provenance, alt text or hash invalid');

  const video = variant.media.filter((asset) => asset.kind === 'video').length;
  const images = variant.media.filter((asset) => asset.kind === 'image').length;
  const fmt = variant.format;
  if (['short_video', 'reel', 'video'].includes(fmt) && (video !== 1 || variant.media.length !== 1)) errors.push('video format needs one video and no image media');
  if (['carousel', 'photo_carousel'].includes(fmt) && (images < 2 || images !== variant.media.length)) errors.push('carousel needs at least two images');
  if (['image', 'feed_image'].includes(fmt) && (images < 1 || images !== variant.media.length)) errors.push('image post requires image media');
  if (['text', 'poll'].includes(fmt) && variant.media.length) errors.push('text/poll body cannot silently attach media');
  if (fmt === 'thread' && (video || !variant.thread || variant.thread.length < 1 || variant.thread.some((p) => !nonBlank(p)))) errors.push('thread needs nonempty follow-up posts without video');
  if (variant.thread?.length && fmt !== 'thread') errors.push('thread copy attached to non-thread format');
  if (fmt === 'poll' && (!variant.pollOptions || variant.pollOptions.length < 2 || variant.pollOptions.length > 4 || variant.pollOptions.some((p) => !nonBlank(p)))) errors.push('poll requires two to four nonempty options');
  if (variant.pollOptions?.length && fmt !== 'poll') errors.push('poll options attached to non-poll format');
  if (fmt === 'story' && variant.media.length !== 1) errors.push('Story needs one image or video');
  if (variant.platform === 'youtube' && !nonBlank(variant.title)) errors.push('YouTube needs an explicit video title');

  if (variant.account && variant.account.ownerBrand !== 'recipefix') errors.push('account brand must be RecipeFix');
  if (variant.scheduledAt && (!/T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(variant.scheduledAt) || Number.isNaN(Date.parse(variant.scheduledAt)))) errors.push('scheduledAt must be ISO with timezone');
  return errors;
}

/** A deterministic authoring fingerprint; NO authority is implied by the hash. */
export function fingerprintVariant(variant: PlatformVariant): string {
  const payload = {
    id: variant.id, ideaId: variant.ideaId, platform: variant.platform,
    format: variant.format, caption: variant.caption, title: variant.title ?? null,
    media: variant.media.map((a) => ({
      path: a.path, kind: a.kind, sha256: a.sha256, altText: a.altText ?? null,
      origin: a.origin, rights: a.rights, synthetic: a.synthetic ?? false,
    })),
    thread: variant.thread ?? null, pollOptions: variant.pollOptions ?? null,
    targetUrl: variant.targetUrl ?? null, cta: variant.cta ?? null,
    account: variant.account ?? null, scheduledAt: variant.scheduledAt ?? null,
    disclosure: variant.disclosure ?? null, sourceUrls: variant.sourceUrls,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * An offline queue gate. It cannot publish; approvals must be independently
 * authenticated by the real owner workflow and provider account checked live.
 */
export function checkQueueReadiness(
  variant: PlatformVariant,
  review: CreativeQualityReview | null,
  approval: ExactApproval | null,
  capability: ProviderCapability | null,
): Readiness {
  const reasons = validateVariant(variant);
  if (!variant.scheduledAt) reasons.push('a concrete schedule time is missing');
  if (!variant.account?.verified || variant.account?.ownerBrand !== 'recipefix') reasons.push('RecipeFix-owned account unverified');
  if (!review || review.variantId !== variant.id || review.founderDecision !== 'approved') reasons.push('founder creative verdict missing');
  if (review) {
    const reviewed = review.mediaHashes.join('|');
    const current = variant.media.map((a) => a.sha256).join('|');
    if (reviewed !== current) reasons.push('reviewed media no longer matches');
    if (!review.visuallyReviewed || review.sound === 'unverified' || !review.sourceAndRightsChecked || review.criticalDefects.length) reasons.push('independent media/rights review incomplete');
  }
  if (!approval || approval.variantId !== variant.id || approval.approvedBy !== 'founder' || approval.fingerprint !== fingerprintVariant(variant)) reasons.push('exact founder approval missing or stale');
  if (!capability || capability.platform !== variant.platform || capability.format !== variant.format ||
      capability.verifiedAccountId !== variant.account?.id || !nonBlank(capability.evidence)) reasons.push('provider capability/account not proven');
  return { ready: reasons.length === 0, reasons, delivery: capability?.mode ?? 'unknown' };
}

/** One core idea can create zero or multiple distinct platform-native variants. */
export function groupVariantsByIdea(variants: PlatformVariant[]): Record<string, PlatformVariant[]> {
  const groups: Record<string, PlatformVariant[]> = {};
  for (const v of variants) (groups[v.ideaId] ??= []).push(v);
  return groups;
}
