/**
 * The account setup kit. Milestone 50.
 *
 * The operator has this page open in one window and a signup form in another.
 * What is under test is that everything they need to paste is actually here and
 * correct: the images at the exact sizes each platform demands, the limits, the
 * blocking requirements, and — most importantly — that a handle nobody could
 * check is never shown as free.
 */
import { db, expect, test } from './fixtures';

test.describe('setup kit', () => {
  test.afterEach(async () => {
    await db().query('delete from desired_handles where handle like $1', ['e2e%']);
  });

  test('renders every platform in creation order, with Instagram before Threads', async ({
    page,
  }) => {
    await page.goto('/setup-kit');

    const headings = await page.locator('main').textContent();
    expect(headings).toContain('Setup kit');

    // Threads inherits Instagram's handle, so creating it first fixes a handle
    // you may not want. The order is the deliverable, not decoration.
    const body = headings ?? '';
    expect(body.indexOf('Instagram')).toBeLessThan(body.indexOf('Threads'));
  });

  test('serves each platform avatar at the exact size that platform demands', async ({
    request,
  }) => {
    // A platform given 1080 when it wants 200 either rejects it or resamples it
    // badly, and the operator finds out in the upload box.
    const cases = [
      { platform: 'tiktok', bytes: 'PNG', width: 200 },
      { platform: 'x', width: 400 },
      { platform: 'youtube', width: 800 },
    ];

    for (const one of cases) {
      const response = await request.get(
        `/api/setup-kit/image?product=recipefix&platform=${one.platform}&kind=avatar`,
      );
      expect(response.status(), one.platform).toBe(200);
      expect(response.headers()['content-type']).toBe('image/png');

      const png = await response.body();
      // PNG IHDR: width is a big-endian uint32 at byte 16.
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.readUInt32BE(16), `${one.platform} avatar width`).toBe(one.width);
    }
  });

  test('serves a banner only where the platform has one', async ({ request }) => {
    const youtube = await request.get(
      '/api/setup-kit/image?product=recipefix&platform=youtube&kind=banner',
    );
    expect(youtube.status()).toBe(200);
    const png = await youtube.body();
    expect(png.readUInt32BE(16)).toBe(2048);
    expect(png.readUInt32BE(20)).toBe(1152);

    // Instagram has no header image, and saying so beats returning a square.
    const instagram = await request.get(
      '/api/setup-kit/image?product=recipefix&platform=instagram&kind=banner',
    );
    expect(instagram.status()).toBe(404);
  });

  test('refuses an unknown platform rather than rendering something', async ({ request }) => {
    const response = await request.get(
      '/api/setup-kit/image?product=recipefix&platform=myspace&kind=avatar',
    );
    expect(response.status()).toBe(400);
  });

  test('downloads one archive containing the images and a paste file', async ({ request }) => {
    const response = await request.get('/api/setup-kit/download?product=recipefix&persona=brand');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/zip');
    expect(response.headers()['content-disposition']).toContain('.zip');

    const zip = await response.body();
    expect(zip.readUInt32LE(0)).toBe(0x04034b50); // a real local file header
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50); // and a real EOCD

    // The names are stored, so the archive can be checked without unpacking it.
    const text = zip.toString('latin1');
    expect(text).toContain('profiles.txt');
    expect(text).toContain('tiktok-avatar-200x200.png');
    expect(text).toContain('youtube-header-2048x1152.png');
  });

  test('the paste file carries the blocking requirements, not just the copy', async ({
    request,
  }) => {
    const zip = await (
      await request.get('/api/setup-kit/download?product=recipefix&persona=brand')
    ).body();
    const text = zip.toString('utf8');

    // The three Instagram ones are the reason the checklist exists: without
    // them no API can publish there however approved the app is.
    expect(text).toContain('Professional account');
    expect(text).toContain('Facebook Page');
    expect(text).toContain('Business, not Creator');
    expect(text).toContain('Bio limit:');
  });

  test('a handle that cannot be checked is reported unknown, never free', async ({ page }) => {
    await page.goto('/setup-kit');
    // Legal everywhere: no hyphens, since X and Pinterest both reject them.
    // A handle that is illegal on a platform is reported invalid, which is a
    // different (and also correct) answer from the one under test here.
    await page.getByPlaceholder('therecipefix').fill('e2ehalyardcheck');
    await page.getByRole('button', { name: 'Check everywhere' }).click();
    await page.waitForLoadState('networkidle');

    const rows = await db().query<{ platform: string; last_status: string }>(
      `select platform, last_status from desired_handles where handle = $1`,
      ['e2ehalyardcheck'],
    );
    expect(rows.rowCount).toBeGreaterThan(0);

    // X and TikTok cannot be checked without logging in. Neither may ever come
    // back as available: acting on a false "free" costs a rebrand across seven
    // profiles.
    for (const platform of ['x', 'tiktok']) {
      const row = rows.rows.find((r) => r.platform === platform);
      expect(row?.last_status, `${platform} must not claim availability`).toBe('unknown');
    }

    await expect(page.getByText('unknown, not free')).toBeVisible();
  });
});
