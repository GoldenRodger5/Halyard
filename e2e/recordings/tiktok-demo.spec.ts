/**
 * Records the TikTok app-review demo video.
 *
 * §181. Not a test. It drives the real Halyard UI with Playwright's video
 * recorder so the submission video shows the actual product rather than a
 * screen-capture of someone narrating over a mock.
 *
 * Run it with `pnpm demo:tiktok`, which encodes the result to MP4.
 *
 * ## What it will and will not film
 *
 * TikTok requires the video to show a working end-to-end integration, and a
 * recording that implies more than has happened is worse than a short one — app
 * review is exactly the audience that checks.
 *
 * So the script films only what is real at the time it runs, and it decides that
 * by looking at the database state rather than by being told:
 *
 *   · **Always** — Halyard opening, the dashboard, Accounts, the TikTok card.
 *   · **Once a TikTok account is connected** — the Direct Post panel with live
 *     `creator_info`: creator name, privacy options, interaction controls, the
 *     commercial disclosure, the preview, and the Music Usage Confirmation.
 *
 * The authorization hop itself is deliberately not automated. It is a real
 * consent screen on TikTok's domain, and driving it from a script is both
 * against the spirit of the thing and impossible to do honestly without real
 * credentials in the recording. The operator performs that hop; the script picks
 * up on the other side.
 */
import { expect, test } from '@playwright/test';
import { db } from '../fixtures';

/** Long enough for a viewer to read the screen, short enough to keep under 120s. */
const BEAT = 1800;

test('records the TikTok integration demo', async ({ page }) => {
  test.setTimeout(240_000);

  const connected = await db().query<{ handle: string }>(
    `select handle from social_accounts
      where platform = 'tiktok' and access_token_enc is not null
        and identity_confirmed_at is not null limit 1`,
  );
  const tiktokConnected = connected.rows.length > 0;
  test.info().annotations.push({
    type: 'coverage',
    description: tiktokConnected
      ? 'TikTok connected — filming the full flow including the Direct Post panel.'
      : 'No TikTok account connected — filming up to the Connect handoff only. ' +
        'Connect an account and re-run to film the posting panel.',
  });

  // 1–3. The product opening, and the dashboard.
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(BEAT);

  // 4. Where a user manages the accounts they own.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Accounts' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(BEAT);

  // 5. The TikTok card, with its real connection state.
  const card = page.locator('#brand-tiktok');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  await page.waitForTimeout(BEAT);

  if (!tiktokConnected) {
    /*
     * Stops here on purpose. The next click leaves for TikTok's consent screen,
     * which a person must complete; filming a script pretending to be a person
     * consenting is the kind of thing this file exists to avoid.
     */
    await expect(card.getByRole('link', { name: /^(Connect|Reconnect)$/ })).toBeVisible();
    await page.waitForTimeout(BEAT);
    return;
  }

  // 6–8. A prepared TikTok video, and the panel that governs posting it.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Content' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(BEAT);

  const item = await db().query<{ id: string }>(
    `select ci.id from content_items ci
      where ci.platform = 'tiktok' and ci.status in ('pending_approval','draft')
      order by ci.created_at desc limit 1`,
  );
  if (item.rows.length === 0) {
    test.info().annotations.push({
      type: 'coverage',
      description: 'No TikTok item queued, so the posting panel could not be filmed.',
    });
    return;
  }

  await page.goto(`/queue/${item.rows[0]!.id}`);
  await page.waitForLoadState('networkidle');

  const panel = page.getByText('TikTok posting settings');
  await panel.scrollIntoViewIfNeeded();
  await expect(panel).toBeVisible();
  await page.waitForTimeout(BEAT);

  // 9–16. Each control TikTok requires, exercised in order.
  const privacy = page.getByRole('radio').first();
  if (await privacy.isVisible()) {
    await privacy.check();
    await page.waitForTimeout(BEAT);
  }
  for (const name of ['Comments', 'Duet', 'Stitch']) {
    const box = page.getByRole('checkbox', { name, exact: false }).first();
    if ((await box.count()) > 0 && (await box.isEnabled())) {
      await box.check();
      await page.waitForTimeout(600);
    }
  }
  const commercial = page.getByRole('checkbox', { name: /promotes a brand/i }).first();
  if ((await commercial.count()) > 0) {
    await commercial.check();
    await page.waitForTimeout(BEAT);
    await commercial.uncheck();
  }
  const music = page.getByRole('checkbox', { name: /Music Usage Confirmation/i }).first();
  if ((await music.count()) > 0) {
    await music.check();
    await page.waitForTimeout(BEAT);
  }
  await page.getByRole('button', { name: /Save TikTok settings/i }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(BEAT * 2);
});
