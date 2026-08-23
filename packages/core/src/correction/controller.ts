/**
 * The self-correction controller — the decision half.
 *
 * §165. Given what the gates found, what has already been tried, and what is
 * left of the budget, this returns exactly one decision. It performs no I/O,
 * calls no model, and touches no artifact, so every rule it enforces is
 * testable without a database, a provider or a render.
 *
 * The shape of the loop it drives:
 *
 *   GENERATE → INSPECT → IDENTIFY THE ACTUAL PROBLEM → SMALLEST CORRECTION
 *           → REBUILD ONLY WHAT IS INVALIDATED → INSPECT AGAIN
 *           → PROTECT WHAT WAS FIXED → STOP WHEN GOOD, ELSE ESCALATE
 *
 * What it deliberately is not: a loop that regenerates until a model says the
 * result is good. The stopping condition is the deterministic gates, the
 * correction is chosen from a table, and the budget is finite in both
 * iterations and money.
 */
import type { GateName, GateResult } from '../qc/index.js';
import type { Component, CorrectionAction, Defect } from './defects.js';
import { defectsFrom } from './defects.js';
import { policyFor } from './policy.js';
import { gatesInvalidatedBy, rebuildFrom, type RebuildStage } from './invalidation.js';
import { acceptable, regressionsBetween, type IterationSnapshot, type Regression } from './regression.js';

/**
 * The default correction budget.
 *
 * Three is not arbitrary. Each iteration is one full rebuild of whatever the
 * correction invalidated — for a video that is a synthesis, a render and a
 * vision review — so the cost is real, and the returns fall off fast: a defect
 * that survives three targeted corrections is usually not the kind of defect
 * generation can fix, which is what the escalation path is for.
 */
export const MAX_CORRECTIONS = 3;

/**
 * The default spend ceiling for one item's whole correction run.
 *
 * Bounded in money as well as in count because the two are not the same limit:
 * three corrections of a text post is pennies, three of a captured video with a
 * re-synthesis each time is not. Whichever binds first stops the loop.
 */
export const MAX_CORRECTION_SPEND_USD = 2.0;

export interface IterationRecord {
  iteration: number;
  gates: GateResult[];
  /** Defects the controller acted on, kept so later iterations can see them. */
  defects: Defect[];
  /** What was actually changed. Empty for iteration 0. */
  changed: Component[];
  action: CorrectionAction | null;
  costUsd: number;
  snapshot: IterationSnapshot;
}

export interface ControllerState {
  /** Oldest first. Index 0 is the original generation. */
  history: IterationRecord[];
  maxCorrections?: number;
  maxSpendUsd?: number;
  /** Gates this item's format genuinely requires, from `runAllGates`. */
  requires: GateName[];
}

export type Decision =
  | {
      kind: 'accept';
      iteration: number;
      reason: string;
    }
  | {
      kind: 'correct';
      action: CorrectionAction;
      /** Every defect this action addresses, so the corrector has full context. */
      defects: Defect[];
      /** Findings from earlier iterations that must not be reintroduced. */
      doNotRegress: Defect[];
      /** Gates that will need re-establishing once the correction lands. */
      invalidates: GateName[];
      rebuild: RebuildStage;
      reason: string;
    }
  | {
      kind: 'escalate';
      /** The iteration an operator should look at. */
      iteration: number;
      defects: Defect[];
      reason: string;
      /** Why generation cannot fix this, in a sentence for the operator. */
      unresolved: string[];
    }
  | {
      kind: 'exhausted';
      iteration: number;
      defects: Defect[];
      reason: string;
      attempted: Array<{ iteration: number; action: CorrectionAction; outcome: string }>;
    };

/** Failing gates the item actually requires. Warnings never block. */
function blocking(gates: GateResult[], requires: GateName[]): GateResult[] {
  const required = new Set(requires);
  return gates.filter(
    (g) => g.status === 'failed' || (g.status === 'skipped' && required.has(g.gate)),
  );
}

