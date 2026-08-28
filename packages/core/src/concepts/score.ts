/**
 * Choosing between creative directions. §218.
 *
 * Halyard could generate a post. It could not generate *three materially
 * different ideas about the same subject and say which is strongest*, which is
 * the thing a creative team actually does before anyone opens an editor.
 *
 * ## Why scoring is deterministic and generation is not
 *
 * Writing a premise needs judgement — a model. Deciding which of five premises
 * to build needs a defensible comparison, and a model asked to rank its own
 * output grades its own work. So the concepts come from an agent and the
 * ranking is arithmetic over facts that already exist: what the account has
 * been publishing (§208), what performance established (§204), whether the
 * evidence a concept depends on is actually available.
 *
 * That split also makes the ranking arguable. An operator who disagrees can
 * point at a term rather than at a vibe, and `score_breakdown` keeps every term
 * so the argument is possible.
 *
 * ## Refusal
 *
 * A concept whose evidence requirements cannot be met is not a weak concept, it
 * is an unbuildable one — the same reasoning `planFeatureDemo` uses when it
 * refuses without footage. It scores zero and says why, rather than being
 * ranked low and quietly selected when nothing else is available.
 */
import { actionableInsights, type Insight } from '../learning/insights.js';
import { portfolioPreferences, type PortfolioReport } from '../social/portfolio.js';

export type ConceptObjective =
  | 'awareness'
  | 'engagement'
  | 'education'
  | 'traffic'
  | 'conversion'
  | 'retention'
  | 'follower_growth'
  | 'product_promotion';

/**
 * What a concept needs before it can be built.
 *
 * Checked against what the account actually has, not asserted. A requirement
 * nobody can satisfy is what turns a promising direction into a dead end three
 * stages later.
 */
export interface EvidenceRequirement {
  kind: 'product_capture' | 'verified_fact' | 'owned_image' | 'metric' | 'none';
  detail: string;
}

export interface Concept {
  id?: string;
  title: string;
  premise: string;
  hook?: string | null;
  audience?: string | null;
  objective: ConceptObjective;
  emotionalAngle?: string | null;
  /** The creative type this concept is told as. Matches `CreativeType`. */
  treatment: string;
  platformIntent: string[];
  differentiation?: string | null;
  evidenceRequirements: EvidenceRequirement[];
  retentionStrategy?: string | null;
}

/** What the account can actually supply right now. */
export interface ConceptCapabilities {
  /** A usable, recent product capture exists. */
  hasProductCapture: boolean;
  /** Verified product facts available to cite. */
  verifiedFactCount: number;
  /** Imagery the account owns or may use full-bleed. */
  hasOwnedImagery: boolean;
  /** Whether the account has measured performance at all. */
  hasMeasuredHistory: boolean;
}

export interface ConceptScoreInput {
  concepts: Concept[];
  capabilities: ConceptCapabilities;
  /** The objective the strategy layer chose, when it chose one. */
  objective?: ConceptObjective | null;
  portfolio?: PortfolioReport;
  insights?: Insight[];
  /** Treatments used recently on this account, most recent first. */
  recentTreatments?: string[];
  now?: Date;
}

export interface ScoredConcept {
  concept: Concept;
  score: number;
  /** Every term, so a ranking can be argued with rather than merely accepted. */
  breakdown: {
    objectiveFit: number;
    novelty: number;
    evidence: number;
    platformFit: number;
    learned: number;
    portfolio: number;
  };
  /** Requirements this account cannot currently satisfy. Empty means buildable. */
  unmetRequirements: string[];
  buildable: boolean;
  reason: string;
}

/** Can the account satisfy this requirement today? */
export function requirementMet(
  requirement: EvidenceRequirement,
  capabilities: ConceptCapabilities,
): boolean {
  switch (requirement.kind) {
    case 'product_capture':
      return capabilities.hasProductCapture;
    case 'verified_fact':
      return capabilities.verifiedFactCount > 0;
    case 'owned_image':
      return capabilities.hasOwnedImagery;
    case 'metric':
      return capabilities.hasMeasuredHistory;
    case 'none':
      return true;
  }
}

/**
 * Rank a batch of concepts against each other.
 *
 * Unbuildable concepts are returned rather than filtered, marked and scored
 * zero. An operator seeing "this one needs a product capture you do not have"
 * learns something; the same concept silently absent teaches nothing, and the
 * gap is often the most useful thing in the batch.
 */
