/**
 * §295. Channels — the brief, above the platform.
 *
 * A platform is the wrong unit for a creative decision: TikTok, Reels and
 * Shorts are one brief, and X and Threads are another. The value of this layer
 * is that a rule gets written once, so most of what is asserted here is that
 * the two catalogues cannot drift apart.
 */
import { describe, expect, it } from 'vitest';
import {
  CHANNELS,
  CHANNEL_CATALOG,
  channelById,
  channelForPlatform,
  formatsForChannel,
  platformsForFormat,
} from './channels.js';
import { POST_FORMATS, POST_FORMAT_CATALOG } from '../formats/catalog.js';

describe('the channel catalogue', () => {
  it('keeps id and key in step', () => {
    for (const id of CHANNELS) expect(CHANNEL_CATALOG[id].id).toBe(id);
  });

  it('gives every channel platforms, an opening rule and an action', () => {
    for (const id of CHANNELS) {
      const c = CHANNEL_CATALOG[id];
      expect(c.platforms.length, id).toBeGreaterThan(0);
      expect(c.opening.rule.length, id).toBeGreaterThan(20);
      expect(c.primaryAction.length, id).toBeGreaterThan(5);
    }
  });

  it('holds the tightest opening budget on the tightest channel', () => {
    /* Whatever holds on TikTok holds across short video; long video gets 30s. */
    expect(CHANNEL_CATALOG.short_video.opening.decisionSeconds).toBeLessThanOrEqual(1);
    expect(CHANNEL_CATALOG.long_video.opening.decisionSeconds).toBeGreaterThan(10);
  });

  it('routes each platform to exactly one brief', () => {
    expect(channelForPlatform('tiktok')).toBe('short_video');
    expect(channelForPlatform('x')).toBe('text_post');
    expect(channelForPlatform('threads')).toBe('text_post');
  });

  it('splits Instagram by what is being made, because a Reel is not a carousel', () => {
    expect(channelForPlatform('instagram', 'video')).toBe('short_video');
    expect(channelForPlatform('instagram', 'carousel')).toBe('carousel');
    /* Unknown defaults to the one that cannot silently produce a video. */
    expect(channelForPlatform('instagram')).toBe('carousel');
  });

  it('splits YouTube the same way', () => {
    expect(channelForPlatform('youtube', 'long_form')).toBe('long_video');
    expect(channelForPlatform('youtube')).toBe('short_video');
  });

  it('serves Pinterest, which was half-deferred', () => {
    /*
     * §431. Pinterest was deliberately deferred here and offered everywhere
     * else: a `pinterest_tall` template registered and enabled, an account
     * connected with `supported_formats: {pin, image}`, a `pin` post type in
     * the catalogue, and a Pin button on the Floor. `platformsForFormat`
     * derives platforms from channels, so no format carried Pinterest and the
     * Floor refused every attempt — "Tips cannot run on pinterest" — while
     * still offering the button. Zero pins have ever been made, and not for
     * want of trying: it was impossible.
     *
     * Deferring a platform is a fair decision. Deferring it in one file and
     * offering it in four others is the state this replaces.
     */
    expect(channelForPlatform('pinterest')).toBe('pin');
  });

  it('still returns null for a platform genuinely nothing serves', () => {
    /* Facebook remains deferred, and deferred all the way through. */
    expect(channelForPlatform('facebook')).toBeNull();
    expect(channelById('nope')).toBeNull();
  });
});

describe('the two catalogues cannot drift', () => {
  it('derives a format\'s platforms from its channels, never a second list', () => {
    /*
     * The whole reason this layer exists. A `platforms` array on the format
     * beside a `platforms` array on the channel is the same relationship
     * written twice — gotcha 1, which `jobs_kind_check` is the standing lesson
     * about.
     */
    for (const id of POST_FORMATS) {
      const viaChannels = new Set(
        POST_FORMAT_CATALOG[id].channels.flatMap((c) => CHANNEL_CATALOG[c].platforms),
      );
      expect(new Set(platformsForFormat(id)), id).toEqual(viaChannels);
    }
  });

  it('names only channels that exist', () => {
    for (const id of POST_FORMATS) {
      for (const channel of POST_FORMAT_CATALOG[id].channels) {
        expect(CHANNELS, `${id} -> ${channel}`).toContain(channel);
      }
    }
  });

  it('gives every originating channel at least one format to run', () => {
    /*
     * A channel that plans posts and has no formats is a brief with no
     * writers. `reply` is the exception and says so: it responds to a
     * conversation rather than filling a shape, so "no formats" is the design
     * rather than an omission — and declaring it is what lets this test tell
     * the two apart.
     */
    for (const id of CHANNELS) {
      const channel = CHANNEL_CATALOG[id];
      if (!channel.originates) {
        expect(formatsForChannel(id), id).toHaveLength(0);
        continue;
      }
      expect(formatsForChannel(id).length, id).toBeGreaterThan(0);
    }
  });

  it('gives every format at least one channel', () => {
    for (const id of POST_FORMATS) {
      expect(POST_FORMAT_CATALOG[id].channels.length, id).toBeGreaterThan(0);
    }
  });

  it('agrees in both directions', () => {
    /* If a channel lists a format, that format must claim the channel. */
    for (const channel of CHANNELS) {
      for (const format of formatsForChannel(channel)) {
        expect(POST_FORMAT_CATALOG[format].channels, `${channel} <-> ${format}`).toContain(channel);
      }
    }
  });
});
