/**
 * Opening compositions. §229.
 *
 * ## The thing that survived every other variation
 *
 * §226 gave a piece six typography systems; §227 gave it thirteen visual
 * languages; §228 made the choice between them a decision rather than a
 * lookup. Rendered side by side, all six typography systems still opened the
 * same way: a small green uppercase eyebrow, then the headline, both flush
 * left, both anchored at the same height.
 *
 * That is the structure a viewer recognises. Type and motion vary *inside* a
 * layout; the layout itself is what makes an account look like one show, and
 * it was the one thing nothing chose.
 *
 * ## Why compositions and not "randomise the layout"
 *
 * An opening has a job — earn the next two seconds — and the layouts that do
 * it are a small known set. Each one here is a different *argument*: a
 * statement asserts, a question opens a loop, a number promises a payload, a
 * fragment withholds. Which argument fits is decided by what the piece has,
 * not by a die roll, so the same concept always opens the same way and two
 * consecutive posts do not.
 */

export const OPENING_COMPOSITIONS = [
  /**
   * The line, alone, large, with no label above it.
   *
   * The default and still the strongest when the line is good: nothing
   * competes with it. Distinct from the old opening precisely by the *absence*
   * of the eyebrow, which spent the top of the most valuable frame on a label
   * nobody scrolled for.
   */
  'statement',
  /**
   * A kicker above the line, the way a magazine sets a standfirst.
   *
   * The original. Kept, because it is right for editorial registers — but now
   * one of several rather than the only one.
   */
  'kicker_headline',
  /**
   * The line as a question, set large, with the answer withheld.
   *
   * Only when the hook is genuinely interrogative. Punctuating a statement
   * with a question mark is the cheapest trick in the format and reads as one.
   */
  'question',
  /**
   * A single number or short quantity, enormous, with the line beneath it.
   *
   * Needs a real figure from the artifact. Inventing one to unlock a layout
   * would be fabricating evidence, so this composition is unavailable without
   * one rather than falling back to a made-up figure.
   */
  'numeral',
  /**
   * Two or three words, held, then the rest of the line.
   *
   * A withheld opening. Works when the first words are a complete fragment
   * that means something on its own.
   */
  'fragment',
  /**
   * The line over full-bleed media, bottom-anchored with a scrim.
   *
   * Only with real imagery or footage. The picture is the hook and the words
   * label it.
   */
  'over_media',
  /**
   * The before state alone, stated flatly, so the change lands on the cut.
   *
   * For transformations. Opening on the problem rather than on a headline
   * about the problem is a different and usually better film.
   */
  'cold_open',
] as const;
export type OpeningComposition = (typeof OPENING_COMPOSITIONS)[number];

export interface OpeningInput {
  /** The hook line itself. */
  text: string;
  visualLanguage: string;
  /** True when the opening beat has real media behind it. */
  hasMedia: boolean;
  /** A real figure from the artifact, when one exists. Never invented. */
  numeral?: string | null;
  /** The 'before' side of a transformation, when the treatment has one. */
  beforeState?: string | null;
  /** Openings this account used recently, most recent first. */
  recent?: string[];
  pinned?: string | null;
}

export interface OpeningChoice {
  composition: OpeningComposition;
  /** How many leading words are held, for `fragment`. */
  holdWords?: number;
  reason: string;
  /** Why each unavailable one was unavailable. */
  unavailable: Array<{ composition: OpeningComposition; because: string }>;
}

const ALWAYS_AVAILABLE: OpeningComposition[] = ['statement', 'kicker_headline'];

