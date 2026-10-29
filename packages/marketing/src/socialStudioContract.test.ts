import { describe, expect, it } from 'vitest';
import {
  CONTENT_CATEGORIES, CORE_PLATFORMS, PLATFORM_FORMATS,
  checkQueueReadiness, fingerprintVariant, groupVariantsByIdea,
  validateIdea, validateVariant,
  type CreativeIdea, type CreativeQualityReview, type ExactApproval,
  type PlatformVariant, type ProviderCapability,
} from './socialStudioContract.js';

const digest = 'a'.repeat(64);
const image = { path: 'approved/slide-1.png', kind: 'image' as const, sha256: digest,
  width: 1080, height: 1350, origin: 'Original artwork', rights: 'owned by RecipeFix', altText: 'First slide' };
const video = { path: 'approved/demo.mp4', kind: 'video' as const, sha256: digest,
  width: 1080, height: 1920, durationSeconds: 16, origin: 'Real QA browser with fixture-backed result',
  rights: 'first-party UI and original art' };
const idea: CreativeIdea = {
  id: 'headcount', title: 'More dinner, same broiler', category: 'P02',
  targetAudience: 'Home cooks scaling a meal', whyWatch: 'Dinner grows but oven capacity does not',
  visibleEvent: 'The chicken divides between two baking sheets', payoff: 'Two separate batches',
  productBridge: 'A verified RecipeFix adaptation adjusts the method',
  sourceUrls: ['https://recipefix.app/original-recipes/chicken-tikka-masala'],
  authoringStatus: 'founder_review',
};
const variant: PlatformVariant = {
  id: 'ig-headcount-v1', ideaId: idea.id, platform: 'instagram', format: 'carousel',
  caption: 'Cooking for six? The broiler is still the same size.',
  media: [image, { ...image, path: 'approved/slide-2.png', sha256: 'b'.repeat(64), altText: 'Second slide' }],
  account: { id: 'recipefix-verified-ig', ownerBrand: 'recipefix', verified: true },
  sourceUrls: idea.sourceUrls,
  scheduledAt: '2026-11-02T17:00:00-05:00',
};
const review: CreativeQualityReview = {
  variantId: variant.id, mediaHashes: variant.media.map((m) => m.sha256),
  checkedAt: '2026-10-29T15:00:00Z', visuallyReviewed: true, sound: 'silent_by_design',
  sourceAndRightsChecked: true, criticalDefects: [], founderDecision: 'approved',
};
const approval: ExactApproval = {
  variantId: variant.id, fingerprint: fingerprintVariant(variant),
  approvedAt: '2026-10-29T15:30:00Z', approvedBy: 'founder',
};
const capability: ProviderCapability = {
  provider: 'test-provider', platform: 'instagram', format: 'carousel',
  verifiedAccountId: 'recipefix-verified-ig', mode: 'automatic',
  verifiedAt: '2026-10-29T15:30:00Z', evidence: 'Provider test receipt and verified account owner',
};

