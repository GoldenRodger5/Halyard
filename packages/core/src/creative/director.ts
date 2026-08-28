/**
 * The Creative Director. §228.
 *
 * ## What this is above
 *
 * `selectCreativePlan` (§203) chooses a *treatment* — what story shape the
 * artifact supports. `motionFor` (§220) decides how a beat moves.
 * `selectTypography` (§226) picks the type. Each was right on its own and
 * none of them chose the **look**: the language every other decision hangs
 * off. It was derived from the treatment by a seven-entry lookup, which meant
 * a before/after was always a documentary and eight of the thirteen languages
 * were reachable from nothing at all.
 *
 * This is the layer that makes that a decision.
 *
 * ## Why it is deterministic
 *
 * "Agents perceive, code decides." Choosing a visual language is not taste in
 * the sense that requires a model — it is a resolution of constraints that all
 * exist as data: what the concept is about, what the platform rewards, what
 * the account has just done, what performed, and what assets exist. A model
 * asked the same question would be less consistent and could not explain
 * itself against the alternatives.
 *
 * What a model *is* used for is upstream: writing the concept, whose emotional
 * angle and premise are inputs here.
 *
 * ## Cooperation, not independent generation
 *
 * The point of a director is that the downstream choices agree. The language
 * chosen here is what `selectTypography` filters on, what `motionForPlan`
 * moves to, and what `moodFor` scores a music bed against. One decision, read
 * by everything, rather than five modules each making their own guess from the
 * treatment.
 */
import type { Insight } from '../learning/insights.js';
import { VISUAL_LANGUAGES, type VisualLanguage } from './motion.js';

export interface DirectionInput {
  platform: string;
  /** The treatment the planner chose, as a starting position. */
  treatment: string;
  /** The concept's emotional angle, when one was stated. */
  emotionalAngle?: string | null;
  /** What the piece is for. */
  objective?: string | null;
  /** True when captured product footage will actually appear. */
  hasProductFootage?: boolean;
  /** True when real photography is available for full-bleed beats. */
  hasImagery?: boolean;
  /** Runtime in seconds. A 12-second piece cannot be cinematic. */
  targetSeconds: number;
  /** Languages this account used recently, most recent first. */
  recentLanguages?: string[];
  /** What measurement established, from §204. */
  insights?: Insight[];
  /** Set when the operator chose one in the Studio. Honoured absolutely. */
  pinned?: string | null;
}

export interface DirectionChoice {
  language: VisualLanguage;
  reason: string;
  /** Every candidate with its score, so the choice is answerable. */
  considered: Array<{ language: VisualLanguage; score: number; why: string[] }>;
}

/**
 * What each platform's feed actually rewards.
 *
 * Not preference — observed platform behaviour. TikTok and Reels punish a slow
 * open; Pinterest is a still surface where motion barely matters and legibility
 * does; YouTube long-form is the only place a considered pace is an asset
 * rather than a cost.
 */
const PLATFORM_AFFINITY: Record<string, Partial<Record<VisualLanguage, number>>> = {
  tiktok: { energetic_short: 3, fast_cut_creator: 3, kinetic: 2, bold_social: 2, playful: 1 },
  instagram: { editorial_food: 3, kinetic: 2, playful: 2, energetic_short: 2, clean_modern: 1 },
  youtube: { premium_instructional: 3, documentary: 2, product_led: 2, clean_modern: 1 },
  pinterest: { editorial_food: 3, clean_modern: 2, editorial_cut: 2, cinematic: 1 },
  threads: { editorial_cut: 2, bold_social: 2, clean_modern: 1 },
  x: { editorial_cut: 3, bold_social: 2, clean_modern: 1 },
  linkedin: { premium_instructional: 3, clean_modern: 2, documentary: 1 },
};

/** The language a treatment defaults to when nothing else argues. */
const TREATMENT_AFFINITY: Record<string, Partial<Record<VisualLanguage, number>>> = {
  before_after: { documentary: 2, editorial_food: 2, clean_modern: 1 },
  myth_fact: { editorial_cut: 3, bold_social: 2 },
  process_montage: { kinetic: 3, fast_cut_creator: 2, editorial_food: 1 },
  listicle: { kinetic: 2, bold_social: 2, energetic_short: 2 },
  how_to: { premium_instructional: 3, documentary: 2, clean_modern: 1 },
  comparison: { editorial_cut: 2, clean_modern: 2, premium_instructional: 1 },
  feature_demo: { product_led: 3, clean_modern: 2, premium_instructional: 1 },
};

/** Which languages an emotional angle is at home in. */
const ANGLE_AFFINITY: Array<{ match: RegExp; languages: Partial<Record<VisualLanguage, number>> }> = [
  { match: /surprise|delight|fun|whims/i, languages: { playful: 3, fast_cut_creator: 2 } },
  { match: /relief|calm|reassur/i, languages: { editorial_food: 2, documentary: 2, cinematic: 1 } },
  { match: /urgen|tens|frustrat/i, languages: { energetic_short: 3, bold_social: 2 } },
  { match: /curio|intrigue/i, languages: { editorial_cut: 2, cinematic: 2, typographic: 1 } },
  { match: /recognition|relatab/i, languages: { fast_cut_creator: 2, documentary: 2 } },
  { match: /crav|appetit|delicious/i, languages: { editorial_food: 3, cinematic: 2 } },
];

