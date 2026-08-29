/**
 * §295. Channels — the four kinds of thing Halyard makes.
 *
 * Halyard has had *platforms* (tiktok, x, instagram…) since the beginning, and
 * a platform is the wrong unit for almost every creative decision. TikTok,
 * Reels and Shorts are the same brief: a short vertical video that has to win
 * in half a second. X and Threads are the same brief: text that lives or dies
 * on its first line. Treating them as six separate destinations means writing
 * the same rule six times and getting it slightly different each time.
 *
 * A **channel** is a brief. Everything creative hangs off it — the formats that
 * can run there, how long a piece is, whether it needs a voice, what the opening
 * has to do, how the caption behaves. A platform belongs to exactly one channel
 * and contributes only its own constraints on top: character limits, aspect
 * ratios, what its API will actually accept.
 *
 * ## Why this is not a refactor for tidiness
 *
 * The 2026-08-29 review found every video looking identical because the shared
 * shell was flat. The same shape of problem exists a level up: a "quiz" and a
 * "history" and a "transformation" were all being made the same way because
 * nothing above the format said what *kind of thing* was being made. A channel
 * is that missing level.
 *
 * ## Product-agnostic, and this is where that gets real
 *
 * None of this knows what a recipe is. A channel describes a brief; a product
 * supplies the palette, the typography, the voice and the subject matter. The
 * same four channels serve a recipe adapter and a film log, and the output
 * should look nothing alike — because the *product* differs, not the channel.
 */
import { POST_FORMATS, POST_FORMAT_CATALOG, type PostFormatId } from '../formats/catalog.js';

export const CHANNELS = ['short_video', 'text_post', 'carousel', 'long_video', 'story', 'reply'] as const;
export type ChannelId = (typeof CHANNELS)[number];

/** What the opening has to accomplish, in the time it has. */
export interface OpeningBrief {
  /** Seconds before a viewer decides. The single most important number here. */
  decisionSeconds: number;
  /** What must be true of the first frame or first line. */
  rule: string;
}

export interface Channel {
  id: ChannelId;
  name: string;
  /** One line an operator reads when choosing. */
  intent: string;
  /** Platforms whose brief this is. */
  platforms: string[];
  /** Null where length is not the constraint — a text post has no runtime. */
  targetSeconds: { min: number; max: number } | null;
  opening: OpeningBrief;
  /** Whether a piece here is normally spoken. */
  needsVoice: boolean;
  /** Whether motion is the medium, as opposed to an option. */
  needsMotion: boolean;
  /**
   * What a viewer is being asked to do. Drives the closing beat, and differs
   * more than the format does: a Reel asks for a save, a text post asks for a
   * reply, a long video asks for the next video.
   */
  primaryAction: string;
  /**
   * §297. Whether this channel *originates* a piece from a format.
   *
   * Everything else here plans a post from a shape. A reply does not: it is a
   * response to something somebody else said, so it has no format to fill and
   * no slot to plan — the input is the conversation, not the catalogue.
   *
   * Declared rather than inferred, because "no formats" otherwise reads
   * identically to "somebody forgot to add formats", and the drift test cannot
   * tell those apart.
   */
  originates: boolean;
}

