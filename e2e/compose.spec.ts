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

    await page.goto('/compose');
    await expect(page.getByText(/Conversations are not saved yet/i)).toBeVisible();
    // The wording that implied a capability the backend does not provide.
    await expect(page.getByText('Nothing saved yet.')).toHaveCount(0);
  });
});
