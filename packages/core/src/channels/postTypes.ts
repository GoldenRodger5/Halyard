/**
 * §349. Post type is the unit of production. Platform is a destination.
 *
 * Halyard has organised creative work by *channel* since §295 — a good idea,
 * half applied. A channel carried a hand-written `platforms` list, and that
 * list has already drifted from what the adapters say: `carousel.platforms` is
 * `['instagram']` while the Threads adapter has declared `carousel` support all
 * along, and the TikTok adapter says `video` only although TikTok has carried
 * photo carousels for years.
 *
 * Two lists, both hand-maintained, already disagreeing. That is gotcha 1 at
 * architecture scale, and the fix is the same one §295 used for
 * `platformsForFormat`: **derive it.**
 *
 * ## Why post type and not platform
 *
 * A short video for TikTok, Reels and Shorts is *one production*. Same
 * screenplay, same voice, same music, same render — differing only in a crop, a
 * caption length and whether trending audio is reachable. Organising the
 * pipeline by platform would build that piece three times.
 *
 * Meanwhile a caption-only post and a video share almost nothing but a brief,
 * and running them through one sequence means deciding by `if` at every step,
 * which is what `generate.ts` does today.
 *
 * So: **the post type decides what is made and which stages run; the platform
 * decides where it goes and what it must be trimmed to.**
 *
 * ## Granularity
 *
 * Deliberately finer than the six channels. `caption_only` and `caption_link`
 * are separate because a link changes the cost on X (~$0.015 against ~$0.20),
 * changes where the link goes on every platform, and changes what the copy has
 * to do. A carousel of images and a carousel mixing images and video are
 * separate because Instagram requires one aspect ratio across a carousel and a
 * video slide is a different production per slide.
 *
 * The rule for splitting: **two things are different post types when they need
 * different stages, different constraints, or different destinations.** Not
 * when they merely look different.
 */
import type { ChannelId } from './channels.js';
import type { MediaKind } from '../creative/productionPlan.js';
import type { ContentFormat } from '../generation/formatChoice.js';

export const POST_TYPES = [
  'caption_only',
  'caption_link',
  'single_image',
  'carousel_images',
  'carousel_mixed',
  'short_video',
  'long_video',
  'story',
  'reply',
  'pin',
] as const;
export type PostTypeId = (typeof POST_TYPES)[number];

export interface PostType {
  id: PostTypeId;
  name: string;
  /** One line an operator reads when choosing. */
  intent: string;
  /** The creative brief this shares. */
  channel: ChannelId;
  /** What it is made of, for the stage plan. */
  media: MediaKind;
  /**
   * What an adapter must declare to carry this.
   *
   * The whole platform list is derived from this, so a platform that gains a
   * capability gains the post types that need it without anybody editing a
   * second list.
   */
  requires: {
    /**
     * A value from the adapter's `supportedFormats`.
     *
     * §453. Typed as `ContentFormat` rather than `string`, because this is the
     * authority on what a piece is **made of** and `chooseFormat` was quietly
     * disagreeing with it. Instagram's preference list put `image` first, so
     * every Instagram piece — including one an operator asked for as a Short
     * video, staged as a short video, and given a Reels length band — ran
     * `needsVideo(format) === false` and skipped the voiceover and the render
     * entirely.
     *
     * A `string` here let the two drift silently. The union makes them the same
     * vocabulary, so a post type asking for a media kind nothing can produce is
     * a compile error rather than a piece that quietly comes out as the wrong
     * thing.
     */
    format: ContentFormat;
    /** True when the piece is several media in one post. */
    carousel?: boolean;
    /** True when the post carries an outbound link in the post itself. */
    link?: boolean;
  };
  /** Seconds, for anything with a runtime. */
  seconds?: { min: number; max: number };
}

