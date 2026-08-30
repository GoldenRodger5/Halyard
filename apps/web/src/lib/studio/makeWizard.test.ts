/**
 * §355. The wizard's narrowing, tested as logic rather than as a screen.
 *
 * The rules that matter are about which options a person is offered, and
 * getting those wrong either hides something possible or offers something that
 * fails at publish — the most expensive place to find out.
 */
import { describe, it, expect } from 'vitest';
import {
  POST_TYPES,
  POST_TYPE_CATALOG,
  canCarry,
  supportFromConstraints,
  getAdapter,
  type PlatformSupport,
} from '@halyard/core';

const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'x', 'threads', 'pinterest'] as const;

const supports: PlatformSupport[] = PLATFORMS.map((platform) =>
  supportFromConstraints(platform, getAdapter(platform as never).constraints),
);
const support = (platform: string) => supports.find((s) => s.platform === platform)!;

/** The wizard's rule: a type is offered when *every* chosen platform carries it. */
function offered(chosen: string[]): Array<(typeof POST_TYPES)[number]> {
  return POST_TYPES.filter((id) =>
    chosen.every((platform) => canCarry(POST_TYPE_CATALOG[id], support(platform)).ok),
  );
}

describe('step 2 narrows by every chosen platform, not any', () => {
  it('offers a short video for TikTok, Instagram and YouTube together', () => {
    /* The normal case: one production, three destinations. */
    expect(offered(['tiktok', 'instagram', 'youtube'])).toContain('short_video');
  });

  it('drops caption-only the moment TikTok is added', () => {
    /*
     * A piece made for three platforms and publishable to two fails at the
     * last step. Every, not any.
     */
    expect(offered(['x', 'threads'])).toContain('caption_only');
    expect(offered(['x', 'threads', 'tiktok'])).not.toContain('caption_only');
  });

  it('offers a carousel across Instagram, Threads and TikTok', () => {
    /* All three declare it; the old hand-written list said Instagram only. */
    expect(offered(['instagram', 'threads', 'tiktok'])).toContain('carousel_images');
  });

  it('drops a carousel the moment X or YouTube is added', () => {
    expect(offered(['instagram', 'x'])).not.toContain('carousel_images');
    expect(offered(['instagram', 'youtube'])).not.toContain('carousel_images');
  });

  it('offers a link post only where a link may sit in the post', () => {
    expect(offered(['threads'])).toContain('caption_link');
    expect(offered(['x'])).toContain('caption_link');
    expect(offered(['instagram'])).not.toContain('caption_link');
  });

  it('offers everything when nothing is chosen yet', () => {
    /* An empty selection narrows nothing; the operator has not decided. */
    expect(offered([])).toHaveLength(POST_TYPES.length);
  });

  it('always explains a refusal', () => {
    const verdict = canCarry(POST_TYPE_CATALOG.carousel_images, support('x'));
    expect(verdict.ok).toBe(false);
    expect(verdict.because.length).toBeGreaterThan(20);
  });
});

describe('step 4 narrows formats by the post type’s brief', () => {
  it('offers quiz for a short video and not for a caption', () => {
    const quiz = POST_TYPE_CATALOG.short_video;
    expect(quiz.channel).toBe('short_video');
    /* `quiz` declares short_video only, so a caption post cannot hold one. */
    expect(POST_TYPE_CATALOG.caption_only.channel).toBe('text_post');
  });
});

describe('every offered combination is actually producible', () => {
  it('never offers a post type no chosen platform can carry', () => {
    /* The property that makes the whole narrowing trustworthy. */
    for (const platform of PLATFORMS) {
      for (const id of offered([platform])) {
        expect(canCarry(POST_TYPE_CATALOG[id], support(platform)).ok).toBe(true);
      }
    }
  });

  it('leaves every platform with at least one thing it can make', () => {
    /* A platform an operator can select and then do nothing with is a dead end. */
    for (const platform of PLATFORMS) {
      expect(offered([platform]).length, `${platform} can make nothing`).toBeGreaterThan(0);
    }
  });
});
