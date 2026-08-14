/**
 * Whether a feature claim survived being replayed.
 *
 * ## Why verification is built before the crawler
 *
 * `AGENTIC_PLAN.md` Phase 3 says it plainly and it is worth restating: an
 * inventory nobody can check is worse than no inventory, because it reads as
 * knowledge. A list of forty features a model believed it saw would immediately
 * become the ground truth every prompt draws on, and nothing downstream would
 * ever question it.
 *
 * So the unit of discovery is not "a feature". It is **a claim plus a way to
 * re-perform it**. A claim that cannot be replayed is not knowledge, and the
 * honest status for it is `unverifiable` rather than a quiet demotion to prose
 * in a brief.
 *
 * ## What counts as verification
 *
 * The flow ran, and the thing it said would be observable *was* observable.
 * Nothing weaker. In particular:
 *
 * - A flow that completed without error but asserted nothing is `unverifiable`,
 *   not `verified`. This is the single most likely way for this system to start
 *   lying: every step succeeded, no expectation existed, and "no failures"
 *   reads exactly like "confirmed".
 * - A flow whose expectations were all `optional` is the same thing wearing a
 *   hat.
 * - A refuted claim is a *result*, not an error. Features get removed, and
 *   noticing that is the point.
 */

export type ClaimStatus = 'unverified' | 'verified' | 'refuted' | 'unverifiable';

/** What the replay was told to look for, and what it saw. */
export interface Expectation {
  /** The step that carried it, for a failure that reads as a sentence. */
  stepName: string;
  kind: 'expectText' | 'expectVisible' | 'expectUrl';
  /** What it was looking for. */
  wanted: string;
  /** Whether it was found. `null` means the step never ran. */
  observed: boolean | null;
  optional?: boolean;
}

export interface ReplayOutcome {
  /** Every step ran without throwing. */
  completed: boolean;
  /** Why it stopped, when it did not complete. */
  error?: string | null;
  expectations: Expectation[];
  /** Wall clock, kept because a feature that got 10× slower is a finding. */
  elapsedMs?: number;
}

export interface Verdict {
  status: ClaimStatus;
  /** One sentence, written to be read in a UI without further explanation. */
  summary: string;
  /** The expectations that decided it. */
  failed: Expectation[];
}

/**
 * Decide a claim's status from what the replay actually observed.
 *
 * Deterministic and total: every combination of inputs maps to exactly one
 * status, and no path returns `verified` without a satisfied expectation.
 */
export function verdictFor(outcome: ReplayOutcome): Verdict {
  const required = outcome.expectations.filter((e) => !e.optional);

  /**
   * Nothing asserted is not confirmation.
   *
   * A flow of nine navigation steps and no expectation will complete cleanly
   * every time, including on a page that has lost the feature entirely.
   */
  if (required.length === 0) {
    return {
      status: 'unverifiable',
      summary: outcome.completed
        ? 'The flow ran but checked nothing, so it confirms nothing. A claim needs at least one thing that must be observable.'
        : 'The flow neither completed nor checked anything.',
      failed: [],
    };
  }

  if (!outcome.completed) {
    /**
     * A flow that broke part-way is ambiguous on purpose.
     *
     * It may mean the feature is gone. It may equally mean a selector moved, or
     * the network hiccuped. Calling that `refuted` would delete real features
     * from the inventory on a flaky run, so it stays `unverified` and gets
     * attempted again.
     */
    return {
      status: 'unverified',
      summary: `The flow did not finish (${outcome.error ?? 'no reason recorded'}), so nothing was decided. It will be tried again.`,
      failed: required.filter((e) => e.observed !== true),
    };
  }

  const unmet = required.filter((e) => e.observed !== true);
  if (unmet.length === 0) {
    return {
      status: 'verified',
      summary: `Replayed successfully; ${required.length} check${required.length === 1 ? '' : 's'} held.`,
      failed: [],
    };
  }

  /**
   * The flow completed and something it promised was not there.
   *
   * That is a real answer, and the useful one: features get removed, renamed
   * and quietly broken, and an inventory that cannot notice is a stale brief
   * with extra steps.
   */
  return {
    status: 'refuted',
    summary: `The flow ran to the end, but ${unmet.length} of ${required.length} checks failed — first: ${unmet[0]!.stepName} expected "${unmet[0]!.wanted}".`,
    failed: unmet,
  };
}

/**
 * How long a verified claim stays believable.
 *
 * A product that ships through Lovable with no release notes changes without
 * announcing it. Two weeks is short enough that the inventory tracks a moving
 * product, and long enough that re-verification is not a background job
 * hammering someone's live app.
 */
export const VERIFICATION_TTL_DAYS = 14;

export function isStale(verifiedAt: Date | null, now: Date = new Date()): boolean {
  if (!verifiedAt) return true;
  const days = (now.getTime() - verifiedAt.getTime()) / 86_400_000;
  return days >= VERIFICATION_TTL_DAYS;
}

/**
 * What may be said publicly about a feature.
 *
 * The reason this whole module exists. A verified claim can be marketed; an
 * unverified one is a note to a human. The standing rule against fabricating
 * anything applies with more force here than anywhere else in the system,
 * because a feature inventory is *believed by construction* — everything
 * downstream treats it as fact.
 */
export function canMarket(status: ClaimStatus, verifiedAt: Date | null): boolean {
  return status === 'verified' && !isStale(verifiedAt);
}
