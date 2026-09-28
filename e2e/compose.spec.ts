/**
 * Surfaces must not imply controls the product does not have.
 *
 * The same rule `legal.spec.ts` holds for the privacy pages, applied to the
 * dashboard: `compose_sessions` has a reader on this page and **no writer
 * anywhere**, so the list is empty by construction rather than by circumstance.
 * "Nothing saved yet" told the operator they had not saved one.
 */
import { db, expect, test } from './fixtures';

test.describe('compose', () => {
  test('does not imply conversations can be saved', async ({ page }) => {
    const { rows } = await db().query('select id from compose_sessions');
    test.skip(rows.length > 0, 'a session exists, so the empty state is not under test');

    await page.goto('/floor/chat');

    /*
     * §572. The disclaimer is gone because the thing it disclaimed is gone.
     *
     * Chat used to render a list of saved conversations that could never fill,
     * and a sentence explaining why. The rebuilt room shows neither — there is
     * no session list to misread. What must still hold is the rule: nothing on
     * this page may imply a conversation was, or could be, saved.
     */
    await expect(page.getByText('Nothing saved yet.')).toHaveCount(0);
    await expect(page.getByText(/saved conversations?/i)).toHaveCount(0);

    /* And the room is still usable: something to say it to, and a way to send. */
    await expect(page.getByRole('button', { name: /^Send$/ })).toBeVisible();
  });
});
