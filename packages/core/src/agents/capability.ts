/**
 * Deriving a capability state from evidence.
 *
 * ## The rule this file exists to enforce
 *
 * > Do not allow documentation alone to produce a green state.
 *
 * `deriveState` takes only *evidence* — does the implementation exist, does a
 * caller exist in the call graph, is the output consumed, do tests cover it,
 * has it ever actually run. It cannot see the contract's own `declaredStatus`,
 * because a function that could see it might be tempted to trust it.
 *
 * That is not a stylistic choice. Every phantom capability found in this
 * repository was a thing that *said* it worked. A state function that reads a
 * self-declaration reproduces the bug it exists to catch.
 */
import type { CapabilityAuditState } from './contract.js';

export interface CapabilityEvidence {
  /** The symbol the contract points at was found in the source. */
  implementationFound: boolean;
  /** At least one non-test call site reaches it. */
  callerFound: boolean;
  /** Something reads what it produces — a table, a column, a module. */
  outputConsumed: boolean;
  /** At least one acceptance test file exists and references it. */
  testsFound: boolean;
  /** It has actually run: an execution record exists. */
  everInvoked: boolean;
  /**
   * The most recent runs failed.
   *
   * Only meaningful alongside `everInvoked` — something that never ran cannot
   * have regressed, it was simply never exercised.
   */
  recentlyFailing: boolean;
  /**
   * An external precondition is absent — a credential, a licence, an input that
   * does not exist yet. Supplied by the contract's author, not inferred.
   */
  blockedReason: string | null;
}

/**
 * The state the evidence supports.
 *
 * Order matters. `blocked` is checked before `no_caller` because "nothing calls
 * it because there is nothing for it to do yet" is a different and less
 * alarming fact than "nothing calls it and nobody noticed".
 */
export function deriveState(evidence: CapabilityEvidence): CapabilityAuditState {
  if (!evidence.implementationFound) {
    // Declared and absent. `planned` is the honest word for it, whatever the
    // contract believes about itself.
    return 'planned';
  }

  /**
   * Regression outranks everything below it.
   *
   * Something that ran and now fails is worse than something that never ran,
   * because a caller and a consumer are both depending on it right now.
   */
  if (evidence.everInvoked && evidence.recentlyFailing) return 'regression';

  if (evidence.blockedReason) return 'blocked';

  if (!evidence.callerFound) return 'implemented_no_caller';

  /**
   * A caller is not proof of execution.
   *
   * This is the distinction the whole audit rests on: code that *can* run and
   * code that *has* run are different claims. Green requires the second.
   */
  if (!evidence.everInvoked) return 'implemented_partial';

  // Invoked, but something in the chain is unproven.
  if (!evidence.outputConsumed || !evidence.testsFound) return 'implemented_partial';

  return 'implemented_exercised';
}

/**
 * Why the state is what it is, in one sentence an operator can act on.
 *
 * Returned alongside the state everywhere, because a colour with no reason is
 * the same failure as a gate with no measurement — it looks like information.
 */
export function explainState(evidence: CapabilityEvidence): string {
  if (!evidence.implementationFound) {
    return 'The implementation named in the contract was not found in the source.';
  }
  if (evidence.everInvoked && evidence.recentlyFailing) {
    return 'It has run before and its recent runs are failing.';
  }
  if (evidence.blockedReason) return evidence.blockedReason;
  if (!evidence.callerFound) {
    return 'The code exists and nothing in the call graph reaches it.';
  }
  if (!evidence.everInvoked) {
    return 'A caller exists but there is no record of it ever having run.';
  }

  const missing: string[] = [];
  if (!evidence.outputConsumed) missing.push('nothing is known to consume its output');
  if (!evidence.testsFound) missing.push('no acceptance test covers the path');
  if (missing.length > 0) return `It runs, but ${missing.join(' and ')}.`;

  return 'Implementation, caller, consumer, tests and a real execution are all present.';
}

/**
 * Whether a state change is worth telling somebody about.
 *
 * Green → orange is an alert. Blue → green is progress. Orange → orange is
 * noise, and a system that reports noise gets ignored, which is how a real
 * regression goes unread.
 */
export function isNotableTransition(from: CapabilityAuditState | null, to: CapabilityAuditState): boolean {
  if (from === null) return to === 'regression';
  if (from === to) return false;

  const wasWorking = from === 'implemented_exercised' || from === 'implemented_partial';
  const nowBroken = to === 'regression' || to === 'implemented_no_caller' || to === 'blocked';
  if (wasWorking && nowBroken) return true;

  // Reaching green from anything else is worth surfacing.
  return to === 'implemented_exercised';
}

/**
 * Roll a set of states up to one headline.
 *
 * The worst state wins rather than the average. A dashboard that shows "mostly
 * green" while one agent is in regression has hidden the only fact on the page
 * that needed acting on.
 */
export function rollUp(states: CapabilityAuditState[]): CapabilityAuditState {
  if (states.length === 0) return 'planned';
  const order: CapabilityAuditState[] = [
    'regression',
    'implemented_no_caller',
    'blocked',
    'implemented_partial',
    'planned',
    'implemented_exercised',
  ];
  for (const candidate of order) {
    if (states.includes(candidate)) return candidate;
  }
  return 'planned';
}
