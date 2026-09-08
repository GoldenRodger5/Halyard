/**
 * The approval boundary, through the screen an operator actually uses.
 *
 * `apps/worker/src/approvalBoundary.test.ts` attacks the publisher directly.
 * This covers the half that only exists in the UI: the edit form, and what
 * happens to an approval when the words change under it.
 */
import { test } from './fixtures';

/**
 * Editing an approved item withdraws its approval.
 *
 * The gap: `editItem` changed the body and left `status` alone, so an approved
 * item could be edited and the publish job already sitting in the queue would
 * send text **nobody approved** — the exact thing the approval gate exists to
 * prevent, reached without touching the gate.
 */
test.describe('approval does not survive an edit', () => {
  /*
   * §572. Retired: there is no way to edit an approved body from the screen.
   *
   * The rule this protected is real and still enforced in `editItem` — an edit
   * after approval must return the piece to `pending_approval`, because an
   * approval is a judgement about specific words. What is gone is the caller:
   * the Gallery renders no editor, so `editItem` is a server action nothing
   * reaches (§562's shape) and there is no user path to walk.
   *
   * This is the single most important thing to restore when an edit control
   * comes back, and it is recorded as such in `docs/E2E_CONTRACT.md`.
   */
});
