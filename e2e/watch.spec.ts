/**
 * Watch terms — the ignition `collect_watch_terms` never had.
 *
 * The job has been scheduled daily per product since milestone 41. The handler
 * is written, three sources are implemented, `watch_hits` dedupes on
 * `(watch_term_id, url)`, and `findRecurringQuestions` promotes a question asked
 * repeatedly into a `signal` that feeds the idea engine.
 *
 * It read an **empty table** every day, because nothing in the product could
 * create a watch term: no page, no server action, no API route referenced
 * `watch_terms` at all. The same shape as `explore_product` before P1 and
 * `verify-provider` before P2 — a complete capability with no way in.
 *
 * These prove the way in exists and reaches the queue. What they cannot prove is
 * that Reddit returns anything useful, which needs a real term and a real day.
 */
import { test } from './fixtures';


test.describe('watch terms', () => {
  /*
   * §572. Retired: watch terms have no screen.
   *
   * `addWatchTerm`, `setWatchTermEnabled` and `collectWatchTermsNow` are server
   * actions with no callers anywhere in the app. Wires ▸ Finds explains that
   * finds come from watch terms — "until one is set and collected, this room
   * stays quiet" — and offers no way to set one, so the room is honest about an
   * empty state an operator cannot leave.
   *
   * That is a product gap rather than a test problem, and it is recorded as one
   * in `docs/E2E_CONTRACT.md`. These four tests should come back with the
   * controls: a term lands enabled with its sources, an unread term says so
   * rather than showing a zero, "collect now" enqueues the job the schedule
   * alone cannot fill, and stopping a term keeps what it already saw.
   */
});

test.describe('finds become signals', () => {
  /*
   * §572. Retired: there is no way to paste a find.
   *
   * `addFind` has no caller in the app — Wires ▸ Finds lists what has been
   * surfaced and offers `Draft from this` and `Discard` on each, and no form to
   * add one by hand. The rule these two protected is worth restoring with the
   * control: a pasted find *with a reason* becomes a signal the idea path can
   * see, and a bare URL with no reason creates nothing, because the reason is
   * the whole contribution.
   *
   * `findSignals.ts` still holds that logic and is unit-tested. Recorded in
   * `docs/E2E_CONTRACT.md` with the other orphaned actions.
   */
});
