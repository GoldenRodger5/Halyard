/**
 * The platform capability surface, against real data.
 *
 * Asserts on content only the capability model can produce — a verdict word
 * plus its reason — rather than on a heading that would render whether or not
 * anything was wired.
 */
import { db, expect, test } from './fixtures';

async function cleanup(): Promise<void> {
  await db().query(`delete from capability_probes where provider like 'e2e%'`);
  await db().query(`delete from jobs where kind = 'verify_provider_capability'`);
}

test.describe('platform capability', () => {
  test.beforeEach(cleanup);
  test.afterAll(cleanup);

  test('says nothing has been probed rather than showing confident greens', async ({ page }) => {
    const { rows } = await db().query<{ n: string }>(
      'select count(*)::int as n from capability_probes',
    );
    test.skip(Number(rows[0]!.n) > 0, 'a probe exists, so the empty state is not under test');

    await page.goto('/accounts');
    await expect(page.getByText('No probe has ever run')).toBeVisible();
    // Unknown must be presented as honest, not as a failure to hide.
    await expect(page.getByText(/unknown.*rather than unsupported/i)).toBeVisible();
  });

  test('shows a verdict with the reason that produced it', async ({ page }) => {
    await page.goto('/accounts');

    // Real resolutions, computed from account state and an absent probe.
    await expect(page.getByText('Platform capability')).toBeVisible();
    await expect(page.getByText('publish_public').first()).toBeVisible();
    // A bare colour is not information; the reason is always rendered beside it.
    await expect(
      page.getByText(/awaiting platform review|needs authentication|unknown|declared, unverified/).first(),
    ).toBeVisible();
  });

  test('strategy states how much of itself is measured', async ({ page }) => {
    await page.goto('/accounts');
    await expect(page.getByText('Platform strategy')).toBeVisible();
    // Halyard has published nothing, so nothing here may claim to be measured.
    await expect(page.getByText(/None of this is measured/)).toBeVisible();
    await expect(page.getByText(/0 measured here/).first()).toBeVisible();
  });

  test('probing enqueues the job the script never had a trigger for', async ({ page }) => {
    await page.goto('/accounts');
    await page.getByRole('button', { name: 'Probe the provider' }).click();

    await expect
      .poll(async () => {
        const { rows } = await db().query<{ n: string }>(
          `select count(*) as n from jobs where kind = 'verify_provider_capability'`,
        );
        return Number(rows[0]!.n);
      })
      .toBeGreaterThan(0);
  });

  test('an unavailable probe is reported as unavailable, not as unsupported', async ({ page }) => {
    await db().query(
      `insert into capability_probes (provider, method, outcome, detail)
       values ('e2e-provider','live_api','unavailable',
               'BLOTATO_API_KEY is not set, so nothing could be probed.')`,
    );

    await page.goto('/accounts');
    await expect(page.getByText(/Last probe:/)).toBeVisible();
    await expect(page.getByText(/proves nothing, so no capability was downgraded/)).toBeVisible();
  });
});
