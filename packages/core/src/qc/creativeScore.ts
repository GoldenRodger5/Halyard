/**
 * §269. The creative scorecard — spec §14.5.
 *
 * Halyard has a lot of gates and no way to read them as one verdict. The copy
 * gate knows about slop, the retention gate about openings, the audio gate about
 * pacing, the coherence gate about frames — and an operator looking at a queue
 * card gets a list of green ticks with no sense of whether the *piece* is any
 * good. The 2026-08-29 review found a video that passed every gate and opened on
 * a blank frame with raw JSON in its caption.
 *
 * The spec's rule, and the one thing this must not violate:
 *
 * > No single aggregate score may hide a hard failure.
 *
 * So this is a **scorecard, not a score**. Every dimension keeps its own verdict
 * and its own evidence, `passed` is a conjunction rather than a threshold, and
 * the headline number is explicitly not allowed to be the thing anyone decides
 * on — it exists to rank two pieces that both passed, never to let one through.
 *
 * ## Deterministic
 *
 * Nothing here calls a model. Every dimension is computed from findings other
 * gates already produced, which is the governing rule: agents perceive, code
 * decides. A model wrote the copy; it does not get to mark its own work.
 *
 * ## `unmeasured` is not `pass`
 *
 * Gotcha 6, again, one layer up. A dimension with no inputs reports
 * `unmeasured` and is named in `unmeasured[]`. It never contributes to the
 * score, and a caller that needs it can require it — because a scorecard whose
 * blanks read as passes is worse than no scorecard, being both wrong and
 * reassuring.
 */

/** The dimensions from spec §14.5, in the order an operator reads them. */
export const SCORE_DIMENSIONS = [
  'hook',
  'story',
  'visual_quality',
  'pacing',
  'clarity',
  'brand_fit',
  'platform_fit',
  'claim_accuracy',
  'cta',
  'novelty',
] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

export type DimensionStatus = 'pass' | 'warn' | 'fail' | 'unmeasured';

export interface DimensionResult {
  dimension: ScoreDimension;
  status: DimensionStatus;
  /** 0..1. Null when unmeasured — never 0, which would mean "measured, bad". */
  score: number | null;
  /** One line an operator can act on. */
  summary: string;
  /** The rules that drove this, so the verdict can be argued with. */
  evidence: string[];
}

export interface CreativeScorecard {
  /** True only when no dimension failed and every required one was measured. */
  passed: boolean;
  dimensions: DimensionResult[];
  /**
   * The mean of the measured dimensions, 0..1.
   *
   * For **ranking two passing pieces**, never for deciding whether one passes.
   * `passed` is a conjunction; this number cannot overrule it, and a caller
   * that thresholds on it has reintroduced the exact failure §14.5 forbids.
   */
  rankingScore: number | null;
  /** Dimensions with no inputs. Named, never silently treated as passes. */
  unmeasured: ScoreDimension[];
  /** Every failing dimension, most severe first. */
  failures: DimensionResult[];
  summary: string;
}

/** A finding from any existing gate, reduced to what scoring needs. */
export interface ScoredFinding {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
}

/**
 * Named `CreativeScoreInput` rather than `ScoreInput` because
 * `scoring/performance.ts` already exports that name, and the core barrel
 * re-exports both. A colliding name in a barrel is an error at build time and
 * a silently wrong import at every other time.
 */
export interface CreativeScoreInput {
  /** Findings from every gate that ran, in any order. */
  findings: ScoredFinding[];
  /** Rules that reported `unmeasured`, from any gate. */
  unmeasuredRules?: string[];
  /**
   * Whether the hook's promise was verified as delivered by the body.
   *
   * Null means nobody checked, which is different from "checked and it did
   * not" — the first is an unmeasured story dimension, the second is a hard
   * failure.
   */
  payoffDelivered?: boolean | null;
  /** Whether the piece carries a call to action at all. */
  hasCta?: boolean | null;
  /** How novel this piece is against the account's recent output, 0..1. */
  novelty?: number | null;
  /** Dimensions this format genuinely demands; unmeasured ones fail instead. */
  requires?: ScoreDimension[];
}

/**
 * Which gate rules speak to which dimension.
 *
 * A rule may appear once. Where a rule could plausibly sit in two dimensions it
 * goes to the one an operator would act on: `creative.no_payoff` is a story
 * problem, not a hook problem, because the fix is in the body.
 */
