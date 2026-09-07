/**
 * §546. What the product is *for*, checked before something is written about it.
 *
 * The Product Brain verifies `content_pillars` — for Kinolog, "choosing what to
 * watch: tonight's constraints, watchlists, couples and movie-night
 * stalemates", "how AI recommendations work and when to distrust them", "movie
 * diary habits". Three pillars, verified against evidence, stored, categorised.
 * And read by nothing: `content_pillars` appears in `brain/model.ts` and
 * `brain/agents.ts`, which *build* it, and nowhere in the generate handler.
 *
 * So Halyard wrote Kinolog a piece of screenwriting advice — *"Your third act
 * loses viewers. Cut every scene that only explains the plan. Make the villain
 * force a choice, not a fight."* It is good advice. It is aimed at people
 * making films, and Kinolog is for people choosing one to watch tonight; its
 * named competitors are Letterboxd, Trakt and SIMKL, all film *logs*. Nothing
 * in the piece was false and nothing in the pipeline objected, because nothing
 * had ever been asked whether the subject was one this product talks about.
 *
 * The fifth instance of the same shape — §478's footage ground, §499's
 * registration guidance, §508's carousel branch, §516's `search_recipes` — and
 * the most expensive, because the others produced a worse post and this one
 * produces a post for somebody else's audience.
 *
 * ## Why a score and not a judgement
 *
 * §515 established the pattern for exactly this on RecipeFix's catalogue: score
 * the subject against what exists, and when nothing scores, *say so* rather
 * than proceeding quietly or inventing a match. The same arithmetic works here
 * because a pillar is a sentence describing a territory, and a subject that
 * shares no content word with any of them is not in any of them.
 *
 * Deliberately not a model call. Whether a subject is on-pillar is a question
 * the Brain has already answered by writing the pillars down; asking a model to
 * re-judge it would put a perception step where a lookup belongs, which is the
 * rule this codebase runs on.
 */

/** Words too common to carry a subject. Mirrors §514's list, one domain along. */
const PILLAR_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'how', 'why',
  'your', 'you', 'their', 'them', 'they', 'its', 'are', 'was', 'were', 'been', 'being',
  'have', 'has', 'had', 'will', 'would', 'could', 'should', 'about', 'into', 'over',
  'more', 'most', 'less', 'than', 'then', 'some', 'any', 'all', 'one', 'two', 'not',
  'but', 'out', 'off', 'own', 'get', 'gets', 'got', 'make', 'makes', 'made', 'use',
  'using', 'used', 'like', 'just', 'also', 'very', 'much', 'many', 'good', 'best',
]);

function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [])
    .map((w) => w.replace(/'s$/, ''))
    /* Crude singularisation: "watchlists" and "watchlist" are the same territory. */
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .filter((w) => !PILLAR_STOPWORDS.has(w));
}

export interface ContentPillar {
  key: string;
  value: string;
}

export interface PillarFit {
  /** The best-matching pillar, or null when nothing matched at all. */
  pillar: ContentPillar | null;
  /** Shared content words with that pillar. Zero means off-pillar. */
  score: number;
  /** The words that matched, so an operator can disagree with the arithmetic. */
  shared: string[];
  /** Operator-facing, and written to be read on a phone. */
  because: string;
}

/**
 * §546. How well a subject sits inside what this product talks about.
 *
 * `pillars` are the product's verified `content_pillars` facts. An empty list
 * returns a fit with a null pillar and score zero **and a `because` that says
 * the product has no pillars** — which is a different fact from "off-pillar"
 * and must not be reported as one: a product whose Brain has not run yet has
 * not disagreed with anything.
 */
export function pillarFit(subject: string, pillars: readonly ContentPillar[]): PillarFit {
  if (pillars.length === 0) {
    return {
      pillar: null,
      score: 0,
      shared: [],
      because: 'This product has no verified content pillars yet, so nothing can say whether the subject fits.',
    };
  }

  const wanted = new Set(contentWords(subject));
  let best: PillarFit = {
    pillar: null,
    score: 0,
    shared: [],
    because: '',
  };

  for (const pillar of pillars) {
    const shared = [...new Set(contentWords(pillar.value).filter((w) => wanted.has(w)))];
    if (shared.length > best.score) {
      best = { pillar, score: shared.length, shared, because: '' };
    }
  }

  best.because =
    best.score > 0
      ? `Shares ${best.shared.join(', ')} with the "${best.pillar!.key}" pillar.`
      : `No content word in this subject appears in any of the ${pillars.length} pillars this product ` +
        'talks about. Writing it would be writing for somebody else\'s audience.';

  return best;
}

/** Whether the subject is inside the product's territory at all. */
export function isOnPillar(fit: PillarFit): boolean {
  return fit.score > 0;
}
