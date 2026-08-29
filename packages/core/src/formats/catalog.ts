/**
 * §277. The format family — content that is not a product demonstration.
 *
 * An account that only posts "here is a thing, converted" is a catalogue. These
 * are the other shapes: a quiz, a piece of history, a list of tips, a myth
 * corrected, two things compared, a full recipe.
 *
 * ## What a format is
 *
 * A **structure with slots**, not a topic. That distinction is what makes the
 * whole family work:
 *
 * - It renders deterministically, because the slots map onto layouts that
 *   already exist. A quiz is question → options → beat → answer, five times.
 * - It is gradeable, because the gates check slots rather than prose.
 * - It is **product-agnostic**. Nothing here knows what a recipe is. A format
 *   describes the shape of an argument, and every product attached to Halyard
 *   has arguments to make.
 *
 * ## Evidence is the hard part
 *
 * A product post makes claims about the product, and the claims gate checks them
 * against the artifact. A *history* post makes claims about the world, and there
 * is no artifact to check them against.
 *
 * That is the risk this family introduces, and it is a serious one: an account
 * whose entire pitch is "we know what is in your food" cannot get a fact wrong.
 * A wrong fact is also the most screenshottable mistake there is.
 *
 * So each format declares `factuality`, and the formats that assert things about
 * the world **require a citable source per claim**. Gotcha 9 applies here
 * exactly as it does to metrics: sourced, or not published.
 */

/**
 * Every editorial format Halyard can produce. Ids are stable; they reach the
 * database.
 *
 * Named `PostFormat` and not `PostFormat` because that name is taken, and by
 * a different idea: `generation/formatChoice.ts` uses `PostFormat` for the
 * *media* type — text, image, carousel, video. This is the *editorial* shape,
 * and the two are orthogonal. A quiz is a `PostFormat`; it can be rendered as
 * video or as a carousel, which is its `PostFormat`.
 */
import { platformsForFormat, type ChannelId } from '../channels/channels.js';

export const POST_FORMATS = [
  'quiz',
  'history',
  'tips',
  'recipe',
  'myth_fact',
  'comparison',
  'origin',
  'transformation',
] as const;

export type PostFormatId = (typeof POST_FORMATS)[number];

/**
 * How much of what this format says is a claim about the world.
 *
 * - `product` — claims are about the product and check against the artifact.
 * - `sourced` — claims are about the world and each needs a citation.
 * - `craft` — technique and opinion; no external fact to get wrong.
 */
export type Factuality = 'product' | 'sourced' | 'craft';

/** The pillars from `CONTENT_QUALITY_PLAN.md`, in product-neutral terms. */
export type Pillar = 'demonstrate' | 'teach' | 'warn' | 'entertain' | 'prove';

export interface FormatSlot {
  key: string;
  /** What goes here, written for the writer agent rather than for a reader. */
  brief: string;
  /** Hard ceiling. Slots are for cards and cards have edges. */
  maxWords: number;
  /** How many of this slot a piece has. A quiz has five questions. */
  repeats?: number;
}

export interface PostFormat {
  id: PostFormatId;
  /** Shown in the composer's picker. */
  name: string;
  /** One line an operator reads when choosing. */
  intent: string;
  pillar: Pillar;
  factuality: Factuality;
  /**
   * The briefs this shape suits. Platforms are **derived** from these.
   *
   * A hand-written platform list beside the channel's own platform list is the
   * same relationship written twice, and gotcha 1 is the standing lesson about
   * exactly that. A format says what kind of thing it is; the channel says
   * which surfaces share that brief.
   */
  channels: ChannelId[];
  /** The structure, in order. */
  slots: FormatSlot[];
  /**
   * Whether this format needs the product artifact to exist.
   *
   * The point of the family is that most of them do not — a quiz about food
   * history can be made on a day when no recipe was adapted, which is what
   * keeps an account posting.
   */
  needsArtifact: boolean;
  /** Roughly, for a vertical video. Carousels ignore it. */
  targetSeconds: number;
}