export function scoreConcepts(input: ConceptScoreInput): ScoredConcept[] {
  const now = input.now ?? new Date();
  const recent = input.recentTreatments ?? [];

  const usable = actionableInsights(input.insights ?? [], now).filter(
    (i) => i.feature === 'creative_type',
  );
  const prefs = input.portfolio
    ? portfolioPreferences(input.portfolio, 'treatment')
    : { avoid: [], prefer: [] };

  const scored = input.concepts.map((concept): ScoredConcept => {
    const unmet = concept.evidenceRequirements
      .filter((r) => !requirementMet(r, input.capabilities))
      .map((r) => r.detail);

    /* Objective fit: does this concept serve the objective strategy chose? */
    const objectiveFit = !input.objective ? 0.5 : concept.objective === input.objective ? 1 : 0;

    /*
     * Novelty against what the account has actually been doing. Position 0 is
     * the last post, so a treatment used most recently costs the most.
     */
    const lastUsed = recent.indexOf(concept.treatment);
    const novelty = lastUsed === -1 ? 1 : Math.min(1, lastUsed / Math.max(1, recent.length));

    /* Evidence: fully met is 1, and each unmet requirement is a real hole. */
    const evidence =
      concept.evidenceRequirements.length === 0
        ? 1
        : (concept.evidenceRequirements.length - unmet.length) /
          concept.evidenceRequirements.length;

    /* Platform fit: a concept that names its platforms is more considered than
       one that claims all of them. */
    const platformFit =
      concept.platformIntent.length === 0
        ? 0.4
        : concept.platformIntent.length <= 3
          ? 1
          : 0.7;

    /* What performance established about this treatment, scaled by confidence. */
    const learned = usable
      .filter((i) => i.featureValue === concept.treatment)
      .reduce((sum, i) => sum + Math.max(-1, Math.min(1, i.lift * i.confidence * 3)), 0);

    /* And what the portfolio wants more or less of. */
    const portfolio =
      (prefs.avoid.includes(concept.treatment) ? -0.6 : 0) +
      (prefs.prefer.includes(concept.treatment) ? 0.3 : 0);

    const buildable = unmet.length === 0;

    /*
     * Weights chosen so evidence dominates: a beautiful concept nobody can
     * build is worth less than a solid one that ships. Novelty is second,
     * because an account that repeats itself is the failure mode this batch
     * exists to prevent.
     */
    const raw =
      evidence * 2.0 +
      novelty * 1.4 +
      objectiveFit * 1.0 +
      platformFit * 0.6 +
      learned +
      portfolio;

    const score = buildable ? Math.round(Math.max(0, raw) * 100) / 100 : 0;

    return {
      concept,
      score,
      breakdown: {
        objectiveFit: Math.round(objectiveFit * 100) / 100,
        novelty: Math.round(novelty * 100) / 100,
        evidence: Math.round(evidence * 100) / 100,
        platformFit: Math.round(platformFit * 100) / 100,
        learned: Math.round(learned * 100) / 100,
        portfolio: Math.round(portfolio * 100) / 100,
      },
      unmetRequirements: unmet,
      buildable,
      reason: buildable
        ? `${concept.treatment}, ${Math.round(novelty * 100)}% novel for this account` +
          (learned > 0 ? ', and performance favours it' : learned < 0 ? ', despite weak past results' : '')
        : `Cannot be built: ${unmet.join('; ')}`,
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Are these concepts actually different, or the same idea renamed?
 *
 * The failure this whole batch exists to prevent. A generator asked for five
 * concepts will happily return five phrasings of one, and a ranking cannot
 * detect that — every candidate scores plausibly and the operator picks between
 * synonyms.
 *
 * Difference is measured structurally: distinct treatments, distinct
 * objectives, and premises that do not simply share their vocabulary.
 */
export function conceptDiversity(concepts: Concept[]): {
  distinctTreatments: number;
  distinctObjectives: number;
  meanPremiseOverlap: number;
  diverse: boolean;
} {
  const treatments = new Set(concepts.map((c) => c.treatment));
  const objectives = new Set(concepts.map((c) => c.objective));

  const words = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );

  let pairs = 0;
  let overlapTotal = 0;
  for (let i = 0; i < concepts.length; i += 1) {
    for (let j = i + 1; j < concepts.length; j += 1) {
      const a = words(concepts[i]!.premise);
      const b = words(concepts[j]!.premise);
      const shared = [...a].filter((w) => b.has(w)).length;
      const union = new Set([...a, ...b]).size || 1;
      overlapTotal += shared / union;
      pairs += 1;
    }
  }

  const meanPremiseOverlap = pairs === 0 ? 0 : Math.round((overlapTotal / pairs) * 100) / 100;

  return {
    distinctTreatments: treatments.size,
    distinctObjectives: objectives.size,
    meanPremiseOverlap,
    /*
     * More than one treatment, and premises that are not mostly the same words.
     * 0.4 is permissive on purpose — concepts about one subject legitimately
     * share nouns, and the test is whether they share a *structure*.
     */
    diverse: treatments.size > 1 && meanPremiseOverlap < 0.4,
  };
}