const RULE_DIMENSIONS: Array<{ prefix: string; dimension: ScoreDimension }> = [
  { prefix: 'hook.', dimension: 'hook' },
  { prefix: 'retention.no_content_in_opening', dimension: 'hook' },
  { prefix: 'retention.first_frame', dimension: 'hook' },
  { prefix: 'creative.no_payoff', dimension: 'story' },
  { prefix: 'creative.single_role', dimension: 'story' },
  { prefix: 'creative.no_beats', dimension: 'story' },
  { prefix: 'coherence.', dimension: 'story' },
  { prefix: 'creative.text_density', dimension: 'visual_quality' },
  { prefix: 'creative.no_motion', dimension: 'visual_quality' },
  { prefix: 'creative.constant_motion', dimension: 'visual_quality' },
  { prefix: 'creative.missing_alt_text', dimension: 'visual_quality' },
  { prefix: 'visual.', dimension: 'visual_quality' },
  { prefix: 'creative.pacing', dimension: 'pacing' },
  { prefix: 'retention.', dimension: 'pacing' },
  { prefix: 'audio.pacing', dimension: 'pacing' },
  { prefix: 'audio.', dimension: 'clarity' },
  { prefix: 'copy.', dimension: 'clarity' },
  { prefix: 'slop.', dimension: 'brand_fit' },
  /*
   * §275. The critic's craft findings. `reads_automated` and
   * `uniform_treatment` are brand-fit problems: the piece does not look like
   * the account made it. The rest are visual quality.
   */
  { prefix: 'critic.reads_automated', dimension: 'brand_fit' },
  { prefix: 'critic.uniform_treatment', dimension: 'brand_fit' },
  { prefix: 'critic.interchangeable_frames', dimension: 'novelty' },
  { prefix: 'critic.weak_opening', dimension: 'hook' },
  { prefix: 'critic.', dimension: 'visual_quality' },
  { prefix: 'creative.repeated_treatment', dimension: 'novelty' },
  { prefix: 'destination.', dimension: 'platform_fit' },
  { prefix: 'platform.', dimension: 'platform_fit' },
  { prefix: 'claims.', dimension: 'claim_accuracy' },
  { prefix: 'creative.fabricated_evidence', dimension: 'claim_accuracy' },
  { prefix: 'proof.', dimension: 'claim_accuracy' },
];

export function dimensionForRule(rule: string): ScoreDimension | null {
  /* Longest prefix wins, so `audio.pacing` beats the general `audio.`. */
  let best: { dimension: ScoreDimension; length: number } | null = null;
  for (const entry of RULE_DIMENSIONS) {
    if (rule.startsWith(entry.prefix) && (!best || entry.prefix.length > best.length)) {
      best = { dimension: entry.dimension, length: entry.prefix.length };
    }
  }
  return best?.dimension ?? null;
}

/** An error costs more than a warning, and the first of each costs most. */
function scoreFor(errors: number, warnings: number): number {
  if (errors > 0) return Math.max(0, 0.4 - (errors - 1) * 0.15);
  if (warnings > 0) return Math.max(0.5, 1 - warnings * 0.15);
  return 1;
}