export const CHANNEL_CATALOG: Record<ChannelId, Channel> = {
  short_video: {
    id: 'short_video',
    originates: true,
    name: 'Short video',
    intent: 'Vertical video that has to win the first half second. TikTok, Reels, Shorts.',
    platforms: ['tiktok', 'instagram', 'youtube'],
    targetSeconds: { min: 15, max: 45 },
    opening: {
      /*
       * The tightest window in the system. TikTok decides in roughly half a
       * second and Shorts gives one to two, so the brief takes the strictest
       * of them: whatever holds on TikTok holds everywhere in this channel.
       */
      decisionSeconds: 0.5,
      rule: 'The first frame is composed and legible before anything animates. No entrance on the hook.',
    },
    needsVoice: true,
    needsMotion: true,
    primaryAction: 'save it, or answer in the comments',
  },

  text_post: {
    id: 'text_post',
    originates: true,
    name: 'Text post',
    intent: 'A single idea that lives or dies on its first line. X and Threads.',
    platforms: ['x', 'threads'],
    targetSeconds: null,
    opening: {
      /*
       * A reader's eye is on the first line before the rest renders, so the
       * budget is a line rather than a duration.
       */
      decisionSeconds: 0,
      rule: 'The first line stands alone. It must be worth reading with no context and no image.',
    },
    needsVoice: false,
    needsMotion: false,
    primaryAction: 'reply, or quote it',
  },

  carousel: {
    id: 'carousel',
    originates: true,
    name: 'Carousel',
    intent: 'A swipeable argument. Instagram, and the highest save rate available.',
    platforms: ['instagram'],
    targetSeconds: null,
    opening: {
      decisionSeconds: 1,
      rule: 'Slide one earns the swipe on its own, and every slide after it points right.',
    },
    needsVoice: false,
    needsMotion: false,
    primaryAction: 'save it for later',
  },

  /**
   * §297. Disposable, interactive, and gone in a day.
   *
   * A story is not a short video with a shorter shelf life — the brief is
   * different in a way that changes everything downstream. Nobody saves a
   * story, so a save-oriented close is wasted on it; production value reads as
   * *wrong* rather than good, because the form's whole signal is immediacy; and
   * it is the only channel where asking a question outright is native rather
   * than needy.
   */
  story: {
    id: 'story',
    originates: true,
    name: 'Story',
    intent: 'Disposable and interactive. A poll, a question, a look behind the thing.',
    platforms: ['instagram'],
    targetSeconds: { min: 5, max: 15 },
    opening: {
      decisionSeconds: 1,
      rule: 'One idea, legible in a glance, tappable. Nobody watches a story twice.',
    },
    needsVoice: false,
    /* Movement, but not production. A story that looks made loses the form. */
    needsMotion: false,
    primaryAction: 'tap the poll, or reply',
  },

  /**
   * §297. The channel nobody builds because it does not look like content.
   *
   * Replies carry more algorithmic weight than likes and are the highest-
   * leverage growth surface on X, and Halyard already has the parts — a comment
   * system, a Reply Writer in the registry, an Engagement team in the spec.
   * What it lacked was a *channel*, so replies were never planned, never
   * scheduled and never counted as output.
   *
   * The brief is unlike any other here: it is a response to something somebody
   * else said, so the opening rule is about earning the interruption rather
   * than stopping a scroll.
   */
  reply: {
    id: 'reply',
    originates: false,
    name: 'Reply',
    intent: 'A response worth reading under someone else’s post. The cheapest reach there is.',
    platforms: ['x', 'threads', 'instagram'],
    targetSeconds: null,
    opening: {
      decisionSeconds: 0,
      rule: 'Add something the original did not say. Never restate it, never sell.',
    },
    needsVoice: false,
    needsMotion: false,
    primaryAction: 'continue the conversation',
  },

  long_video: {
    id: 'long_video',
    originates: true,
    name: 'Long video',
    intent: 'A explainer with chapters and a real narrative. YouTube.',
    platforms: ['youtube'],
    targetSeconds: { min: 240, max: 600 },
    opening: {
      /*
       * Thirty seconds, and the steepest drop in the whole curve. Long enough
       * to promise something and far too long to spend on a logo.
       */
      decisionSeconds: 30,
      rule: 'Result first, then the promise, then the process. No throat-clearing and no intro card.',
    },
    needsVoice: true,
    needsMotion: true,
    primaryAction: 'watch the next one',
  },
};

/** The channel a platform belongs to, or null for one nothing was written for. */
export function channelForPlatform(platform: string, format?: string): ChannelId | null {
  /*
   * Instagram is the one platform in two channels — a Reel and a carousel are
   * completely different briefs on the same account. The media format decides,
   * and where it is unknown the carousel is the safer default: it is the one
   * that does not silently produce a video nobody asked for.
   */
  if (platform === 'instagram') {
    return format === 'video' || format === 'reel' ? 'short_video' : 'carousel';
  }
  if (platform === 'youtube') {
    return format === 'long_form' ? 'long_video' : 'short_video';
  }
  for (const id of CHANNELS) {
    if (CHANNEL_CATALOG[id].platforms.includes(platform)) return id;
  }
  return null;
}

export function channelById(id: string): Channel | null {
  return (CHANNEL_CATALOG as Record<string, Channel>)[id] ?? null;
}

/**
 * Formats this channel can carry.
 *
 * **Derived, never listed.** A `Channel.formats` array beside
 * `PostFormat.channels` would be the same relationship written twice, and the
 * two would drift — which is `JOB_KINDS` and `jobs_kind_check` exactly
 * (gotcha 1). The format declares which briefs it suits; the channel declares
 * which platforms share a brief; everything else is computed from those two.
 */
export function formatsForChannel(id: ChannelId): PostFormatId[] {
  return POST_FORMATS.filter((f) => POST_FORMAT_CATALOG[f].channels.includes(id));
}

/**
 * The platforms a format can run on, derived from its channels.
 *
 * This replaces the hand-written `platforms` list each format used to carry.
 * That list was the second source of truth: a format could claim a platform its
 * channel did not serve, and nothing would notice until a piece was made for a
 * surface that could not carry it.
 */
export function platformsForFormat(format: PostFormatId): string[] {
  const out = new Set<string>();
  for (const channel of POST_FORMAT_CATALOG[format].channels) {
    for (const platform of CHANNEL_CATALOG[channel].platforms) out.add(platform);
  }
  return [...out];
}