describe('RecipeFix content and format architecture', () => {
  it('defines exactly four target platforms, independent of content categories', () => {
    expect(CORE_PLATFORMS).toEqual(['tiktok', 'instagram', 'youtube', 'x']);
    expect(Object.keys(CONTENT_CATEGORIES)).toHaveLength(15);
    expect(PLATFORM_FORMATS.youtube).toEqual(['short_video']);
  });
  it('requires a reason to watch, a visual event and a real payoff before production', () => {
    expect(validateIdea(idea)).toEqual([]);
    expect(validateIdea({ ...idea, visibleEvent: '' })).toContain('idea needs an opening, actual visual event and payoff');
  });
  it('allows one idea to have platform-native variants in multiple formats', () => {
    const grouped = groupVariantsByIdea([variant, { ...variant, id: 'tt-1', platform: 'tiktok', format: 'short_video', media: [video] }, { ...variant, id: 'x-1', platform: 'x', format: 'text', media: [] }]);
    expect(grouped.headcount).toHaveLength(3);
  });
  it('rejects a Youtube carousel without inventing publishing support', () => {
    expect(validateVariant({ ...variant, platform: 'youtube', format: 'carousel' })).toContain('format incompatible with platform');
  });
  it('allows platform-native X text and polls without media but no fake media attachment', () => {
    expect(validateVariant({ ...variant, platform: 'x', format: 'text', media: [], title: undefined })).toEqual([]);
    expect(validateVariant({ ...variant, platform: 'x', format: 'poll', media: [image] })).toContain('text/poll body cannot silently attach media');
  });
  it('rejects a short film without an actual video', () => {
    expect(validateVariant({ ...variant, platform: 'youtube', format: 'short_video', media: [], title: 'Test' })).toContain('video format needs one video and no image media');
  });
  it('enforces Youtube title and truthful media provenance', () => {
    expect(validateVariant({ ...variant, platform: 'youtube', format: 'short_video', media: [video], title: '' })).toContain('YouTube needs an explicit video title');
    expect(validateVariant({ ...variant, media: [{ ...image, origin: '', altText: '', rights: '' }, image] })).toContain('media provenance, alt text or hash invalid');
  });
  it('keeps X-thread replies and polls as independent platform-native structures', () => {
    const thread = { ...variant, platform: 'x' as const, format: 'thread' as const, media: [],
      thread: ['Here is the actual adapted method.', 'Try the real source recipe.'] };
    expect(validateVariant(thread)).toEqual([]);
    expect(validateVariant({ ...thread, thread: [] })).toContain('thread needs nonempty follow-up posts without video');
    expect(fingerprintVariant({ ...thread, thread: ['Different reply'] })).not.toBe(fingerprintVariant(thread));
    const poll = { ...variant, platform: 'x' as const, format: 'poll' as const, media: [],
      pollOptions: ['Chicken', 'Salmon', 'Tofu'] };
    expect(validateVariant(poll)).toEqual([]);
    expect(validateVariant({ ...poll, pollOptions: ['Only one'] })).toContain('poll requires two to four nonempty options');
  });
  it('requires an explicit timezone for a schedule', () => {
    expect(validateVariant({ ...variant, scheduledAt: '2026-11-02T17:00:00' })).toContain('scheduledAt must be ISO with timezone');
  });
  it('requires multiple images for a swipe carousel', () => {
    expect(validateVariant({ ...variant, media: [image] })).toContain('carousel needs at least two images');
  });
  it('prevents stale approvals after captions, time, account or media changes', () => {
    expect(fingerprintVariant({ ...variant, caption: 'Different copy' })).not.toBe(approval.fingerprint);
    expect(fingerprintVariant({ ...variant, scheduledAt: '2026-11-03T17:00:00-05:00' })).not.toBe(approval.fingerprint);
    expect(fingerprintVariant({ ...variant, account: { id: 'different', ownerBrand: 'recipefix', verified: true } })).not.toBe(approval.fingerprint);
    expect(fingerprintVariant({ ...variant, media: [{ ...image, sha256: 'c'.repeat(64) }, variant.media[1]!] })).not.toBe(approval.fingerprint);
  });
  it('requires founder creative and exact approval plus verified provider account', () => {
    expect(checkQueueReadiness(variant, null, null, null).ready).toBe(false);
    expect(checkQueueReadiness(variant, review, approval, capability)).toEqual({ ready: true, reasons: [], delivery: 'automatic' });
  });
  it('blocks media with a known defect or unchecked sound', () => {
    expect(checkQueueReadiness(variant, { ...review, criticalDefects: ['footer overlaps diagram'] }, approval, capability).ready).toBe(false);
    expect(checkQueueReadiness(variant, { ...review, sound: 'unverified' }, approval, capability).ready).toBe(false);
  });
  it('requires actual matching review media not only an approval hash', () => {
    expect(checkQueueReadiness(variant, { ...review, mediaHashes: [digest] }, approval, capability).reasons).toContain('reviewed media no longer matches');
  });
  it('blocks wrong-platform provider readback', () => {
    expect(checkQueueReadiness(variant, review, approval, { ...capability, platform: 'x' }).ready).toBe(false);
  });
  it('separates notification-only workflow from full automatic publishing', () => {
    expect(checkQueueReadiness(variant, review, approval, { ...capability, mode: 'notification_only' })).toEqual({ ready: true, reasons: [], delivery: 'notification_only' });
  });
  it('does not accept an account without proven RecipeFix ownership', () => {
    const unsafe = { ...variant, account: { id: 'momentcircuit0', ownerBrand: 'recipefix' as const, verified: false } };
    expect(checkQueueReadiness(unsafe, review, approval, capability).ready).toBe(false);
  });
  it('blocks missing schedule or unverified source/rights', () => {
    expect(checkQueueReadiness({ ...variant, scheduledAt: undefined }, review, approval, capability).reasons).toContain('a concrete schedule time is missing');
    expect(checkQueueReadiness(variant, { ...review, sourceAndRightsChecked: false }, approval, capability).ready).toBe(false);
  });
});
