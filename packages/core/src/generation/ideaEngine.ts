/**
 * The decision engine. v2 Part G.
 *
 * v1 described this loosely; this is the full mechanism. Content-mix debt is the
 * primary driver, because the most common failure of automated content is
 * drifting into whatever is easiest to generate — usually product promotion.
 */

/**
 * The five content pillars, as a value rather than only a type.
 *
 * The type existed alone, so anything needing to *check* a category at runtime
 * had to write the list again — and this list already exists twice more, as
 * `CONTENT_CATEGORIES` in `@halyard/db` and as the `ideas_category_check`
 * constraint. `packages/core` cannot import from `@halyard/db` without breaking
 * `packages/audit`, which typechecks these files without that path mapping, so
 * the agreement is pinned by a test instead of by an import — the same answer
 * §82 reached for the platform list.
 */
export const IDEA_CATEGORIES = [
  'transformation',
  'education',
  'community',
  'product',
  'founder_insight',
] as const;

export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];

export interface ScoringWeights {
  mixDebt: number;
  novelty: number;
  seasonal: number;
  productSignal: number;
  formatAvailability: number;
  historical: number;
}

/**
 * v2 G.1 cold-start weights. These are hand-set, and the UI says so rather than
 * dressing a guess as learning (v1 §4.2). `historical` rises to 0.40 once there
 * is data.
 */
export const COLD_START_WEIGHTS: ScoringWeights = {
  mixDebt: 0.25,
  novelty: 0.2,
  seasonal: 0.15,
  productSignal: 0.15,
  formatAvailability: 0.15,
  historical: 0.1,
};

export const WARM_WEIGHTS: ScoringWeights = {
  mixDebt: 0.2,
  novelty: 0.15,
  seasonal: 0.1,
  productSignal: 0.1,
  formatAvailability: 0.05,
  historical: 0.4,
};

/**
 * v2 G.4 — the learning loop activates at roughly 20 posts per category. Below
 * that, differences are noise and the UI should say so.
 */
export const LEARNING_MIN_POSTS_PER_CATEGORY = 20;

/**
 * v2 G.2 — never more than 15% product content in any trailing 14-day window.
 *
 * This is the *base* ceiling. Milestone 44 lifts it for the duration of a
 * campaign window and lets it revert on its own; pass `productCeiling` to
 * `selectIdeas` to apply the override. Nothing mutates this constant, so the
 * normal number is always recoverable.
 */
export const PRODUCT_CONTENT_CEILING = 0.15;

export interface IdeaCandidate {
  id: string;
  title: string;
  angle: string;
  category: IdeaCategory;
  rationale?: string;
  /** Days until the seasonal moment this idea targets. Undefined = not seasonal. */
  daysUntilSeasonalPeak?: number;
  /** Age in hours of the product signal behind it. Undefined = no signal. */
  productSignalAgeHours?: number;
  /** Templates that could render this. Empty means we cannot make it well. */
  availableTemplates: string[];
  /** Embedding for the novelty check. */
  embedding?: number[];
  /** Mean conversion of similar past content, 0..1. */
  historicalConversion?: number;
}

export interface MixState {
  /** Target share per category, from brand_voices.mix_targets. */
  targets: Partial<Record<IdeaCategory, number>>;
  /** Actual share over the trailing 21 days, from content_mix_actual(). */
  actual: Partial<Record<IdeaCategory, number>>;
  /** Product-content share over the trailing 14 days, from product_content_share(). */
  productShare14d: number;
  /** Published count per category, used to decide whether learning is live. */
  postsPerCategory: Partial<Record<IdeaCategory, number>>;
}

export interface ScoredIdea extends IdeaCandidate {
  score: number;
  breakdown: Record<keyof ScoringWeights, number>;
  /** Human-readable, shown as the score-breakdown bar chart on /ideas. */
  explanation: string;
  /** Set when a hard cap or cooldown removed the idea from selection. */
  blockedReason?: string;
}