export const POST_FORMAT_CATALOG: Record<PostFormatId, PostFormat> = {
  quiz: {
    id: 'quiz',
    name: 'Quiz',
    intent: 'Five questions, thirty seconds. The viewer answers in the comments.',
    pillar: 'entertain',
    factuality: 'sourced',
    channels: ['short_video'],
    needsArtifact: false,
    targetSeconds: 30,
    slots: [
      { key: 'title', brief: 'The challenge, as a dare. Under eight words.', maxWords: 8 },
      {
        key: 'question',
        brief: 'A question with one unambiguous answer and a real source. Not a matter of opinion.',
        maxWords: 14,
        repeats: 5,
      },
      {
        key: 'answer',
        brief: 'The answer, then one clause of why it is interesting.',
        maxWords: 18,
        repeats: 5,
      },
      { key: 'close', brief: 'How many did they get. One line, no hard sell.', maxWords: 12 },
    ],
  },

  history: {
    id: 'history',
    name: 'History',
    intent: 'One surprising true thing, told as a story with a turn.',
    pillar: 'entertain',
    factuality: 'sourced',
    channels: ['short_video', 'text_post', 'long_video'],
    needsArtifact: false,
    targetSeconds: 35,
    slots: [
      { key: 'hook', brief: 'The surprising fact, stated flat. No preamble.', maxWords: 12 },
      { key: 'setup', brief: 'What everyone assumes instead.', maxWords: 25 },
      { key: 'turn', brief: 'The thing that makes it surprising.', maxWords: 30 },
      { key: 'why_it_matters', brief: 'Why it still matters to the reader today.', maxWords: 25 },
      { key: 'source', brief: 'Who established this and when. A real citation.', maxWords: 15 },
    ],
  },

  tips: {
    id: 'tips',
    name: 'Tips',
    intent: 'Three to five things, numbered, each one line. The highest save rate.',
    pillar: 'teach',
    factuality: 'craft',
    channels: ['short_video', 'text_post', 'carousel'],
    needsArtifact: false,
    targetSeconds: 30,
    slots: [
      { key: 'title', brief: 'What these tips are for. Specific, not "5 tips".', maxWords: 10 },
      { key: 'tip', brief: 'One actionable instruction. Imperative mood.', maxWords: 16, repeats: 5 },
      { key: 'close', brief: 'The one that matters most, named.', maxWords: 14 },
    ],
  },

  recipe: {
    id: 'recipe',
    name: 'Full recipe',
    intent: 'Picture, ingredients, steps. The thing people came for, and the most saved.',
    pillar: 'teach',
    factuality: 'product',
    channels: ['carousel', 'long_video'],
    needsArtifact: true,
    targetSeconds: 45,
    slots: [
      { key: 'title', brief: 'What it is. Plain, searchable, no adjectives.', maxWords: 8 },
      { key: 'ingredient', brief: 'One ingredient with its quantity.', maxWords: 10, repeats: 8 },
      { key: 'step', brief: 'One step, imperative, with the thing to watch for.', maxWords: 20, repeats: 6 },
      { key: 'note', brief: 'The one mistake people make.', maxWords: 20 },
    ],
  },

  myth_fact: {
    id: 'myth_fact',
    name: 'Myth vs fact',
    intent: 'A thing people believe that is true but misleading, corrected carefully.',
    pillar: 'warn',
    factuality: 'sourced',
    channels: ['short_video', 'text_post', 'carousel'],
    needsArtifact: false,
    targetSeconds: 25,
    slots: [
      { key: 'myth', brief: 'The belief, stated as its believers would state it.', maxWords: 12 },
      { key: 'partly_true', brief: 'What is genuinely right about it. Concede first.', maxWords: 25 },
      { key: 'correction', brief: 'What it misses, and what follows from that.', maxWords: 30 },
      { key: 'source', brief: 'Who says so. A real citation.', maxWords: 15 },
    ],
  },

  comparison: {
    id: 'comparison',
    name: 'Comparison',
    intent: 'Two options, side by side, with the tradeoff named.',
    pillar: 'teach',
    factuality: 'craft',
    channels: ['text_post', 'carousel', 'long_video'],
    needsArtifact: false,
    targetSeconds: 30,
    slots: [
      { key: 'question', brief: 'The choice a reader is actually facing.', maxWords: 12 },
      { key: 'option_a', brief: 'The first option and what it is good at.', maxWords: 22 },
      { key: 'option_b', brief: 'The second option and what it is good at.', maxWords: 22 },
      { key: 'verdict', brief: 'When to pick each. Never "it depends" alone.', maxWords: 25 },
    ],
  },

  origin: {
    id: 'origin',
    name: 'Origin',
    intent: 'How a thing got to be the way it is. The widest net in the family.',
    pillar: 'entertain',
    factuality: 'sourced',
    channels: ['short_video', 'long_video'],
    needsArtifact: false,
    targetSeconds: 40,
    slots: [
      { key: 'hook', brief: 'The thing everyone eats and nobody questions.', maxWords: 12 },
      { key: 'before', brief: 'What it was before.', maxWords: 25 },
      { key: 'change', brief: 'What changed it, and who.', maxWords: 30 },
      { key: 'now', brief: 'The version we have now, and what was lost.', maxWords: 25 },
      { key: 'source', brief: 'Who established this. A real citation.', maxWords: 15 },
    ],
  },

  transformation: {
    id: 'transformation',
    name: 'Transformation',
    intent: 'The product doing its job: before, the change, and what it costs.',
    pillar: 'demonstrate',
    factuality: 'product',
    channels: ['short_video', 'text_post', 'carousel'],
    needsArtifact: true,
    targetSeconds: 30,
    slots: [
      { key: 'hook', brief: 'The problem, as the reader would say it.', maxWords: 12 },
      { key: 'before', brief: 'What the original does.', maxWords: 20 },
      { key: 'change', brief: 'The swap, precisely, with quantities.', maxWords: 22 },
      { key: 'cost', brief: 'What is lost. Never omitted — it is the differentiator.', maxWords: 20 },
    ],
  },
};

