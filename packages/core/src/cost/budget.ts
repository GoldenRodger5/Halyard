/**
 * §494. A day has a budget, and paid work waits when it is spent.
 *
 * Twenty dollars went in twelve hours of testing with nothing to say so until
 * the operator read a billing page. The ledger (`agent_runs.cost_usd`, now
 * including images, vision, the critic and voice) makes the day measurable;
 * this is the decision that reads it.
 *
 * Paused, not failed: a job that waits for tomorrow is still the job, and the
 * queue resumes without anyone re-sending anything. Publishing is never
 * paused — a scheduled post is a promise already made, and it costs nothing
 * here (X's per-post billing is its own concern, gotcha 15).
 */
import type { JobKind } from '@halyard/db';

/** Job kinds that spend money on a provider before they finish. */
export const PAID_JOB_KINDS: readonly JobKind[] = [
  'generate',
  'generate_concepts',
  'correct_content',
  'review_media',
  'tts',
];

export interface BudgetDecision {
  proceed: boolean;
  /** Present when paused: what the operator reads in the log and the digest. */
  because?: string;
  spentUsd: number;
  budgetUsd: number;
}

export function budgetDecision(input: {
  kind: JobKind;
  spentTodayUsd: number;
  dailyBudgetUsd: number;
}): BudgetDecision {
  const spentUsd = Number(input.spentTodayUsd.toFixed(2));
  const budgetUsd = Number(input.dailyBudgetUsd.toFixed(2));
  if (!PAID_JOB_KINDS.includes(input.kind)) return { proceed: true, spentUsd, budgetUsd };
  /* A budget of zero means "no paid work today", which is a real setting. */
  if (spentUsd >= budgetUsd) {
    return {
      proceed: false,
      spentUsd,
      budgetUsd,
      because:
        `Today's paid calls total $${spentUsd.toFixed(2)} against a $${budgetUsd.toFixed(2)} daily budget, ` +
        `so ${input.kind} waits for tomorrow. Raise the budget on /master/system to continue today.`,
    };
  }
  return { proceed: true, spentUsd, budgetUsd };
}