export function cosineDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! ** 2;
    normB += b[i]! ** 2;
  }
  if (normA === 0 || normB === 0) return 1;
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * The honest answer when novelty cannot be measured at all.
 *
 * The same neutral `historicalConversion` uses, and for the same reason: an
 * unmeasured factor must not read as a measured maximum. See §140.
 */
export const NOVELTY_UNMEASURED = 0.5;

/**
 * Distance from the nearest of the last 60 days of ideas. 1 = wholly novel.
 *
 * Two situations used to share one answer, and only one of them deserved it:
 *
 *  · `recent.length === 0` — nothing to be similar *to*. Genuinely novel, 1.
 *  · `!candidate` — this idea has no embedding, so novelty was **not
 *    measured**. Returning 1 claimed maximum novelty for something nobody
 *    looked at.
 *
 * Nothing writes `ideas.embedding` today, so every idea takes the second branch
 * and the old constant 1 was harmless to ranking. It stops being harmless the
 * moment one idea has an embedding: an unmeasured idea would score a perfect 1
 * and outrank a measured one that scored 0.7. Unmeasured beating measured is
 * the failure this codebase is built around, and `historicalConversion` three
 * lines below already states the rule — `?? 0.5`, "the honest neutral".
 */
export function noveltyScore(candidate: number[] | undefined, recent: number[][]): number {
  // Nothing to compare against is a real measurement with a real answer.
  if (recent.length === 0) return 1;
  // No embedding is not a measurement at all.
  if (!candidate) return NOVELTY_UNMEASURED;
  let nearest = 1;
  for (const other of recent) {
    nearest = Math.min(nearest, cosineDistance(candidate, other));
  }
  return Math.max(0, Math.min(1, nearest));
}

/**
 * v2 G.2 — mix debt. Positive when a pillar is under-served against its target.
 * Normalised to 0..1 so it composes with the other factors.
 */
export function mixDebtScore(category: IdeaCategory, mix: MixState): number {
  const target = mix.targets[category];
  if (target === undefined) return 0.3; // no target set: neutral, not zero
  const actual = mix.actual[category] ?? 0;
  const debt = target - actual;
  // A pillar at zero against a 0.40 target scores 1; a pillar at or above target
  // scores 0. Clamped so an over-served pillar cannot go negative and drag the
  // total below what a no-target category gets.
  return Math.max(0, Math.min(1, debt / Math.max(target, 0.05)));
}

function seasonalScore(daysUntilPeak: number | undefined): number {
  if (daysUntilPeak === undefined) return 0.2;
  if (daysUntilPeak < 0) return 0; // already passed
  if (daysUntilPeak <= 7) return 1;
  if (daysUntilPeak <= 21) return 0.7;
  if (daysUntilPeak <= 42) return 0.4;
  return 0.15;
}

function productSignalScore(ageHours: number | undefined): number {
  if (ageHours === undefined) return 0.2;
  if (ageHours <= 24) return 1;
  if (ageHours <= 72) return 0.75;
  if (ageHours <= 168) return 0.45;
  return 0.2;
}

function formatAvailabilityScore(templates: string[]): number {
  // "Can we actually render this well?" No template means no, whatever the idea.
  if (templates.length === 0) return 0;
  if (templates.length === 1) return 0.6;
  return 1;
}

