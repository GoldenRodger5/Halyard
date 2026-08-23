/**
 * Turning a failed gate into something a controller can act on.
 *
 * §165. The gates already say what went wrong, and they say it in a shape five
 * of them share: `{ rule, severity, message }`. That `rule` string is the whole
 * basis of this module — it is a stable identifier chosen by the person who
 * wrote the check, not prose a model has to interpret, so the mapping from
 * "what failed" to "what to change" can be a table rather than a judgement.
 *
 * This matters more than it looks. The obvious design is to hand a failing
 * artifact to a model and ask what to do about it. That produces a plausible
 * answer every time, including for defects that cannot be corrected by
 * generation at all — missing evidence, absent consent, a measurement that
 * never ran. A table cannot be talked into any of those.
 *
 * So: **the gates perceive, this decides.** No model is consulted anywhere in
 * this file. The one place perception is genuinely needed — looking at rendered
 * frames — already happened, in `review_media`, through an independent vision
 * reviewer on a different provider from the one that wrote the content.
 */
import type { GateName, GateResult } from '../qc/index.js';

/**
 * What a correction is allowed to touch.
 *
 * Deliberately the *seams the pipeline already has*, not a new decomposition:
 * each one corresponds to a stage that can be re-run on its own.
 */
export type Component =
  | 'copy'
  | 'claims'
  | 'link'
  | 'vo_script'
  | 'voiceover'
  | 'creative_plan'
  | 'caption_style'
  | 'composition'
  /** Not a component of the artifact — a statement that the artifact is not the problem. */
  | 'evidence'
  | 'measurement';

/**
 * The smallest action that could fix a defect.
 *
 * "Regenerate everything" is deliberately absent. It is the action a system
 * reaches for when it has not understood the failure, it costs a full
 * generation every time, and it silently discards work that was already
 * correct — which is how a fix for a caption defect ends up rewriting a
 * verified claim.
 */
export type CorrectionAction =
  | 'revise_copy'
  | 'reground_claims'
  | 'fix_destination'
  | 'rewrite_vo_script'
  | 'resynthesise_voiceover'
  | 'adjust_caption_treatment'
  | 'adjust_scene_timing'
  | 'resequence_scenes'
  | 'remeasure'
  | 'escalate';

export interface Defect {
  gate: GateName;
  /** The gate's own rule identifier. The join key for the whole policy. */
  rule: string;
  severity: 'error' | 'warning';
  /** What the gate observed, in its own words. Never rewritten here. */
  observation: string;
  /** Where the defect comes from, in one line an operator can read. */
  rootCause: string;
  /** What would have to change for this to be fixed. */
  component: Component;
  action: CorrectionAction;
  /**
   * Whether generation can fix this at all.
   *
   * `false` is a first-class outcome, not a failure of this module. Missing
   * evidence, absent testimonial consent and an unrun measurement are all real
   * and none is correctable by writing different words.
   */
  correctable: boolean;
  /** The gate's own detail, carried through untouched for the operator. */
  evidence?: unknown;
}

/** A gate finding, in the shape five gates already emit. */
interface RawFinding {
  rule?: unknown;
  severity?: unknown;
  message?: unknown;
}

function findingsOf(detail: unknown): RawFinding[] {
  if (!detail || typeof detail !== 'object') return [];
  const d = detail as Record<string, unknown>;

  // `findings` is the shared shape. `errors`/`violations` is the slop filter's,
  // which predates it; both are read rather than one being normalised away,
  // because renaming a field in a gate to suit this module would be the tail
  // wagging the dog.
  for (const key of ['findings', 'errors', 'violations']) {
    const value = d[key];
    if (Array.isArray(value) && value.length > 0) return value as RawFinding[];
  }
  return [];
}

/**
 * Every defect in a gate verdict, as structured records.
 *
 * Warnings are included. The controller decides what to act on — a warning is
 * evidence about the artifact whether or not it blocks, and §7's regression
 * check needs to see a warning appear that was not there before.
 */
export function defectsFrom(
  gates: GateResult[],
  policy: DefectPolicy,
  /**
   * Gates this item's format genuinely demands.
   *
   * Needed because `skipped` means two different things. A *required* gate that
   * did not run is a real problem — the "never verified is not passed" rule this
   * codebase is built on. An *unrequired* one is simply a check with nothing to
   * examine: a destination gate on a post with no link, a proof gate on a post
   * quoting nobody. Those are not defects and must not be recorded as such.
   *
   * Found by looking at the rendered operator view rather than the database:
   * every version of a real item listed `destination.unspecified — no link` and
   * `proof.unspecified — no quoted testimonial` as defects it had failed on.
   * Harmless to the decision — `blocking()` already ignores unrequired gates —
   * and pure noise in the one screen that exists to explain what went wrong.
   *
   * Omitted means "treat no skipped gate as a defect", which is the safe
   * default for callers that only want to read what actually broke.
   */
  requires: GateName[] = [],
): Defect[] {
  const defects: Defect[] = [];
  const required = new Set(requires);

  for (const gate of gates) {
    if (gate.status === 'passed') continue;

    /*
     * A gate that failed without naming a rule still has to produce a defect.
     * Otherwise the controller sees `passed: false` with nothing to correct and
     * stalls — which is worse than escalating, because it looks like progress.
     */
    const findings = findingsOf(gate.detail);
    if (findings.length === 0) {
      if (gate.status === 'failed' || (gate.status === 'skipped' && required.has(gate.gate))) {
        defects.push({
          gate: gate.gate,
          rule: `${gate.gate}.unspecified`,
          severity: 'error',
          observation: gate.summary,
          ...policy(`${gate.gate}.unspecified`, gate.gate),
          evidence: gate.detail,
        });
      }
      continue;
    }

    for (const finding of findings) {
      const rule = typeof finding.rule === 'string' ? finding.rule : `${gate.gate}.unspecified`;
      const severity = finding.severity === 'warning' ? 'warning' : 'error';
      defects.push({
        gate: gate.gate,
        rule,
        severity,
        observation: typeof finding.message === 'string' ? finding.message : gate.summary,
        ...policy(rule, gate.gate),
        evidence: finding,
      });
    }
  }

  return defects;
}

/** Supplied by `policy.ts`. Kept as a parameter so this file stays a normaliser. */
export type DefectPolicy = (
  rule: string,
  gate: GateName,
) => Pick<Defect, 'rootCause' | 'component' | 'action' | 'correctable'>;
