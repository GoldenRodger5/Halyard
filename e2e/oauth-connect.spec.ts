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
    await page.waitForURL(/\/(accounts|master)/, { timeout: 15_000 });

    /* The operator is told, in words, on the page they came from. */
    await expect(page.getByText(/state|signature/i).first()).toBeVisible();

    const after = await db().query('select count(*)::int n from pending_connections');
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  test('a callback with no code is refused', async ({ page }) => {
    await page.goto('/api/oauth/x/callback?state=whatever');
    await page.waitForURL(/\/(accounts|master)/, { timeout: 15_000 });
    await expect(page.getByText(/missing code or state/i).first()).toBeVisible();
  });

  test("a provider error is shown as the provider's words, not a stack trace", async ({ page }) => {
    await page.goto('/api/oauth/x/callback?error=access_denied&error_description=User+said+no');
    await page.waitForURL(/\/(accounts|master)/, { timeout: 15_000 });
    await expect(page.getByText(/access_denied/i).first()).toBeVisible();
    await expect(page.getByText(/User said no/i).first()).toBeVisible();
  });
});

test.describe('what the operator is told', () => {
  test('the exact callback to register is on the card, matching what is sent', async ({ page }) => {
    await sealOrigin(page, APP);
    await page.goto('/accounts');

    /*
     * §572. Every card that discloses one, not one named card.
     *
     * This keyed on `#founder-x`, on the reasoning that registration values are
     * shown while a platform is unconnected. Both X accounts are `live` in
     * `seed.sql`, so on the only database CI has there is no disclosure on that
     * card at all and the test hung on an element that was never going to
     * appear. Worse, the half that clicked Connect could only run where a
     * developer app happened to be configured — a property of whichever `.env`
     * was sourced, not of the product.
     *
     * The contract is *what we tell you to register is what we send*. The
     * sending half is already proven by the brand-X test above, which reads the
     * real `redirect_uri` off the authorize URL. This half holds every card that
     * shows a redirect URI to the same value, in any environment.
     */
    const disclosures = page.locator('summary', { hasText: /what this platform needs/i });
    const count = await disclosures.count();
    expect(count, 'no platform disclosed what it needs').toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) await disclosures.nth(i).click();

    const shown = page.getByText(/\/api\/oauth\/[a-z]+\/callback$/);
    const shownCount = await shown.count();
    expect(shownCount, 'no callback URL was offered for registration').toBeGreaterThan(0);

    for (let i = 0; i < shownCount; i += 1) {
      /*
       * Pulled out of the text rather than parsed whole: the smallest element
       * matching still carries its own label ("Valid OAuth Redirect URIs …"),
       * and `new URL` on that throws before it can assert anything.
       */
      // `textContent`, not `innerText`: these sit inside a <details> that may
      // still be collapsed, and innerText returns '' for anything not rendered.
      const text = (await shown.nth(i).textContent()) ?? '';
      const value = /https?:\/\/\S+\/api\/oauth\/[a-z]+\/callback/.exec(text)?.[0];
      expect(value, `no callback URL found in: ${text}`).toBeTruthy();

      /* The origin we tell them to register is the origin we are served from. */
      const url = new URL(value!);
      expect(url.origin, `${value} does not point at this deployment`).toBe(new URL(APP).origin);
      expect(url.pathname).toMatch(/^\/api\/oauth\/[a-z]+\/callback$/);
    }
  });
});

test.describe('platforms with no developer app', () => {
  /*
   * §174. These used to render Connect like everything else. Clicking it reached
   * the OAuth route, which answered 428 with a raw JSON body — a dead button that
   * told the operator nothing they could act on.
   *
   * Locally TikTok, Pinterest and YouTube have no complete client credentials,
   * which is the same state production is in, so the honest rendering is
   * assertable in a browser rather than only in a unit test.
   */
  /*
   * §572. Which platforms those are is not a constant.
   *
   * This iterated `['tiktok', 'pinterest', 'youtube']` under a comment saying
   * they have no credentials locally. That is a property of whichever `.env`
   * the run happened to source — TikTok and YouTube are configured on the
   * machine this was rewritten on — so the test asserted the honest-rendering
   * rule against platforms that were correctly offering Connect, and failed for
   * being right.
   *
   * The rule is what matters and it is state-shaped: *whatever* card says it
   * has no developer app must offer no Connect and must name what is missing.
   * So the page is asked which those are, and every one of them is held to it.
   */
  test('every platform with no developer app says so, and offers no dead Connect', async ({
    page,
  }) => {
    await page.goto('/accounts');

    const cards = page.locator('[id$="-tiktok"], [id$="-pinterest"], [id$="-youtube"], [id$="-instagram"], [id$="-threads"], [id$="-x"], [id$="-bluesky"]');
    const total = await cards.count();
    expect(total, 'no account cards on the connections screen').toBeGreaterThan(0);

    let unconfigured = 0;
    for (let i = 0; i < total; i += 1) {
      const card = cards.nth(i);
      const missing = card.getByText(/No developer app registered/i);
      if ((await missing.count()) === 0) continue;
      unconfigured += 1;

      /* A dead Connect button is the defect §174 removed. It must not return. */
      await expect(card.getByRole('link', { name: /^(Connect|Reconnect)$/ })).toHaveCount(0);

      /*
       * And it must say which variables. A name is not a secret; a value would
       * be, and none is rendered.
       */
      await expect(card).toContainText(/_APP_|_CLIENT_/);
    }

    /*
     * Bluesky and Pinterest have no developer app in any environment this runs
     * in, so a zero here means the state stopped rendering rather than that
     * every platform got configured.
     */
    expect(unconfigured, 'no card reported a missing developer app').toBeGreaterThan(0);
  });

  test('a platform that is configured still offers Connect', async ({ page }) => {
    /* The contrast that proves the check is discriminating, not blanket. */
    await page.goto('/accounts');
    await expect(connectOn(page, 'founder', 'x')).toBeVisible();
  });
});