export interface SelectionOptions {
  weights?: ScoringWeights;
  /** Embeddings of ideas and posts from the last 60 days. */
  recentEmbeddings?: number[][];
  /** Categories under cooldown, e.g. used in the last 24 hours. */
  cooldownCategories?: IdeaCategory[];
  /** How many to select. */
  limit?: number;
  /**
   * The product-content ceiling in force right now. Milestone 44 raises this
   * for the duration of a campaign window; omit it for the normal 15%.
   */
  productCeiling?: number;
  /**
   * §260. This selection is a calibration batch, so the mix ceiling does not
   * apply to it.
   *
   * The ceiling governs what an account *publishes* over fourteen days.
   * A calibration batch is not published: it exists so an operator can rate a
   * spread of drafts before anything goes out, and the ratings are what make
   * the mix meaningful in the first place.
   *
   * Without this the guard is unsatisfiable at cold start. `projectedTotal` is
   * floored at 1, so the first product idea projects to `1/2` — 50%, over the
   * 15% cap — and product content stays unreachable until roughly six
   * non-product posts exist in the window. Pre-launch there are no published
   * posts at all, so that condition can never arrive.
   *
   * This is the same deadlock Milestone 51 fixed one guard earlier: a
   * calibration batch refused by a check that calibration is what satisfies.
   */
  calibration?: boolean;
}

export function scoreIdeas(
  candidates: IdeaCandidate[],
  mix: MixState,
  options: SelectionOptions = {},
): ScoredIdea[] {
  const weights = options.weights ?? pickWeights(mix);
  const recent = options.recentEmbeddings ?? [];

  return candidates.map((candidate) => {
    const breakdown: Record<keyof ScoringWeights, number> = {
      mixDebt: mixDebtScore(candidate.category, mix),
      novelty: noveltyScore(candidate.embedding, recent),
      seasonal: seasonalScore(candidate.daysUntilSeasonalPeak),
      productSignal: productSignalScore(candidate.productSignalAgeHours),
      formatAvailability: formatAvailabilityScore(candidate.availableTemplates),
      // At cold start there is no learning; 0.5 is the honest neutral.
      historical: candidate.historicalConversion ?? 0.5,
    };

    const score = (Object.keys(weights) as Array<keyof ScoringWeights>).reduce(
      (total, key) => total + weights[key] * breakdown[key],
      0,
    );

    /*
     * Factors that were never measured are excluded from the explanation.
     *
     * `explanation` is rendered on /ideas as the reason an idea was chosen. At
     * cold start novelty contributed a flat 0.20 — frequently the single
     * largest term — so the screen told the operator "novelty 20%" about an
     * idea whose novelty nothing had looked at. A neutral is an honest number
     * to score with and a dishonest one to cite as a reason.
     *
     * Only novelty can be unmeasured this way: every other factor is computed
     * from data that always exists, and `historical` states its own neutral.
     */
    const noveltyMeasured = Boolean(candidate.embedding) && recent.length > 0;

    const top = (Object.entries(breakdown) as Array<[keyof ScoringWeights, number]>)
      .filter(([key]) => key !== 'novelty' || noveltyMeasured)
      .map(([key, value]) => ({ key, contribution: value * weights[key] }))
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 2);

    return {
      ...candidate,
      score: Number(score.toFixed(4)),
      breakdown,
      explanation: top.map((t) => `${humanise(t.key)} ${(t.contribution * 100).toFixed(0)}%`).join(', '),
    };
  });
}

function pickWeights(mix: MixState): ScoringWeights {
  const enoughData = Object.values(mix.postsPerCategory).some(
    (count) => (count ?? 0) >= LEARNING_MIN_POSTS_PER_CATEGORY,
  );
  return enoughData ? WARM_WEIGHTS : COLD_START_WEIGHTS;
}

function humanise(key: keyof ScoringWeights): string {
  return (
    {
      mixDebt: 'mix debt',
      novelty: 'novelty',
      seasonal: 'seasonal',
      productSignal: 'fresh product signal',
      formatAvailability: 'renderable',
      historical: 'past performance',
    } as const
  )[key];
}

/**
 * v2 G.3 selection:
 *   1. score  2. mix-debt boost  3. hard caps  4. top N  5. category diversity
 *   6. novelty check  7. generate
 *
 * Steps 3 and 5 are the ones that stop the system quietly turning into an ad
 * channel, so they are applied after scoring rather than folded into it — a
 * blocked idea keeps its score and shows why it was blocked.
 */