/**
 * Languages a piece cannot coherently be, given what it actually has.
 *
 * Refusals rather than penalties, because these are not preferences. A
 * cinematic pull needs something to pull away from; running one over a text
 * card is a slow zoom on nothing. `product_led` means footage leads, so
 * without footage there is nothing leading.
 */
function incoherent(input: DirectionInput): Map<VisualLanguage, string> {
  const out = new Map<VisualLanguage, string>();
  if (!input.hasProductFootage) {
    out.set('product_led', 'No captured product footage, and this language exists to frame it.');
  }
  if (!input.hasImagery && !input.hasProductFootage) {
    out.set('cinematic', 'Nothing to hold a wide pull on; over a text card it is a zoom on nothing.');
    out.set('editorial_food', 'No photography, and food that is only described is not food-forward.');
  }
  if (input.targetSeconds < 15) {
    out.set('cinematic', 'Under 15s there is no room for a considered pace.');
    out.set('premium_instructional', 'Too short to teach a sequence.');
  }
  if (input.targetSeconds > 90) {
    out.set('energetic_short', 'Over 90s this becomes exhausting rather than energetic.');
    out.set('fast_cut_creator', 'Over 90s the unevenness reads as sloppiness.');
  }
  return out;
}

/**
 * Choose the visual language.
 *
 * Additive scoring over four axes, minus a recency penalty. Additive rather
 * than a priority list because a piece is genuinely several things at once —
 * a TikTok feature demo is both product-led and feed-native, and a list that
 * checked platform first would never notice the second.
 */
export function directCreative(input: DirectionInput): DirectionChoice {
  const refusals = incoherent(input);

  if (input.pinned && VISUAL_LANGUAGES.includes(input.pinned as VisualLanguage)) {
    const pinned = input.pinned as VisualLanguage;
    const refusal = refusals.get(pinned);
    return {
      language: pinned,
      reason: refusal
        ? `Pinned by the operator, over an objection: ${refusal}`
        : 'Pinned by the operator.',
      considered: [],
    };
  }

  const recent = input.recentLanguages ?? [];
  const platform = PLATFORM_AFFINITY[input.platform] ?? {};
  const treatment = TREATMENT_AFFINITY[input.treatment] ?? {};
  const angle =
    ANGLE_AFFINITY.find((a) => a.match.test(input.emotionalAngle ?? ''))?.languages ?? {};

  const considered = VISUAL_LANGUAGES.filter((l) => !refusals.has(l)).map((language) => {
    const why: string[] = [];
    let score = 0;

    const p = platform[language] ?? 0;
    if (p > 0) { score += p; why.push(`${input.platform} rewards it (+${p})`); }

    const t = treatment[language] ?? 0;
    if (t > 0) { score += t; why.push(`fits a ${input.treatment} (+${t})`); }

    const a = angle[language] ?? 0;
    if (a > 0) { score += a; why.push(`matches the emotional angle (+${a})`); }

    /*
     * What measurement established. Deliberately weighted below platform and
     * treatment: an insight is a belief with a confidence, not a fact, and one
     * strong past result should tilt a decision rather than make it.
     */
    for (const insight of input.insights ?? []) {
      if (insight.feature === 'visual_language' && insight.featureValue === language) {
        const w = Number((insight.lift * insight.confidence * 2).toFixed(2));
        score += w;
        why.push(`measured to ${w >= 0 ? 'perform' : 'underperform'} (${w >= 0 ? '+' : ''}${w})`);
      }
    }

    /*
     * Recency. The largest single term, because repetition is the specific
     * failure this director exists to prevent: an account that always looks
     * the same is the complaint, and a scoring system that lets a strong
     * default win forever reproduces it exactly.
     */
    const index = recent.indexOf(language);
    if (index !== -1) {
      const penalty = 3 - index * 0.5;
      if (penalty > 0) { score -= penalty; why.push(`used ${index + 1} pieces ago (-${penalty})`); }
    }

    return { language, score: Number(score.toFixed(2)), why };
  });

  considered.sort((a, b) => b.score - a.score || a.language.localeCompare(b.language));
  const winner = considered[0];

  /*
   * Everything refused is a real state, not an error: a 10-second text-only
   * piece with no footage genuinely cannot be most of these. Falling back to
   * `editorial_cut` is honest — it needs nothing but words.
   */
  if (!winner) {
    return {
      language: 'editorial_cut',
      reason: `Every language was refused (${[...refusals.values()].join(' ')}). Editorial cut needs nothing but words.`,
      considered: [],
    };
  }

  return {
    language: winner.language,
    reason:
      winner.why.length > 0
        ? `${winner.language}: ${winner.why.join(', ')}.`
        : `${winner.language}: nothing argued for or against it, and it is the least recently used.`,
    considered,
  };
}
