/**
 * §549. The same post, written twice.
 *
 * Two captions in the queue say one thing:
 *
 *     Dairy-free ziti browns fast: meltable mozzarella gives a gooey top.
 *       But check at 16 minutes because it can darken unevenly.
 *     Dairy-free ziti can brown fast. So check at 16 minutes: meltable
 *       cheeses keep the top gooey, but stretch is less elastic.
 *
 * Same subject, same fact, same instruction, same number. An account that
 * posts both looks like it has run out of things to say, which is worse than
 * posting neither.
 *
 * `alreadySaid` exists and is not this. It hands the writer the last sixty
 * days of *claims* and *opening lines* as a brief — a soft instruction to avoid
 * repeating itself, which the writer honoured by paraphrasing. "Dairy-free ziti
 * browns fast:" became "Dairy-free ziti can brown fast." and passed, because
 * nothing compared the finished bodies to each other.
 *
 * ## The threshold is measured, not chosen
 *
 * Across 1,770 pairs from 60 consecutive captions, the similarity distribution
 * has a hole in it:
 *
 *     the ziti pair            0.45
 *     next highest legitimate  0.26
 *     everything else          below that
 *
 * So 0.35 sits in empty space. It catches the one real duplicate in the corpus
 * and touches nothing that is merely on a related subject — which matters,
 * because two pieces about pastry *should* share words, and a threshold that
 * refused them would refuse the account's whole subject.
 *
 * Deliberately not an embedding. `ideaEngine` already scores *idea* novelty
 * with vectors and it did not catch this, because the ideas were genuinely
 * different and the writing converged anyway. This is a cheap, explainable
 * check on the artefact that actually ships, and an operator can be shown the
 * shared words and disagree.
 */

/**
 * Words too common to signal that two captions are the same post.
 *
 * The connectives from §544 are here too: two captions both leaning on "so"
 * are not thereby duplicates, and leaving them in inflates every score.
 */
const DUPLICATE_STOPWORDS = new Set(
  (
    'the and for with from that this what when how why your you their them they its are was ' +
    'were been being have has had will would could should about into over more most less than ' +
    'then some any all one two not but out off own get gets make makes use using like just also ' +
    'very much many good best a an is in on of to it as be so because which instead too'
  ).split(' '),
);

/** Content words, singularised crudely so "cheeses" and "cheese" agree. */
function contentWords(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [])
      .map((w) => w.replace(/'s$/, ''))
      .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
      .filter((w) => !DUPLICATE_STOPWORDS.has(w)),
  );
}

/**
 * §549. Measured against the corpus: the one real duplicate scores 0.45 and the
 * highest legitimate pair 0.26. Anything in between is empty space.
 */
export const DUPLICATE_FLOOR = 0.35;

/** How few content words a caption can have before the ratio stops meaning much. */
const MIN_WORDS = 4;

export function captionSimilarity(a: string, b: string): number {
  const wa = contentWords(a);
  const wb = contentWords(b);
  if (wa.size < MIN_WORDS || wb.size < MIN_WORDS) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared / (wa.size + wb.size - shared);
}

export interface DuplicateFinding {
  /** The caption this one repeats, or null when it repeats nothing. */
  match: string | null;
  score: number;
  /** The words both share, so an operator can argue with the arithmetic. */
  shared: string[];
  because: string;
}

/**
 * §549. Whether this body is a post the account has already made.
 *
 * `recent` is the account's recent bodies. Returns the *worst* match so the
 * writer is told about the closest thing it repeated rather than an arbitrary
 * one.
 */
export function findRepeatedPost(body: string, recent: readonly string[]): DuplicateFinding {
  let worst: DuplicateFinding = { match: null, score: 0, shared: [], because: '' };

  for (const previous of recent) {
    const score = captionSimilarity(body, previous);
    if (score > worst.score) {
      const wa = contentWords(body);
      const shared = [...contentWords(previous)].filter((w) => wa.has(w));
      worst = { match: previous, score, shared, because: '' };
    }
  }

  worst.because =
    worst.score >= DUPLICATE_FLOOR
      ? `This repeats a post already in the queue (${Math.round(worst.score * 100)}% of the ` +
        `content words: ${worst.shared.slice(0, 8).join(', ')}). Say something the account has not said.`
      : 'Nothing in the recent queue says this.';

  return worst;
}

/**
 * Whether the body is close enough to a previous one to be the same post.
 *
 * Named `repeatsAPost` rather than `isNearDuplicate` because `hooks.ts` already
 * exports that name for a different question — whether two *hooks* are the same
 * line. Two functions with one name in one barrel is how a caller ends up
 * asking the wrong question and getting a plausible answer.
 */
export function repeatsAPost(finding: DuplicateFinding): boolean {
  return finding.score >= DUPLICATE_FLOOR;
}
