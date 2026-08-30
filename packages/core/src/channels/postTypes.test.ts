/**
 * §349. Checked against what the adapters actually declare, because the point
 * of deriving is that a hand-written list had already drifted from them.
 */
import { describe, it, expect } from 'vitest';
import {
  POST_TYPES,
  POST_TYPE_CATALOG,
  canCarry,
  platformsForPostType,
  postTypesForPlatform,
  type PlatformSupport,
} from './postTypes.js';

/* Copied from the adapters' own `PlatformConstraints`, verbatim. */
const SUPPORTS: PlatformSupport[] = [
  {
    platform: 'tiktok',
    supportedFormats: ['video', 'carousel'],
    carousel: { min: 2, max: 35 },
    linkStrategy: 'bio_only',
    video: { minSeconds: 3, maxSeconds: 600 },
  },
  {
    platform: 'instagram',
    supportedFormats: ['image', 'carousel', 'video', 'story'],
    carousel: { min: 2, max: 10, sameAspectRatioRequired: true },
    linkStrategy: 'bio_only',
    video: { minSeconds: 5, maxSeconds: 90 },
  },
  {
    platform: 'youtube',
    supportedFormats: ['video'],
    carousel: undefined,
    linkStrategy: 'description',
    video: { minSeconds: 1, maxSeconds: 43_200 },
  },
  {
    platform: 'x',
    supportedFormats: ['text', 'image', 'video'],
    carousel: undefined,
    linkStrategy: 'first_reply',
    video: { minSeconds: 1, maxSeconds: 140 },
  },
  {
    platform: 'threads',
    supportedFormats: ['text', 'image', 'video', 'carousel'],
    carousel: { min: 2, max: 20 },
    linkStrategy: 'in_body',
    video: { minSeconds: 1, maxSeconds: 300 },
  },
  {
    platform: 'pinterest',
    supportedFormats: ['pin', 'image', 'video'],
    carousel: undefined,
    linkStrategy: 'pin_destination',
    video: { minSeconds: 4, maxSeconds: 900 },
  },
];

const support = (platform: string) => SUPPORTS.find((s) => s.platform === platform)!;

describe('platformsForPostType', () => {
  it('sends a short video to TikTok, Reels and Shorts — one production, three homes', () => {
    const platforms = platformsForPostType(POST_TYPE_CATALOG.short_video, SUPPORTS);
    expect(platforms).toEqual(expect.arrayContaining(['tiktok', 'instagram', 'youtube']));
  });

  it('includes Threads for a carousel, which the hand-written list did not', () => {
    /*
     * `channels.ts` said `carousel.platforms = ['instagram']` while the Threads
     * adapter had declared carousel support all along. Two hand-maintained
     * lists, already disagreeing — the reason this is derived.
     */
    const platforms = platformsForPostType(POST_TYPE_CATALOG.carousel_images, SUPPORTS);
    expect(platforms).toContain('threads');
    expect(platforms).toContain('instagram');
  });

  it('includes TikTok for a carousel, which it has carried for years', () => {
    expect(platformsForPostType(POST_TYPE_CATALOG.carousel_images, SUPPORTS)).toContain('tiktok');
  });

  it('refuses a carousel on a platform that takes single media only', () => {
    expect(canCarry(POST_TYPE_CATALOG.carousel_images, support('x')).ok).toBe(false);
    expect(canCarry(POST_TYPE_CATALOG.carousel_images, support('youtube')).ok).toBe(false);
  });

  it('refuses a link post where no link may appear in the post', () => {
    /*
     * Not a formatting detail: on Instagram and TikTok the whole purpose of the
     * post is unreachable, so offering it would produce a piece that cannot work.
     */
    expect(canCarry(POST_TYPE_CATALOG.caption_link, support('instagram')).ok).toBe(false);
    expect(canCarry(POST_TYPE_CATALOG.caption_link, support('tiktok')).ok).toBe(false);
    expect(canCarry(POST_TYPE_CATALOG.caption_link, support('threads')).ok).toBe(true);
    expect(canCarry(POST_TYPE_CATALOG.caption_link, support('x')).ok).toBe(true);
  });

  it('refuses a long video where the platform cannot hold one', () => {
    /* X takes 140 seconds; a long video needs at least four minutes. */
    expect(canCarry(POST_TYPE_CATALOG.long_video, support('x')).ok).toBe(false);
    expect(canCarry(POST_TYPE_CATALOG.long_video, support('youtube')).ok).toBe(true);
  });

  it('keeps a caption-only post off platforms that need media', () => {
    expect(canCarry(POST_TYPE_CATALOG.caption_only, support('tiktok')).ok).toBe(false);
    expect(canCarry(POST_TYPE_CATALOG.caption_only, support('x')).ok).toBe(true);
  });

  it('explains every refusal in words an operator can read on a button', () => {
    const verdict = canCarry(POST_TYPE_CATALOG.carousel_images, support('x'));
    expect(verdict.because).toContain('carousel');
    expect(verdict.because.length).toBeGreaterThan(20);
  });
});

describe('postTypesForPlatform', () => {
  it('gives X text, image and video but no carousel and no story', () => {
    const types = postTypesForPlatform(support('x'));
    expect(types).toEqual(expect.arrayContaining(['caption_only', 'caption_link', 'single_image']));
    expect(types).not.toContain('carousel_images');
    expect(types).not.toContain('story');
  });

  it('gives Instagram everything visual and no text-only post', () => {
    const types = postTypesForPlatform(support('instagram'));
    expect(types).toEqual(expect.arrayContaining(['single_image', 'carousel_images', 'short_video', 'story']));
    expect(types).not.toContain('caption_only');
  });

  it('gives Threads the widest set, which is what its adapter declares', () => {
    const types = postTypesForPlatform(support('threads'));
    expect(types).toEqual(
      expect.arrayContaining(['caption_only', 'caption_link', 'single_image', 'carousel_images', 'short_video']),
    );
  });
});

describe('the catalogue', () => {
  it('gives every post type at least one platform that can carry it', () => {
    /* A post type nothing can publish is a menu entry that wastes an operator's
       time and a production nobody can use. */
    for (const id of POST_TYPES) {
      const platforms = platformsForPostType(POST_TYPE_CATALOG[id], SUPPORTS);
      expect(platforms.length, `${id} has no platform that can carry it`).toBeGreaterThan(0);
    }
  });

  it('separates the types that genuinely need different stages', () => {
    /* The splitting rule: different stages, constraints or destinations. */
    expect(POST_TYPE_CATALOG.caption_only.requires.link).toBeUndefined();
    expect(POST_TYPE_CATALOG.caption_link.requires.link).toBe(true);
    expect(POST_TYPE_CATALOG.carousel_images.media).toBe('carousel');
    expect(POST_TYPE_CATALOG.short_video.media).toBe('video');
  });
});
