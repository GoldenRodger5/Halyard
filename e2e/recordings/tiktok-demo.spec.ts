/**
 * Records the TikTok app-review demo video.
 *
 * §190. Not a test. It drives the real Halyard UI on the real deployment so the
 * submission video shows the actual product.
 *
 * It reads its state from **the page it is filming**, not from a database. The
 * first version asked `DATABASE_URL` whether a TikTok account was connected,
 * which is the local database — so it filmed production while consulting a
 * different install, decided nothing was connected, and stopped after four
 * seconds. Whatever the recording is about to show is the only honest source for
 * what it can show.
 *
 * The authorization hop itself is never automated. It is a real consent screen
 * on TikTok's domain, and a script pretending to be a person consenting is the
 * thing this file exists not to do. The account is connected beforehand; the
 * recording shows the result, which is what review needs to see.
 */
import { expect, test } from '@playwright/test';

/** Long enough to read a screen, short enough to stay inside 120 seconds. */
const BEAT = 2200;

test('records the TikTok integration demo', async ({ page }) => {
  test.setTimeout(300_000);

  // ── 1. The product, on the domain the submission names. ──────────────────
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await page.waitForTimeout(BEAT);

  // ── 2. Where a user manages the accounts they own. ───────────────────────
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Accounts' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(BEAT);

  // ── 3. The TikTok account, connected, with what TikTok itself reports. ───
  const card = page.locator('#brand-tiktok');
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  await page.waitForTimeout(BEAT);

  const connected = (await card.getByText(/Connected|Direct Post is available/i).count()) > 0;
  test.info().annotations.push({
    type: 'coverage',
    description: connected
      ? 'TikTok connected — filming Login Kit result and the Content Posting API panel.'
      : 'TikTok not connected on this deployment; filmed up to the Connect affordance only.',
  });

  if (!connected) {
    await expect(card.getByRole('link', { name: /^(Connect|Reconnect)$/ })).toBeVisible();
    await page.waitForTimeout(BEAT);
    return;
  }

  /* Advanced details carry the scopes and the capability TikTok reported. */
  const advanced = card.getByText(/Advanced connection details/i).first();
  if ((await advanced.count()) > 0) {
    await advanced.click();
    await page.waitForTimeout(BEAT);
  }

  // ── 4. A prepared TikTok video, found through the UI. ────────────────────
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Content' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(BEAT);

  const tiktokItem = page.locator('[id^="queue-item-"]').filter({ hasText: /TikTok/i }).first();
  if ((await tiktokItem.count()) === 0) {
    test.info().annotations.push({
      type: 'coverage',
      description: 'No TikTok item in the queue, so the posting panel could not be filmed.',
    });
    return;
  }
  await tiktokItem.scrollIntoViewIfNeeded();
  await page.waitForTimeout(BEAT);

  /*
   * Opened by the item's own id rather than by clicking whichever link happens
   * to be first inside the card — several of them lead elsewhere, and the
   * recording should land on the detail screen every time.
   */
  const itemId = (await tiktokItem.getAttribute('id'))!.replace('queue-item-', '');
  await page.goto(`/queue/${itemId}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(BEAT);

  // ── 5. The Direct Post panel, built from live creator_info. ──────────────
  const panel = page.getByText('TikTok posting settings');
  await panel.scrollIntoViewIfNeeded();
  await expect(panel).toBeVisible();
  await page.waitForTimeout(BEAT);

  /* If creator info has not been fetched yet, fetch it on camera. */
  const fetchInfo = page.getByRole('button', { name: /Get TikTok settings/i });
  if ((await fetchInfo.count()) > 0) {
    await fetchInfo.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(BEAT);
    await page.getByText('TikTok posting settings').scrollIntoViewIfNeeded();
  }

  // ── 6. Visibility, chosen — never defaulted. ────────────────────────────
  const privacy = page.getByRole('radio');
  if ((await privacy.count()) > 0) {
    await privacy.first().check();
    await page.waitForTimeout(BEAT);
  }

  // ── 7. Interaction settings, each off until chosen. ─────────────────────
  for (const name of [/Comments/i, /Duet/i, /Stitch/i]) {
    const box = page.getByRole('checkbox', { name }).first();
    if ((await box.count()) > 0 && (await box.isEnabled())) {
      await box.check();
      await page.waitForTimeout(700);
    }
  }

  // ── 8. Commercial content disclosure, off by default. ───────────────────
  const commercial = page.getByRole('checkbox', { name: /promotes a brand/i }).first();
  if ((await commercial.count()) > 0) {
    await commercial.check();
    await page.waitForTimeout(BEAT);
    await commercial.uncheck();
    await page.waitForTimeout(600);
  }

  // ── 9. TikTok's Music Usage Confirmation. ───────────────────────────────
  const music = page.getByRole('checkbox', { name: /Music Usage Confirmation/i }).first();
  if ((await music.count()) > 0) {
    await music.check();
    await page.waitForTimeout(BEAT);
  }

  // ── 10. Saved, and the panel reports whether it may be posted. ──────────
  const save = page.getByRole('button', { name: /Save TikTok settings/i });
  if ((await save.count()) > 0) {
    await save.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(BEAT);
    await page.getByText('TikTok posting settings').scrollIntoViewIfNeeded();
    await page.waitForTimeout(BEAT * 2);
  }
});