export const POST_TYPE_CATALOG: Record<PostTypeId, PostType> = {
  caption_only: {
    id: 'caption_only',
    name: 'Caption only',
    intent: 'One idea, in text. Lives or dies on the first line.',
    channel: 'text_post',
    media: 'text',
    requires: { format: 'text' },
  },

  caption_link: {
    id: 'caption_link',
    name: 'Caption with a link',
    intent: 'Text that sends someone somewhere. The copy has to earn the click.',
    channel: 'text_post',
    media: 'text',
    /*
     * Separate from `caption_only` because a link is not a decoration. On X it
     * multiplies the cost of a post by roughly thirteen; on Instagram and TikTok
     * it cannot go in the post at all; on Threads it can. The copy that earns a
     * click is not the copy that earns a reply.
     */
    requires: { format: 'text', link: true },
  },

  single_image: {
    id: 'single_image',
    name: 'Image with caption',
    intent: 'One picture doing the work, with the caption underneath it.',
    channel: 'text_post',
    media: 'image',
    requires: { format: 'image' },
  },

  carousel_images: {
    id: 'carousel_images',
    name: 'Carousel',
    intent: 'A swipeable argument. The highest save rate available.',
    channel: 'carousel',
    media: 'carousel',
    requires: { format: 'carousel', carousel: true },
  },

  carousel_mixed: {
    id: 'carousel_mixed',
    name: 'Carousel with video',
    intent: 'A swipeable argument where one slide moves.',
    channel: 'carousel',
    media: 'carousel',
    /*
     * Separate because a moving slide is a separate production — it needs a
     * render, and on a platform requiring one aspect ratio across the carousel
     * it constrains every still beside it.
     */
    requires: { format: 'carousel', carousel: true },
  },

  short_video: {
    id: 'short_video',
    name: 'Short video',
    intent: 'Vertical video that has to win the first half second.',
    channel: 'short_video',
    media: 'video',
    requires: { format: 'video' },
    seconds: { min: 15, max: 45 },
  },

  long_video: {
    id: 'long_video',
    name: 'Long video',
    intent: 'An explainer with chapters and a real narrative.',
    channel: 'long_video',
    media: 'video',
    requires: { format: 'video' },
    seconds: { min: 240, max: 600 },
  },

  story: {
    id: 'story',
    name: 'Story',
    intent: 'Disposable and interactive. Nobody watches a story twice.',
    channel: 'story',
    media: 'image',
    requires: { format: 'story' },
    seconds: { min: 5, max: 15 },
  },

  reply: {
    id: 'reply',
    name: 'Reply',
    intent: 'A response worth reading under someone else’s post.',
    channel: 'reply',
    media: 'text',
    requires: { format: 'text' },
  },

  pin: {
    id: 'pin',
    name: 'Pin',
    intent: 'Keyword-forward, long half-life, and the link is the point.',
    /*
     * §431. Its own channel, not `carousel`.
     *
     * `carousel`'s platforms are Instagram alone, so a pin pointed at it could
     * never reach Pinterest — and `platformsForFormat` derives from channels,
     * so no format carried Pinterest and the Floor refused every pin.
     */
    channel: 'pin',
    media: 'image',
    requires: { format: 'pin', link: true },
  },
};

/**
 * What a platform must declare for a post type to be offered on it.
 *
 * Takes the adapter's own constraints rather than a list beside them, so the
 * two can never disagree — the failure this module exists to end.
 */
export interface PlatformSupport {
  platform: string;
  supportedFormats: readonly string[];
  carousel?: { min: number; max: number; sameAspectRatioRequired?: boolean } | undefined;
  linkStrategy: string;
  video?: { minSeconds: number; maxSeconds: number } | undefined;
}

export interface Carriage {
  ok: boolean;
  /** Why not, in a line an operator can read on a disabled button. */
  because: string;
}

/**
 * Can this platform carry this post type?
 *
 * Every answer is derived from what the adapter declares. A platform that
 * gains carousel support gains carousel post types on the next deploy without
 * anybody remembering to update a list.
 */
export function canCarry(postType: PostType, support: PlatformSupport): Carriage {
  if (!support.supportedFormats.includes(postType.requires.format)) {
    return {
      ok: false,
      because: `${support.platform} does not accept ${postType.requires.format}.`,
    };
  }

  if (postType.requires.carousel && !support.carousel) {
    return {
      ok: false,
      because: `${support.platform} accepts single media only, not a carousel.`,
    };
  }

  /*
   * A link post needs the link *in the post*. `bio_only` means the platform
   * will not carry one, which is not a formatting detail — it is the post type
   * being impossible there, and offering it would produce a piece whose whole
   * purpose is unreachable.
   */
  if (postType.requires.link && support.linkStrategy === 'bio_only') {
    return {
      ok: false,
      because: `${support.platform} allows no link in a post, so a link post cannot work there.`,
    };
  }

  /*
   * A runtime the platform cannot accept. YouTube carries ten minutes and X
   * carries two and a bit, so a long video is genuinely impossible on X rather
   * than merely unusual.
   */
  if (postType.seconds && support.video) {
    if (postType.seconds.min > support.video.maxSeconds) {
      return {
        ok: false,
        because: `${support.platform} accepts at most ${support.video.maxSeconds}s and this needs at least ${postType.seconds.min}s.`,
      };
    }
  }

  return { ok: true, because: `${support.platform} accepts ${postType.requires.format}.` };
}

/** Every platform that can carry this post type, derived. */
export function platformsForPostType(
  postType: PostType,
  supports: readonly PlatformSupport[],
): string[] {
  return supports.filter((s) => canCarry(postType, s).ok).map((s) => s.platform);
}

/** Every post type a platform can carry, derived. Drives the operator's picker. */
export function postTypesForPlatform(
  support: PlatformSupport,
  types: readonly PostType[] = POST_TYPES.map((id) => POST_TYPE_CATALOG[id]),
): PostTypeId[] {
  return types.filter((t) => canCarry(t, support).ok).map((t) => t.id);
}

export function postTypeById(id: string): PostType | null {
  return (POST_TYPE_CATALOG as Record<string, PostType>)[id] ?? null;
}


/**
 * §350. A platform's support, read from its adapter rather than restated.
 *
 * The whole point of deriving is defeated by a second place that describes what
 * a platform can do, so this reads the adapter's own `PlatformConstraints` and
 * narrows it to the four facts `canCarry` needs.
 */
export function supportFromConstraints(
  platform: string,
  constraints: {
    supportedFormats: string[];
    carousel?: { min: number; max: number; sameAspectRatioRequired?: boolean };
    linkStrategy: string;
    video?: { minSeconds: number; maxSeconds: number };
  },
): PlatformSupport {
  return {
    platform,
    supportedFormats: constraints.supportedFormats,
    carousel: constraints.carousel,
    linkStrategy: constraints.linkStrategy,
    video: constraints.video,
  };
}
