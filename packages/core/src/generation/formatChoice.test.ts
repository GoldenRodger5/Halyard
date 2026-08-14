import { describe, expect, it } from 'vitest';
import { chooseFormat, needsVideo, NoUsableFormatError } from './formatChoice.js';
import { TIKTOK_CONSTRAINTS } from '../adapters/tiktok.js';
import { YOUTUBE_CONSTRAINTS } from '../adapters/youtube.js';
import { PINTEREST_CONSTRAINTS } from '../adapters/pinterest.js';

describe('chooseFormat', () => {
  it('gives TikTok video, which is the only thing it accepts', () => {
    /**
     * Generation hardcoded `pinterest ? 'pin' : 'image'`, so every TikTok draft
     * ever produced was an image — a format the adapter cannot publish. It has
     * never surfaced only because nothing has published yet.
     */
    expect(chooseFormat('tiktok', TIKTOK_CONSTRAINTS.supportedFormats)).toBe('video');
  });

  it('gives YouTube video too, for the same reason', () => {
    expect(chooseFormat('youtube', YOUTUBE_CONSTRAINTS.supportedFormats)).toBe('video');
  });

  it('gives Pinterest a pin rather than an image', () => {
    expect(chooseFormat('pinterest', PINTEREST_CONSTRAINTS.supportedFormats)).toBe('pin');
  });

  it('keeps image-led feeds on images even though they accept video', () => {
    // A video on an image-led feed costs a render and a voiceover for no
    // measured gain. That trade changes with data, not with taste.
    expect(chooseFormat('instagram', ['image', 'carousel', 'video', 'story'])).toBe('image');
  });

  it('refuses rather than defaulting when the account reports nothing', () => {
    /**
     * A fallback that is always *a* valid value is indistinguishable from a
     * correct one until something tries to publish it — which is precisely how
     * the original bug stayed invisible.
     */
    expect(() => chooseFormat('tiktok', [])).toThrow(NoUsableFormatError);
    expect(() => chooseFormat('tiktok', [])).toThrow(/Reconnect the account/);
  });

  it('refuses when nothing the platform accepts can be produced here', () => {
    expect(() => chooseFormat('somewhere', ['hologram'])).toThrow(/none of which/);
  });

  it('agrees with every real adapter about what it can take', () => {
    // Pinned against the adapters themselves rather than a copy of their
    // values, so a capability change cannot drift away from this decision.
    for (const [platform, constraints] of [
      ['tiktok', TIKTOK_CONSTRAINTS],
      ['youtube', YOUTUBE_CONSTRAINTS],
      ['pinterest', PINTEREST_CONSTRAINTS],
    ] as const) {
      const chosen = chooseFormat(platform, constraints.supportedFormats);
      expect(constraints.supportedFormats, `${platform} cannot publish ${chosen}`).toContain(
        chosen,
      );
    }
  });
});

describe('needsVideo', () => {
  it('is true only for video', () => {
    expect(needsVideo('video')).toBe(true);
    expect(needsVideo('image')).toBe(false);
    expect(needsVideo('pin')).toBe(false);
  });
});
