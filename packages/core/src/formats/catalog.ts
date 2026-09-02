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
import type { Pace } from '../creative/length.js';

export const POST_FORMATS = [
  'quiz',
  'history',
  'tips',
  'recipe',
  'myth_fact',
  'comparison',
  'origin',
  'transformation',
  /* §318. Built around a recording rather than around writing. */
  'walkthrough',
  'poll',
  'behind',
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
  /** How many of this slot a piece has, at most. A quiz has five questions. */
  repeats?: number;
  /**
   * §439. The fewest of this slot that is still this format.
   *
   * A quiz is not a quiz with one question and it is perfectly a quiz with
   * three. Which of the two it gets is a *platform* decision — 32 seconds on
   * TikTok affords three, 48 on Shorts affords five — so the format declares
   * the range and `budgetFor` picks the point.
   *
   * Absent means the count is fixed and the budget must find its seconds
   * elsewhere. Slots that must move together — a question and its answer —
   * declare the same range, which is what keeps a reveal attached to the thing
   * it reveals.
   */
  repeatsMin?: number;
  /**
   * §439. The floor below which this slot stops being the thing it is.
   *
   * The budget scales every ceiling by one factor, and without a floor a tight
   * platform produces five-word quiz questions, which is a word game rather
   * than a quiz. Defaults to 45% of `maxWords`, never below three.
   */
  minWords?: number;
  /**
   * §341. Whether this slot makes a claim about the world.
   *
   * `factuality: 'sourced'` was applied to *every* slot in the format, so a
   * quiz's title — "How well do you know your film taste?" — was refused for
   * asserting something with no citable source. It asserts nothing; it is a
   * question, and the citation rule is about claims.
   *
   * The consequence was worse than a false positive: the writer retried three
   * times trying to cite a framing line, burning attempts it needed for the
   * questions that genuinely do require a source.
   *
   * Defaults to true for a sourced format, because the safe direction is to
   * demand a citation and be told a slot does not need one — the opposite
   * default would let a claim through by omission.
   */
  asserts?: boolean;
  /**
   * §341. Whether this slot is a question by design.
   *
   * `structure.question_density` is a caption rule: a post made of questions
   * reads as engagement bait. A quiz is made of questions, and the rule fired
   * on every one of them — a copy gate written for one shape, applied to
   * another where the shape is the point.
   */
  isQuestion?: boolean;
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
  /**
   * §318. Whether this format is built around a recording of the product.
   *
   * Different from `needsArtifact`. An artifact is a *result* the product
   * produced — an adapted recipe — and a format that needs one can be written
   * from it without anybody watching. A capture is a **recording of somebody
   * using the software**, and no amount of writing substitutes for it: this is
   * the one format family where the footage is the claim.
   *
   * Declared here so the Make page can offer it and the generator knows to
   * check for fresh footage before it starts, rather than discovering halfway
   * through that there is nothing to render into.
   */
  needsCapture?: boolean;
  /**
   * §439. How much room this shape needs, as a multiplier on the platform band.
   *
   * This replaces `targetSeconds`, which declared an absolute duration that
   * nothing read and that the format's own slot ceilings could not reach —
   * `quiz` asked for 30 seconds out of a structure implying 76.
   *
   * Absolute is the wrong kind of number for a format to hold. How long a piece
   * should be is a distribution question and distribution belongs to the
   * platform: the same quiz is 32 seconds on TikTok, where completion is the
   * ranking signal, and 48 on Shorts, where half the audience arrived from a
   * search and has already decided to watch. What the *format* knows is whether
   * its shape is hurried or roomy, and that is all this says.
   */
  pace: Pace;
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
    pace: 'standard',
    slots: [
      {
        key: 'title',
        brief: 'The challenge, as a dare. Under eight words.',
        maxWords: 8,
        /* §341. A dare asserts nothing, so it cites nothing. */
        asserts: false,
      },
      {
        key: 'question',
        brief: 'A question with one unambiguous answer and a real source. Not a matter of opinion.',
        maxWords: 14,
        /*
         * §439. Eight, not the 30% default of four. A four-word quiz question
         * is a word association game: it has no room to state the subject and
         * the constraint at once, which is what makes an answer checkable.
         * Where a platform's band cannot afford eight, `budgetFor` reports an
         * overrun and the pairing is refused — which is the right answer. A
         * quiz does not belong everywhere.
         */
        minWords: 8,
        repeats: 5,
        /* Moves in step with `answer`, so a reveal never loses its question. */
        repeatsMin: 3,
        isQuestion: true,
      },
      {
        key: 'answer',
        brief: 'The answer, then one clause of why it is interesting.',
        maxWords: 18,
        /* The answer plus its "one clause of why", which is the whole payoff. */
        minWords: 10,
        repeats: 5,
        repeatsMin: 3,
      },
      {
        key: 'close',
        brief: 'How many did they get. One line, no hard sell.',
        maxWords: 12,
        asserts: false,
        isQuestion: true,
      },
    ],
  },

  history: {
    id: 'history',
    name: 'History',
    intent: 'One surprising true thing, told as a story with a turn.',
    pillar: 'entertain',
    factuality: 'sourced',
    channels: ['short_video', 'text_post', 'long_video', 'pin'],
    needsArtifact: false,
    pace: 'unhurried',
    slots: [
      { key: 'hook', brief: 'The surprising fact, stated flat. No preamble.', maxWords: 12 },
      { key: 'setup', brief: 'What everyone assumes instead.', maxWords: 25 },
      { key: 'turn', brief: 'The thing that makes it surprising.', maxWords: 30, minWords: 14 },
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
    channels: ['short_video', 'text_post', 'carousel', 'pin'],
    needsArtifact: false,
    pace: 'standard',
    slots: [
      { key: 'title', brief: 'What these tips are for. Specific, not "5 tips".', maxWords: 10 },
            {
        key: 'tip',
        brief: 'One actionable instruction. Imperative mood.',
        maxWords: 16,
        repeats: 5,
        /* The intent line above already promised "three to five". */
        repeatsMin: 3,
      },
      { key: 'close', brief: 'The one that matters most, named.', maxWords: 14 },
    ],
  },

  recipe: {
    id: 'recipe',
    name: 'Full recipe',
    intent: 'Picture, ingredients, steps. The thing people came for, and the most saved.',
    pillar: 'teach',
    factuality: 'product',
    /*
     * §318. Carousel only, for now.
     *
     * It declared `long_video` and nothing could render one — a full recipe
     * read aloud is a four-to-ten minute piece and no composition exists for
     * that shape. `formatSlides.test.ts` now checks each format against the
     * channels it *claims*, and this was the claim that was not kept.
     *
     * Removed rather than papered over with the short-form composition, which
     * would have produced a twenty-second video for a slot asking for eight
     * minutes. It comes back when there is something to render it into.
     */
    channels: ['carousel', 'pin'],
    needsArtifact: true,
    pace: 'standard',
    slots: [
      { key: 'title', brief: 'What it is. Plain, searchable, no adjectives.', maxWords: 8 },
      { key: 'ingredient', brief: 'One ingredient with its quantity.', maxWords: 10, repeats: 8, repeatsMin: 4 },
      { key: 'step', brief: 'One step, imperative, with the thing to watch for.', maxWords: 20, repeats: 6, repeatsMin: 3 },
      { key: 'note', brief: 'The one mistake people make.', maxWords: 20 },
    ],
  },

  myth_fact: {
    id: 'myth_fact',
    name: 'Myth vs fact',
    intent: 'A thing people believe that is true but misleading, corrected carefully.',
    pillar: 'warn',
    factuality: 'sourced',
    channels: ['short_video', 'text_post', 'carousel', 'pin'],
    needsArtifact: false,
    pace: 'terse',
    slots: [
      { key: 'myth', brief: 'The belief, stated as its believers would state it.', maxWords: 12 },
      { key: 'partly_true', brief: 'What is genuinely right about it. Concede first.', maxWords: 25 },
            {
        key: 'correction',
        brief: 'What it misses, and what follows from that.',
        maxWords: 30,
        /* The payoff of the format. Everything before it is setup. */
        minWords: 14,
      },
      { key: 'source', brief: 'Who says so. A real citation.', maxWords: 15 },
    ],
  },

  comparison: {
    id: 'comparison',
    name: 'Comparison',
    intent: 'Two options, side by side, with the tradeoff named.',
    pillar: 'teach',
    factuality: 'craft',
    /*
     * §318. Same as `recipe`: `long_video` was a claim nothing could keep. A
     * comparison is a strong long-form shape and there is no composition for
     * one, so the channel comes back with the composition rather than before.
     */
    channels: ['text_post', 'carousel', 'pin'],
    needsArtifact: false,
    pace: 'standard',
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
    channels: ['short_video', 'long_video', 'pin'],
    needsArtifact: false,
    pace: 'unhurried',
    slots: [
      { key: 'hook', brief: 'The thing everyone eats and nobody questions.', maxWords: 12 },
      { key: 'before', brief: 'What it was before.', maxWords: 25 },
      { key: 'change', brief: 'What changed it, and who.', maxWords: 30, minWords: 14 },
      { key: 'now', brief: 'The version we have now, and what was lost.', maxWords: 25 },
      { key: 'source', brief: 'Who established this. A real citation.', maxWords: 15 },
    ],
  },

  /**
   * §297. A story format: ask, do not tell.
   *
   * A poll is the only shape in the catalogue whose value is the *response*
   * rather than the content. It is short because nobody watches a story twice,
   * and it has no citation requirement because an opinion is not a claim.
   */
  poll: {
    id: 'poll',
    name: 'Poll',
    intent: 'One question with two options. The answer is the point, not the post.',
    pillar: 'entertain',
    factuality: 'craft',
    channels: ['story'],
    needsArtifact: false,
    pace: 'terse',
    slots: [
      { key: 'question', brief: 'A real either/or people disagree about. Not a quiz.', maxWords: 12 },
      { key: 'option_a', brief: 'One side, in two or three words.', maxWords: 4 },
      { key: 'option_b', brief: 'The other side, same length.', maxWords: 4 },
    ],
  },

  /**
   * §297. The one place production value is a liability.
   *
   * A story that looks made loses the form — the whole signal is immediacy, so
   * this format exists to carry something unpolished on purpose.
   */
  behind: {
    id: 'behind',
    name: 'Behind it',
    intent: 'An unpolished look at the thing being made, or the mistake that happened.',
    pillar: 'entertain',
    factuality: 'craft',
    channels: ['story'],
    needsArtifact: false,
    pace: 'terse',
    slots: [
      { key: 'moment', brief: 'What is happening, said plainly. No setup.', maxWords: 14 },
      { key: 'aside', brief: 'The honest remark a person would actually make.', maxWords: 18 },
    ],
  },

  /**
   * §318. The product, in a phone, with the thing being explained pointed at.
   *
   * Spec §12 asked for "animated UI demonstrations" and §298 built the
   * composition for it — a drawn phone, a real screen recording inside, rings
   * on the taps. Nothing could ever ask for one: there was no format, so no
   * operator button, no planner entry, and no path from "I want a walkthrough"
   * to a video.
   *
   * The slots are short on purpose. A walkthrough's content is the recording;
   * the words are a frame around it, and a format that asked for five
   * paragraphs would produce a narrator talking over a demonstration that
   * already speaks for itself.
   */
  walkthrough: {
    id: 'walkthrough',
    name: 'Walkthrough',
    intent: 'A screen recording of the product being used, with the important moments pointed at.',
    pillar: 'demonstrate',
    factuality: 'product',
    channels: ['short_video'],
    needsArtifact: false,
    needsCapture: true,
    pace: 'standard',
    slots: [
      { key: 'title', brief: 'What is about to happen, in the viewer’s words.', maxWords: 10 },
      {
        key: 'why',
        brief: 'Why anybody would want this. One line, no feature list.',
        maxWords: 16,
      },
      { key: 'close', brief: 'What to do next. No hard sell.', maxWords: 10 },
    ],
  },

  transformation: {
    id: 'transformation',
    name: 'Transformation',
    intent: 'The product doing its job: before, the change, and what it costs.',
    pillar: 'demonstrate',
    factuality: 'product',
    channels: ['short_video', 'text_post', 'carousel', 'pin'],
    needsArtifact: true,
    pace: 'standard',
    slots: [
      { key: 'hook', brief: 'The problem, as the reader would say it.', maxWords: 12 },
      { key: 'before', brief: 'What the original does.', maxWords: 20 },
      { key: 'change', brief: 'The swap, precisely, with quantities.', maxWords: 22, minWords: 12 },
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
export function expandSlots(
  format: PostFormat,
  /**
   * §439. What the length budget decided this piece gets.
   *
   * Optional, and absent means the format's own maxima — which is the previous
   * behaviour exactly, and the right answer for a caller with no platform in
   * hand (a carousel, a coverage test, the composer's picker).
   *
   * When present it overrides both the count and the word ceiling, so the
   * writer's brief, the draft check and the render all read one budget rather
   * than three opinions about how long the piece is.
   */
  budget?: Array<{ key: string; repeats: number; maxWords: number }>,
): Array<FormatSlot & { index: number }> {
  const byKey = new Map((budget ?? []).map((b) => [b.key, b]));
  const out: Array<FormatSlot & { index: number }> = [];
  for (const slot of format.slots) {
    const chosen = byKey.get(slot.key);
    const times = chosen ? chosen.repeats : (slot.repeats ?? 1);
    const maxWords = chosen ? chosen.maxWords : slot.maxWords;
    for (let i = 0; i < times; i += 1) out.push({ ...slot, maxWords, index: i });
  }
  return out;
}