/**
 * The best iteration to keep.
 *
 * §9. A later iteration is not assumed to be better — that assumption is what
 * turns a correction loop into a random walk that keeps the last roll. The
 * ordering is: an iteration with no blocking gates beats one with any; among
 * equals, fewer warnings wins; among those, **the earliest wins**.
 *
 * Preferring the earliest is the anti-churn rule. Two passing iterations are
 * both publishable, and the later one cost more to produce, so there has to be
 * a measurable reason to prefer it. "The model liked it more" is not one.
 */
export function bestIteration(
  history: IterationRecord[],
  requires: GateName[],
): IterationRecord | null {
  if (history.length === 0) return null;

  const scored = history.map((record) => ({
    record,
    blocking: blocking(record.gates, requires).length,
    warnings: record.gates.filter((g) => g.status === 'warning').length,
  }));

  scored.sort(
    (a, b) =>
      a.blocking - b.blocking ||
      a.warnings - b.warnings ||
      a.record.iteration - b.record.iteration,
  );

  return scored[0]!.record;
}

/**
 * Which single action to take next.
 *
 * One action per iteration, not all of them. Correcting several things at once
 * makes the next verdict uninterpretable — if two changes land together and the
 * result is worse, nothing says which one did it, and the history stops being
 * the explanation it exists to be.
 *
 * The order is by cost of being wrong, cheapest first: a copy revision risks
 * little and is quick to check; a re-synthesis costs a provider call; anything
 * touching the creative plan rebuilds the video.
 */
const ACTION_ORDER: CorrectionAction[] = [
  'remeasure',
  'fix_destination',
  'revise_copy',
  'reground_claims',
  'rewrite_vo_script',
  'resynthesise_voiceover',
  'adjust_caption_treatment',
  'adjust_scene_timing',
  'resequence_scenes',
  'escalate',
];

function nextAction(defects: Defect[]): CorrectionAction | null {
  const present = new Set(defects.filter((d) => d.correctable).map((d) => d.action));
  for (const action of ACTION_ORDER) {
    if (action !== 'escalate' && present.has(action)) return action;
  }
  return null;
}

/**
 * Has this action already been tried and failed to clear its defects?
 *
 * Without this the loop repeats the same correction until the budget runs out —
 * the exact "roll the dice again" behaviour the design exists to prevent. An
 * action that has been applied twice without clearing the rule it targeted is
 * treated as ineffective, and the controller moves on or escalates.
 */
function ineffective(history: IterationRecord[], action: CorrectionAction, rule: string): boolean {
  const attempts = history.filter(
    (record) => record.action === action && record.defects.some((d) => d.rule === rule),
  );
  return attempts.length >= 2;
}