/** Which openings suit which language. Loud languages do not do standfirsts. */
const LANGUAGE_OPENINGS: Record<string, OpeningComposition[]> = {
  editorial_cut: ['statement', 'question', 'numeral', 'kicker_headline'],
  documentary: ['kicker_headline', 'statement', 'cold_open', 'over_media'],
  kinetic: ['statement', 'fragment', 'numeral', 'question', 'cold_open'],
  product_led: ['over_media', 'cold_open', 'statement', 'numeral'],
  typographic: ['fragment', 'statement', 'question', 'numeral'],
  editorial_food: ['over_media', 'kicker_headline', 'statement', 'cold_open'],
  energetic_short: ['statement', 'fragment', 'question', 'numeral', 'cold_open'],
  cinematic: ['over_media', 'statement', 'cold_open', 'kicker_headline'],
  playful: ['question', 'fragment', 'numeral', 'statement'],
  clean_modern: ['statement', 'numeral', 'kicker_headline', 'over_media'],
  bold_social: ['statement', 'numeral', 'fragment', 'question'],
  premium_instructional: ['kicker_headline', 'numeral', 'statement', 'cold_open'],
  fast_cut_creator: ['fragment', 'question', 'statement', 'cold_open'],
};

/** Does this line actually ask something? */
export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (!t.endsWith('?')) return false;
  return /^(why|how|what|when|where|who|which|is|are|do|does|did|can|should|would|will|ever|has|have)\b/i.test(t);
}

/**
 * The leading fragment, if the line has one worth holding.
 *
 * A fragment has to mean something alone. Two or three words that end on a
 * preposition or an article are not a withheld opening, they are a line broken
 * in the wrong place, so those are refused.
 */
export function leadingFragment(text: string): number | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 5) return null;
  const weak = /^(a|an|the|of|to|in|on|for|and|or|but|with|at|by|from|is|are|was|were)$/i;
  for (const n of [3, 2, 4]) {
    const last = words[n - 1];
    if (last && !weak.test(last.replace(/[^\w]/g, ''))) return n;
  }
  return null;
}

export function chooseOpening(input: OpeningInput): OpeningChoice {
  const unavailable: Array<{ composition: OpeningComposition; because: string }> = [];
  const fragmentWords = leadingFragment(input.text);

  const availability: Record<OpeningComposition, string | null> = {
    statement: null,
    kicker_headline: null,
    question: isQuestion(input.text) ? null : 'The hook is not a question, and punctuating a statement with one reads as a trick.',
    numeral: input.numeral ? null : 'No real figure in the artifact, and inventing one would fabricate evidence.',
    fragment: fragmentWords ? null : 'No leading fragment that means anything on its own.',
    over_media: input.hasMedia ? null : 'No imagery or footage behind the opening beat.',
    cold_open: input.beforeState ? null : 'No before-state to open on.',
  };

  for (const [composition, reason] of Object.entries(availability)) {
    if (reason) unavailable.push({ composition: composition as OpeningComposition, because: reason });
  }

  if (input.pinned && OPENING_COMPOSITIONS.includes(input.pinned as OpeningComposition)) {
    const pinned = input.pinned as OpeningComposition;
    const blocked = availability[pinned];
    if (!blocked) {
      return {
        composition: pinned,
        ...(pinned === 'fragment' && fragmentWords ? { holdWords: fragmentWords } : {}),
        reason: 'Pinned by the operator.',
        unavailable,
      };
    }
    /* A pin cannot conjure a figure that does not exist. Refused with the
       reason rather than silently substituted. */
  }

  const preferred = LANGUAGE_OPENINGS[input.visualLanguage] ?? ALWAYS_AVAILABLE;
  const usable = preferred.filter((c) => !availability[c]);
  const pool = usable.length > 0 ? usable : ALWAYS_AVAILABLE;
  const recent = input.recent ?? [];

  /* Least recently used among what fits, which is the same rotation rule the
     typography and language choices use — one mechanism, three places. */
  const chosen =
    [...pool].sort((a, b) => {
      const ai = recent.indexOf(a);
      const bi = recent.indexOf(b);
      const as = ai === -1 ? recent.length + 1 : ai;
      const bs = bi === -1 ? recent.length + 1 : bi;
      return bs - as || pool.indexOf(a) - pool.indexOf(b);
    })[0] ?? 'statement';

  return {
    composition: chosen,
    ...(chosen === 'fragment' && fragmentWords ? { holdWords: fragmentWords } : {}),
    reason:
      usable.length === 0
        ? `Nothing this language prefers was available, so the opening is a plain ${chosen}.`
        : `${chosen} suits ${input.visualLanguage} and is the least recently used of ${usable.length} available.`,
    unavailable,
  };
}
