/**
 * §329. What went wrong, and what to try instead.
 *
 * Tonight's capture failures were diagnosed by a person reading step timings in
 * a database and calling the product's API by hand. That worked because someone
 * was watching. The operator's point is that nobody will be: *"if the RecipeFix
 * failure ran for real automation, we could've been blind to why."*
 *
 * Three failures, three completely different causes, and every one of them
 * surfaced identically — `"wait for the adaptation" failed. Selector
 * button:has-text("SWAPPED") did not resolve.`
 *
 *   1. `fillSecret` had no implementation, so the form was submitted empty.
 *   2. The chosen recipe took longer than the 90-second budget.
 *   3. A High-Protein constraint made the product return a correct refusal,
 *      and the flow waited for a success state that was never coming.
 *
 * The message named the *symptom* every time. A system that only reports
 * symptoms teaches an operator nothing and cannot retry intelligently.
 *
 * ## What generalises
 *
 * Nothing here knows what a recipe is. The signals are structural and hold for
 * any product: did earlier steps run at all, did the ones that ran take a
 * plausible amount of time, did the failure happen while *waiting* or while
 * *acting*, and did the page render anything at the point it gave up. Those
 * four answers separate "the UI moved" from "the request was refused" from "we
 * never actually typed anything", and each implies a different next move.
 */

export interface DiagnosedStep {
  step: string;
  action?: string;
  ok: boolean;
  ms: number;
  optional?: boolean;
  error?: string;
  /** Whether a screenshot of the failure exists. */
  failureScreenshot?: string;
}

export const FAILURE_KINDS = [
  'input_never_entered',
  'awaited_state_never_came',
  'element_missing',
  'navigation_failed',
  'auth_failed',
  'nothing_recorded',
  'unknown',
] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

export const RECOVERIES = [
  'retry_with_different_input',
  'retry_without_optional_steps',
  'rediscover_selectors',
  'fix_code',
  'escalate',
] as const;
export type Recovery = (typeof RECOVERIES)[number];

export interface Diagnosis {
  kind: FailureKind;
  recovery: Recovery;
  /** What an operator should read, in one sentence, naming the evidence. */
  finding: string;
  /** Whether the worker may act on `recovery` without asking. */
  automatic: boolean;
}

/**
 * A fill or type step that reported no elapsed time did nothing.
 *
 * Playwright's `fill` takes single-digit milliseconds on a real field and
 * exactly zero when the switch statement had no case for the action — which is
 * how `fillSecret` submitted an empty login form for a week. Zero is not fast;
 * zero is a step that never ran.
 */
const INSTANT_MS = 1;

export function diagnoseCapture(input: {
  steps: DiagnosedStep[];
  /** Seconds the whole run took, so a fast total means it never really started. */
  totalSeconds: number;
}): Diagnosis | null {
  const failed = input.steps.find((s) => !s.ok && !s.optional);
  if (!failed) return null;

  const before = input.steps.slice(0, input.steps.indexOf(failed));

  /* ── Nothing ran ──────────────────────────────────────────────────────── */
  if (before.length === 0 || input.totalSeconds < 2) {
    return {
      kind: 'nothing_recorded',
      recovery: 'escalate',
      finding: `The run failed at its first step (${failed.step}), so nothing was recorded.`,
      automatic: false,
    };
  }

  /* ── An input step that took no time at all ───────────────────────────── */
  const emptyInput = before.find(
    (s) => (s.action === 'fill' || s.action === 'fillSecret') && s.ok && s.ms <= INSTANT_MS,
  );
  if (emptyInput) {
    return {
      kind: 'input_never_entered',
      recovery: 'fix_code',
      finding:
        `"${emptyInput.step}" reported ${emptyInput.ms}ms, which is not fast — it is a step ` +
        `that did nothing. The form reached "${failed.step}" empty, so the failure there is a ` +
        'symptom rather than the cause.',
      automatic: false,
    };
  }

  const isWait = failed.action === 'waitFor' || failed.action === 'waitForHidden';

  /* ── Waited a long time for something that never appeared ─────────────── */
  if (isWait && failed.ms > 20_000) {
    return {
      kind: 'awaited_state_never_came',
      /*
       * The distinction that took a person three attempts to find: everything
       * *before* the wait worked, so the interface is intact and the inputs
       * were accepted. What did not arrive is the *result*, and the most
       * common reason a product does not produce the expected result is that
       * it was asked for something it could not do. Different input first;
       * a selector hunt only if that also fails.
       */
      recovery: 'retry_with_different_input',
      finding:
        `Every step before "${failed.step}" succeeded, so the interface responded and the ` +
        `inputs were accepted. It then waited ${(failed.ms / 1000).toFixed(0)}s for a result ` +
        'that never came, which usually means the product was asked for something it could ' +
        'not produce rather than that the page changed.',
      automatic: true,
    };
  }

  /* ── An element that is simply not there ──────────────────────────────── */
  /*
   * The phrasings the runner actually emits, not the ones it seems like it
   * would. `runFlow` writes "none of N selector(s) resolved" for an exhausted
   * fallback chain and Playwright writes "did not resolve" for a single
   * locator — matching only the second read the commonest case as `unknown`.
   */
  if (/selector\(s\) resolved|did not resolve|not found|no element|strict mode violation/i.test(
      failed.error ?? '',
    )) {
    return {
      kind: 'element_missing',
      recovery: 'rediscover_selectors',
      finding:
        `"${failed.step}" could not find its control and gave up in ` +
        `${(failed.ms / 1000).toFixed(1)}s, which is a missing element rather than a slow one. ` +
        'The page has most likely changed.',
      automatic: false,
    };
  }

  if (failed.action === 'goto') {
    return {
      kind: 'navigation_failed',
      recovery: 'escalate',
      finding: `"${failed.step}" could not load its page. ${failed.error ?? ''}`.trim(),
      automatic: false,
    };
  }

  return {
    kind: 'unknown',
    recovery: 'escalate',
    finding: `"${failed.step}" failed after ${(failed.ms / 1000).toFixed(1)}s. ${failed.error ?? ''}`.trim(),
    automatic: false,
  };
}

/**
 * A sign-in that reported success and left the form on screen.
 *
 * Separate from the general diagnosis because it is checkable directly and its
 * consequence is specific: everything downstream records a signed-out product
 * while believing it is signed in, which is the one failure that produces
 * *plausible* footage of the wrong thing.
 */
export function diagnoseAuth(steps: DiagnosedStep[]): Diagnosis | null {
  const wait = steps.find((s) => /signed-in|logged-in|signed in/i.test(s.step));
  if (!wait || wait.ok) return null;
  return {
    kind: 'auth_failed',
    recovery: 'fix_code',
    finding:
      `"${wait.step}" never saw the signed-in state, so everything after this would have been ` +
      'recorded signed out — which looks like working footage of the wrong product state.',
    automatic: false,
  };
}