export function formatById(id: string): PostFormat | null {
  return (POST_FORMAT_CATALOG as Record<string, PostFormat>)[id] ?? null;
}

/**
 * The formats a platform can carry, for the composer's picker.
 *
 * Derived through the channel rather than from a list on the format, so there
 * is one place that says which platforms share a brief.
 */
export function formatsForPlatform(platform: string): PostFormat[] {
  return POST_FORMATS.map((id) => POST_FORMAT_CATALOG[id]).filter((f) =>
    platformsForFormat(f.id).includes(platform),
  );
}

/** Whether this shape can run on this platform at all. */
export function formatCarries(format: PostFormat, platform: string): boolean {
  return platformsForFormat(format.id).includes(platform);
}

/**
 * Does this format's structure require a source for every worldly claim?
 *
 * Separated from `factuality` so a caller reads intent rather than comparing
 * string literals, and so the rule has one place to change.
 */
export function requiresCitation(format: PostFormat): boolean {
  return format.factuality === 'sourced';
}

/**
 * The slots a piece must fill, expanded by their repeats.
 *
 * Returned flat because that is what a writer is briefed with and what a
 * completeness check counts. A quiz asks for five questions, not one slot with
 * a number attached.
 */
export function expandSlots(format: PostFormat): Array<FormatSlot & { index: number }> {
  const out: Array<FormatSlot & { index: number }> = [];
  for (const slot of format.slots) {
    const times = slot.repeats ?? 1;
    for (let i = 0; i < times; i += 1) out.push({ ...slot, index: i });
  }
  return out;
}