export function scoreCreative(input: CreativeScoreInput): CreativeScorecard {
  const required = new Set(input.requires ?? []);
  const buckets = new Map<ScoreDimension, { errors: ScoredFinding[]; warnings: ScoredFinding[] }>();
  for (const dimension of SCORE_DIMENSIONS) {
    buckets.set(dimension, { errors: [], warnings: [] });
  }

  let anyRuleLanded = false;
  for (const finding of input.findings) {
    const dimension = dimensionForRule(finding.rule);
    if (!dimension) continue;
    anyRuleLanded = true;
    const bucket = buckets.get(dimension)!;
    if (finding.severity === 'error') bucket.errors.push(finding);
    else bucket.warnings.push(finding);
  }

  /* Dimensions a rule reported as unmeasured cannot be scored from findings. */
  const unmeasuredDims = new Set<ScoreDimension>();
  for (const rule of input.unmeasuredRules ?? []) {
    const dimension = dimensionForRule(rule);
    if (dimension) unmeasuredDims.add(dimension);
  }

  const results: DimensionResult[] = SCORE_DIMENSIONS.map((dimension) => {
    const bucket = buckets.get(dimension)!;
    const evidence = [...bucket.errors, ...bucket.warnings].map((f) => `${f.rule}: ${f.message}`);

    /* The three dimensions that come from an explicit input, not from rules. */
    if (dimension === 'story' && input.payoffDelivered === false) {
      return {
        dimension,
        status: 'fail',
        score: 0,
        summary: 'The hook promises something the body does not deliver.',
        evidence: ['payoff: not delivered', ...evidence],
      };
    }
    if (dimension === 'cta') {
      if (input.hasCta === null || input.hasCta === undefined) {
        return { dimension, status: 'unmeasured', score: null, summary: 'No call to action was looked for.', evidence };
      }
      return input.hasCta
        ? { dimension, status: 'pass', score: 1, summary: 'Carries a call to action.', evidence }
        : { dimension, status: 'warn', score: 0.5, summary: 'No call to action.', evidence };
    }
    if (dimension === 'novelty' && bucket.errors.length === 0 && bucket.warnings.length === 0) {
      if (input.novelty === null || input.novelty === undefined) {
        return { dimension, status: 'unmeasured', score: null, summary: 'Novelty was not measured.', evidence };
      }
      return {
        dimension,
        status: input.novelty < 0.3 ? 'warn' : 'pass',
        score: input.novelty,
        summary: `Novelty ${(input.novelty * 100).toFixed(0)}% against recent output.`,
        evidence,
      };
    }

    if (unmeasuredDims.has(dimension) && bucket.errors.length === 0 && bucket.warnings.length === 0) {
      return {
        dimension,
        status: 'unmeasured',
        score: null,
        summary: 'Every rule for this dimension reported unmeasured.',
        evidence,
      };
    }

    /*
     * No findings at all is only a pass if *something* ran. On an input where
     * no rule matched any dimension, a clean sheet means nothing was checked,
     * and reporting ten passes would be the reassuring-and-wrong case.
     */
    if (!anyRuleLanded) {
      return { dimension, status: 'unmeasured', score: null, summary: 'No gate reported on this.', evidence };
    }

    const errors = bucket.errors.length;
    const warnings = bucket.warnings.length;
    return {
      dimension,
      status: errors > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass',
      score: scoreFor(errors, warnings),
      summary:
        errors > 0
          ? `${errors} hard problem${errors === 1 ? '' : 's'}: ${bucket.errors[0]!.message}`
          : warnings > 0
            ? `${warnings} thing${warnings === 1 ? '' : 's'} to look at: ${bucket.warnings[0]!.message}`
            : 'Nothing found wrong.',
      evidence,
    };
  });

  const unmeasured = results.filter((r) => r.status === 'unmeasured').map((r) => r.dimension);

  /*
   * A required dimension that went unmeasured fails, rather than being skipped.
   * Gotcha 6: a caller declares what its format genuinely demands, and an unrun
   * check on one of those is a failure, not an absence.
   */
  const requiredButUnmeasured = unmeasured.filter((d) => required.has(d));
  for (const dimension of requiredButUnmeasured) {
    const result = results.find((r) => r.dimension === dimension)!;
    result.status = 'fail';
    result.score = 0;
    result.summary = `Required for this format and never measured. ${result.summary}`;
  }

  const failures = results.filter((r) => r.status === 'fail');
  const measured = results.filter((r) => r.score !== null);
  const rankingScore =
    measured.length === 0
      ? null
      : Number((measured.reduce((sum, r) => sum + (r.score ?? 0), 0) / measured.length).toFixed(3));

  return {
    passed: failures.length === 0,
    dimensions: results,
    rankingScore,
    unmeasured,
    failures,
    /*
     * The summary never reports a number beside a failure. An operator reading
     * "0.81" next to a broken claim gate is being told the wrong thing.
     */
    summary:
      failures.length > 0
        ? `${failures.length} dimension${failures.length === 1 ? '' : 's'} failed: ${failures.map((f) => f.dimension).join(', ')}.`
        : unmeasured.length > 0
          ? `Nothing failed; ${unmeasured.length} unmeasured (${unmeasured.join(', ')}).`
          : `All ${results.length} dimensions pass.`,
  };
}