export function selectIdeas(
  candidates: IdeaCandidate[],
  mix: MixState,
  options: SelectionOptions = {},
): { selected: ScoredIdea[]; rejected: ScoredIdea[] } {
  const limit = options.limit ?? 4;
  const cooldown = new Set(options.cooldownCategories ?? []);
  const scored = scoreIdeas(candidates, mix, options).sort((a, b) => b.score - a.score);

  const selected: ScoredIdea[] = [];
  const rejected: ScoredIdea[] = [];
  const usedCategories = new Set<IdeaCategory>();

  // The product ceiling counts what is already scheduled, not just what is
  // published, so a day of queued product posts cannot sneak past it.
  const projectedTotal = Math.max(1, Object.values(mix.postsPerCategory).reduce((a, b) => a + (b ?? 0), 0));

  for (const idea of scored) {
    if (selected.length >= limit) {
      rejected.push({ ...idea, blockedReason: 'Below the daily selection limit.' });
      continue;
    }

    if (idea.availableTemplates.length === 0) {
      rejected.push({ ...idea, blockedReason: 'No enabled template can render this.' });
      continue;
    }

    if (cooldown.has(idea.category)) {
      rejected.push({ ...idea, blockedReason: `${idea.category} is on cooldown.` });
      continue;
    }

    // v2 G.3 step 5: no two items in the same category on the same day.
    if (usedCategories.has(idea.category)) {
      rejected.push({
        ...idea,
        blockedReason: `Another ${idea.category} idea is already selected today.`,
      });
      continue;
    }

    if (idea.category === 'product' && !options.calibration) {
      const ceiling = options.productCeiling ?? PRODUCT_CONTENT_CEILING;
      const wouldBeShare =
        (mix.productShare14d * projectedTotal + 1) / (projectedTotal + 1);
      if (wouldBeShare > ceiling) {
        rejected.push({
          ...idea,
          blockedReason:
            ceiling === PRODUCT_CONTENT_CEILING
              ? `Product content is at ${(mix.productShare14d * 100).toFixed(0)}% over 14 days; the hard cap is ${PRODUCT_CONTENT_CEILING * 100}%.`
              : `Product content is at ${(mix.productShare14d * 100).toFixed(0)}% over 14 days; even the raised campaign cap is ${Math.round(ceiling * 100)}%.`,
        });
        continue;
      }
    }

    // v2 G.3 step 6: novelty against the last 60 days.
    if (idea.breakdown.novelty < 0.15) {
      rejected.push({
        ...idea,
        blockedReason: 'Too close to something posted in the last 60 days.',
      });
      continue;
    }

    selected.push(idea);
    usedCategories.add(idea.category);
  }

  return { selected, rejected };
}

/**
 * v2 G.4 — what the analytics page is allowed to claim. The UI renders this
 * sentence rather than a confident chart over n=3.
 */
export function learningStatus(mix: MixState): {
  active: boolean;
  message: string;
  categoriesReady: IdeaCategory[];
} {
  const ready = (Object.entries(mix.postsPerCategory) as Array<[IdeaCategory, number]>)
    .filter(([, count]) => count >= LEARNING_MIN_POSTS_PER_CATEGORY)
    .map(([category]) => category);

  if (ready.length === 0) {
    const best = Math.max(0, ...Object.values(mix.postsPerCategory).map((v) => v ?? 0));
    return {
      active: false,
      message: `Weights are hand-set. Meaningful comparison needs about ${LEARNING_MIN_POSTS_PER_CATEGORY} posts per category; the busiest category has ${best}.`,
      categoriesReady: [],
    };
  }
  return {
    active: true,
    message: `Learning is live for ${ready.join(', ')}. Other categories still use hand-set weights.`,
    categoriesReady: ready,
  };
}
