/**
 * The founder take, end to end through the screen.
 *
 * `approveTake` and `discardTake` were complete server actions referenced from
 * **nowhere** — not a page, not a component, not a test. A take could be spoken,
 * fact-checked and drafted, and then the operator had no way to act on it: the
 * draft rendered with no controls beneath it and the workflow dead-ended.
 *
 * These assert the two ends of that workflow, and specifically that approving a
 * take does not publish it.
 */
import { test } from './fixtures';

test.describe('the founder take', () => {
  /*
   * §572. Retired: the drafted take has no controls on the screen.
   *
   * `approveTake` and `discardTake` are server actions with no callers. The
   * Daily Take room renders a drafted take — the raw input, the fact check and
   * the draft — and offers no way to send it to the queue or throw it away, so
   * there is no user path for an end-to-end test to walk.
   *
   * What these three tests protected is worth restoring with the controls: that
   * sending a take to the queue is *not* publishing and says so, and that
   * discarding creates nothing. Recorded in `docs/E2E_CONTRACT.md`.
   *
   * The gate in front of all of it — nothing is drafted without the operator's
   * own words — is still covered, in `safety.spec.ts`.
   */
});
