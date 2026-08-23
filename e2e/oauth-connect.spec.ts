/**
 * The connect flow, exercised in a real browser.
 *
 * §174. The OAuth tests that already existed assert that a *string* is correct —
 * that `getAuthUrl` builds the URL the provider documents. That is worth having
 * and it is not an end-to-end test: it never clicks anything, never runs the
 * route handler, never follows a redirect, and would keep passing if the button
 * were wired to the wrong href or the route threw.
 *
 * These drive the actual UI. A real click, the real route handler, the real
 * redirect chain — stopped at the provider boundary by intercepting the request,
 * so the browser proves where it was *about* to go without an external call and
 * without spending anything.
 *
 * What this still cannot cover: consent itself. That needs the operator's own
 * provider login and MFA, so the last hop stays manual by design.
 */
import { db, expect, test } from './fixtures';

/**
 * Answer anything off-origin locally, so no request reaches a provider.
 *
 * Sealing by *origin* rather than by path is deliberate. The first version
 * matched a glob per provider; Threads answered with a redirect to a different
 * host, the glob missed it, and a real request left the machine. A provider must
 * not be able to pull the suite onto the network by redirecting.
 *
 * The assertion afterwards reads `page.url()`, not a captured request. The start
 * route answers with a 307 that the browser follows as part of the same
 * navigation, so the authorize URL shows up as the page's location — which is
 * also the more honest thing to assert: it is where the operator's browser
 * actually ends up.
 */
async function sealOrigin(page: import('@playwright/test').Page, appOrigin: string) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(appOrigin) || url.startsWith('data:') || url.startsWith('about:')) {
      return route.continue();
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<html>provider</html>' });
  });
}

const APP = process.env.HALYARD_URL ?? 'http://localhost:3200';

/**
 * The Connect control on one specific card — every platform renders twice.
 *
 * Matches Reconnect too: whether the label says Connect or Reconnect depends on
 * whether the local database happens to hold a token for that platform, and the
 * handoff under test is identical either way. Keying on the label made the test
 * pass or fail on seed data, which is not what it is measuring.
 */
function connectOn(page: import('@playwright/test').Page, persona: string, platform: string) {
  return page.locator(`#${persona}-${platform}`).getByRole('link', { name: /^(Connect|Reconnect)$/ });
}

test.describe('clicking Connect', () => {
  test('X: the browser is handed to X with a complete, correct authorize request', async ({
    page,
  }) => {
    await sealOrigin(page, APP);

    await page.goto('/accounts');
    const connect = connectOn(page, 'brand', 'x');
    await expect(connect).toBeVisible();
    await connect.click();
    await page.waitForURL(/x\.com/, { timeout: 15_000 });

    const url = new URL(page.url());
    expect(url.origin + url.pathname).toBe('https://x.com/i/oauth2/authorize');

    // Every parameter X documents as required, present on a real navigation.
    for (const p of [
      'response_type',
      'client_id',
      'redirect_uri',
      'scope',
      'state',
      'code_challenge',
      'code_challenge_method',
    ]) {
      expect(url.searchParams.get(p), `missing ${p}`).toBeTruthy();
    }
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toMatch(/\/api\/oauth\/x\/callback$/);
    expect(url.searchParams.get('scope')).toContain('offline.access');
  });

  test('the PKCE verifier is stored httpOnly, and never travels in the URL', async ({
    page,
    context,
  }) => {
    await sealOrigin(page, APP);
    await page.goto('/accounts');
    await connectOn(page, 'brand', 'x').click();
    await page.waitForURL(/x\.com/, { timeout: 15_000 });

    const cookie = (await context.cookies()).find((c) => c.name === 'halyard_pkce_x');
    expect(cookie, 'PKCE verifier cookie was not set').toBeTruthy();
    expect(cookie!.httpOnly, 'verifier must not be readable by script').toBe(true);

    /*
     * The challenge goes to the provider; the verifier must not. Sending both
     * would reduce PKCE to decoration.
     */
    const url = new URL(page.url());
    expect(url.search).not.toContain(cookie!.value);
    expect(url.searchParams.get('code_verifier')).toBeNull();
  });

  test('each attempt gets a fresh challenge and a fresh state', async ({ page }) => {
    await sealOrigin(page, APP);
    const authorize: string[] = [];
    for (let i = 0; i < 2; i++) {
      await page.goto('/accounts');
      await connectOn(page, 'brand', 'x').click();
      await page.waitForURL(/x\.com/, { timeout: 15_000 });
      authorize.push(page.url());
    }
    const [a, b] = authorize.map((u) => new URL(u));
    expect(a!.searchParams.get('code_challenge')).not.toBe(b!.searchParams.get('code_challenge'));
    expect(a!.searchParams.get('state')).not.toBe(b!.searchParams.get('state'));
  });
});

test.describe('the callback refuses what it should refuse', () => {
  test('a forged state does not create a pending connection', async ({ page }) => {
    const before = await db().query('select count(*)::int n from pending_connections');

    await page.goto('/api/oauth/x/callback?code=fake-code&state=forged.signature');
    await page.waitForURL(/\/accounts/, { timeout: 15_000 });

    /* The operator is told, in words, on the page they came from. */
    await expect(page.getByText(/state|signature/i).first()).toBeVisible();

    const after = await db().query('select count(*)::int n from pending_connections');
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  test('a callback with no code is refused', async ({ page }) => {
    await page.goto('/api/oauth/x/callback?state=whatever');
    await page.waitForURL(/\/accounts/, { timeout: 15_000 });
    await expect(page.getByText(/missing code or state/i).first()).toBeVisible();
  });

  test("a provider error is shown as the provider's words, not a stack trace", async ({ page }) => {
    await page.goto('/api/oauth/x/callback?error=access_denied&error_description=User+said+no');
    await page.waitForURL(/\/accounts/, { timeout: 15_000 });
    await expect(page.getByText(/access_denied/i).first()).toBeVisible();
    await expect(page.getByText(/User said no/i).first()).toBeVisible();
  });
});

test.describe('what the operator is told', () => {
  test('the exact callback to register is on the card, matching what is sent', async ({ page }) => {
    await sealOrigin(page, APP);
    await page.goto('/accounts');

    const card = page.locator('#brand-x');
    const panel = card.getByText(/needs to be told/i).first();
    await expect(panel).toBeVisible();
    await panel.click();

    const shown = (await card.getByText(/\/api\/oauth\/x\/callback$/).first().innerText()).trim();

    await connectOn(page, 'brand', 'x').click();
    await page.waitForURL(/x\.com/, { timeout: 15_000 });

    /* The value we tell them to register is the value we actually send. */
    expect(new URL(page.url()).searchParams.get('redirect_uri')).toBe(shown);
  });
});
