/**
 * §453. The platform's preference and the piece's actual media are two things.
 *
 * `chooseFormat` picks from a static list — Instagram's is
 * `['image', 'carousel', 'video']` — **before the post type is resolved**, and
 * nothing reconciled them afterwards. Every Instagram piece was therefore
 * recorded as an image: an operator asking for a Short video got a
 * `short_video` post type, a screenplay staged for one, a 20.8-second Reels
 * length band, a voiceover, and a row that said `format: 'image'`.
 *
 * Measured when it was found: all seven Instagram pieces in the database, every
 * one an image. Instagram is the largest reach in this set and had never
 * produced a video through the normal path.
 */
import { describe, expect, it } from 'vitest';
import { POST_TYPE_CATALOG, POST_TYPES } from './postTypes.js';
import { chooseFormat } from '../generation/formatChoice.js';

describe('what a post type is made of', () => {
  it('every post type names the media it needs', () => {
    for (const id of POST_TYPES) {
      const type = POST_TYPE_CATALOG[id];
      expect(type.requires.format.length, id).toBeGreaterThan(0);
    }
  });

  /*
   * The case that was silently wrong. If these ever agreed, the bug would have
   * been invisible on Instagram too — which is why it survived: on TikTok and
   * YouTube, whose preference lists hold only `video`, the guess happened to be
   * right every time.
   */
  it('a platform preference can disagree with the post type, and the post type wins', () => {
    const guessed = chooseFormat('instagram', ['image', 'carousel', 'video', 'story']);
    expect(guessed).toBe('image');
    expect(POST_TYPE_CATALOG.short_video.requires.format).toBe('video');
    expect(POST_TYPE_CATALOG.short_video.requires.format).not.toBe(guessed);
  });

  it('agrees with the preference wherever the platform has only one answer', () => {
    for (const platform of ['tiktok', 'youtube'] as const) {
      expect(chooseFormat(platform, ['video'])).toBe(
        POST_TYPE_CATALOG.short_video.requires.format,
      );
    }
  });

  it('never names a media kind no adapter could carry', () => {
    const known = new Set(['text', 'image', 'carousel', 'video', 'pin', 'story']);
    for (const id of POST_TYPES) {
      expect(known.has(POST_TYPE_CATALOG[id].requires.format), id).toBe(true);
    }
  });

  /*
   * A moving post type must ask for video. This is the property the mislabelled
   * rows violated: the piece ran a voiceover and a render, and its row said
   * image, so every reader downstream — the queue's badge, the visual gate's
   * bounds, the backlog ceiling — was looking at the wrong kind of thing.
   */
  it('a post type on a video channel is made of video', () => {
    for (const id of POST_TYPES) {
      const type = POST_TYPE_CATALOG[id];
      if (type.channel !== 'short_video' && type.channel !== 'long_video') continue;
      expect(type.requires.format, id).toBe('video');
    }
  });
});
