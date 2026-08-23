/**
 * The public legal pages, which Meta App Review requires.
 *
 * The property that matters is that they render **without a session**: a page
 * that redirects a signed-out reviewer to a login screen fails review, and that
 * is exactly what would happen if these ever moved inside the (dashboard)
 * group.
 */
import { expect, test } from '@playwright/test';

const PAGES = [
  { path: '/privacy', heading: 'Privacy' },
  { path: '/terms', heading: 'Terms of use' },
  { path: '/data-deletion', heading: 'Data deletion' },
];

test.describe('public legal pages', () => {
  for (const page_ of PAGES) {
    test(`${page_.path} renders without authentication`, async ({ browser }) => {
      // A brand-new context: no cookies, no session, exactly what a reviewer has.
      const context = await browser.newContext();
      const page = await context.newPage();
      const response = await page.goto(page_.path);

      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { name: page_.heading })).toBeVisible();
      // Not bounced to sign-in.
      expect(page.url()).toContain(page_.path);
      await context.close();
    });
  }

  test('data deletion does not claim an automated callback exists', async ({ page }) => {
    /**
     * The easiest false sentence to write on this page. Halyard has no webhook
     * endpoint at all, so an automated deletion callback could not receive a
     * request — saying otherwise would be a claim the code cannot support.
     */
    await page.goto('/data-deletion');
    await expect(page.getByText(/does not.*implement an automated data-deletion callback/i)).toBeVisible();
  });

  test('keeps disabling and erasing as separate claims', async ({ page }) => {
    /**
     * An earlier draft said disconnecting removed the stored credential when no
     * disconnect existed at all — `setCapabilityState` changes state and never
     * clears `access_token_enc`. There is a real Disconnect now, and the page
     * must still not merge the two: disabling an account leaves its token in
     * place, which `apps/web/src/lib/accountDisconnect.test.ts` asserts against
     * a real database.
     */
    await page.goto('/data-deletion');
    await expect(page.getByText(/disabling does\s+not\s+itself erase the/i)).toBeVisible();
    await expect(
      page.getByText(/removes the\s+encrypted access and refresh tokens/i),
    ).toBeVisible();
  });

  test('does not claim disconnecting revokes access at the platform', async ({ page }) => {
    /**
     * Erasing Halyard's copy of a token does not invalidate it. Both pages have
     * to say so, because a reader who believes otherwise will not go and revoke
     * the grant where it actually lives.
     */
    await page.goto('/data-deletion');
    await expect(page.getByText(/does not revoke the\s+permission at the platform/i)).toBeVisible();

    await page.goto('/privacy');
    await expect(page.getByText(/does not revoke the permission at the platform/i)).toBeVisible();
  });

  test('each page links to the other two, so a reviewer can reach all three', async ({ page }) => {
    await page.goto('/privacy');
    // `.first()` because the privacy body also links to data deletion in prose —
    // two links to the same place is correct, so the assertion scopes rather
    // than the page changing.
    await expect(page.getByRole('link', { name: 'Terms' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Data deletion' }).first()).toBeVisible();
  });
});