export function decide(state: ControllerState): Decision {
  const maxCorrections = state.maxCorrections ?? MAX_CORRECTIONS;
  const maxSpend = state.maxSpendUsd ?? MAX_CORRECTION_SPEND_USD;
  const latest = state.history[state.history.length - 1];

  if (!latest) {
    return {
      kind: 'escalate',
      iteration: 0,
      defects: [],
      reason: 'There is no iteration to judge.',
      unresolved: ['No generation has been recorded for this item.'],
    };
  }

  const defects = defectsFrom(latest.gates, policyFor, state.requires);
  const stillBlocking = blocking(latest.gates, state.requires);

  // ── A. Everything required passes ────────────────────────────────────────
  if (stillBlocking.length === 0) {
    const best = bestIteration(state.history, state.requires)!;
    return {
      kind: 'accept',
      iteration: best.iteration,
      reason:
        best.iteration === latest.iteration
          ? `All required gates pass at iteration ${latest.iteration}.`
          : `Iteration ${best.iteration} is the best valid result; iteration ${latest.iteration} also passes but was not an improvement.`,
    };
  }

  const blockingDefects = defects.filter((d) =>
    stillBlocking.some((g) => g.gate === d.gate),
  );

  // ── C. Something here cannot be fixed by generating differently ──────────
  const uncorrectable = blockingDefects.filter((d) => !d.correctable);
  if (uncorrectable.length > 0) {
    return {
      kind: 'escalate',
      iteration: bestIteration(state.history, state.requires)!.iteration,
      defects: blockingDefects,
      reason: 'A blocking defect cannot be corrected by generation.',
      unresolved: uncorrectable.map((d) => `${d.rule}: ${d.rootCause}`),
    };
  }

  // ── B. Budget ────────────────────────────────────────────────────────────
  const corrections = state.history.length - 1;
  const spent = state.history.reduce((total, record) => total + record.costUsd, 0);

  if (corrections >= maxCorrections || spent >= maxSpend) {
    const best = bestIteration(state.history, state.requires)!;
    return {
      kind: 'exhausted',
      iteration: best.iteration,
      defects: blockingDefects,
      reason:
        corrections >= maxCorrections
          ? `Stopped after ${corrections} correction${corrections === 1 ? '' : 's'}, the maximum.`
          : `Stopped at $${spent.toFixed(4)} of a $${maxSpend.toFixed(2)} budget.`,
      attempted: state.history
        .filter((r): r is IterationRecord & { action: CorrectionAction } => r.action !== null)
        .map((r) => ({
          iteration: r.iteration,
          action: r.action,
          outcome:
            blocking(r.gates, state.requires).length === 0
              ? 'cleared every required gate'
              : `left ${blocking(r.gates, state.requires).map((g) => g.gate).join(', ')} failing`,
        })),
    };
  }

  // ── The correction itself ────────────────────────────────────────────────
  const action = nextAction(blockingDefects);
  if (!action) {
    return {
      kind: 'escalate',
      iteration: bestIteration(state.history, state.requires)!.iteration,
      defects: blockingDefects,
      reason: 'No correction action applies to the blocking defects.',
      unresolved: blockingDefects.map((d) => `${d.rule}: ${d.rootCause}`),
    };
  }

  const targeted = blockingDefects.filter((d) => d.action === action);

  if (targeted.every((d) => ineffective(state.history, action, d.rule))) {
    return {
      kind: 'escalate',
      iteration: bestIteration(state.history, state.requires)!.iteration,
      defects: blockingDefects,
      reason: `${action} has already been tried twice without clearing these defects.`,
      unresolved: targeted.map(
        (d) => `${d.rule} survived repeated correction: ${d.observation}`,
      ),
    };
  }

  /*
   * §6. Everything an earlier iteration fixed, carried forward.
   *
   * The corrector is told not to reintroduce these. Without it the loop is a
   * set of independent attempts rather than a constrained optimisation, and
   * iteration 2 is free to recreate the caption overlap iteration 1 fixed.
   */
  const currentRules = new Set(defects.map((d) => d.rule));
  const doNotRegress = state.history
    .flatMap((record) => record.defects)
    .filter((d) => !currentRules.has(d.rule))
    .filter(
      (d, index, all) => all.findIndex((other) => other.rule === d.rule) === index,
    );

  const components = [...new Set(targeted.map((d) => d.component))];

  return {
    kind: 'correct',
    action,
    defects: targeted,
    doNotRegress,
    invalidates: gatesInvalidatedBy(components),
    rebuild: rebuildFrom(components),
    reason: `${stillBlocking.map((g) => g.gate).join(', ')} failing; ${action} is the smallest action that addresses ${targeted.map((d) => d.rule).join(', ')}.`,
  };
}

/**
 * Whether a corrected iteration may be kept.
 *
 * §7. Separate from `decide` because it answers a different question: `decide`
 * chooses what to do next, this judges what just happened. A correction that
 * cleared its target but broke something else is rejected here, and the
 * controller falls back to the previous iteration rather than building on it.
 */
export function acceptCorrection(
  previous: IterationRecord,
  next: IterationRecord,
  pendingGates: GateName[],
): { ok: true } | { ok: false; regressions: Regression[] } {
  const regressions = regressionsBetween(previous.snapshot, next.snapshot).filter(
    (r) => !acceptable(r, pendingGates),
  );
  return regressions.length === 0 ? { ok: true } : { ok: false, regressions };
}
