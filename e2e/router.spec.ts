/**
 * The link router. Milestone 42.
 *
 * Definition of done: a gluten-free bread post links to that exact recipe,
 * opens in the app on iOS if installed, and the click is logged with device
 * class and attributed.
 *
 * The "opens in the app" half is a property of recipefix.app's
 * apple-app-site-association, which covers every path with a wildcard — so what
 * is testable here is that iOS is sent to the web URL rather than bounced
 * through the App Store, which is the decision that makes the universal link
 * work at all.
 */
import { db, expect, test } from './fixtures';

const SHARE_URL = 'https://recipefix.app/recipe/be1b2a5f-5015-4e0c-9194-8bae735e9e01';

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Mobile Safari/537.36',
  twitterbot: 'Twitterbot/1.0',
};

async function seedRoutedItem(destinationType: string, destinationUrl: string): Promise<string> {
  const account = await db().query<{ id: string }>(
    `select id from social_accounts where platform = 'x' and persona = 'brand' limit 1`,
  );
  const { rows } = await db().query<{ id: string }>(
    `insert into content_items (product_id, account_id, platform, persona, format, category,
                                body, status, destination_type, destination_url, generation_meta)
     values ('recipefix', $1, 'x', 'brand', 'text', 'transformation',
             'E2E router. Gluten-free artisan bread, adapted.', 'published', $2, $3,
             '{"e2e":true}'::jsonb)
     returning id`,
    [account.rows[0]!.id, destinationType, destinationUrl],
  );
  return rows[0]!.id;
}

test.describe('the smart router', () => {
  test.afterEach(async () => {
    await db().query(
      `delete from content_items where generation_meta ->> 'e2e' = 'true'`,
    );
  });

  test('sends every device to the exact recipe, and logs the click with its device class', async ({
    request,
  }) => {
    const id = await seedRoutedItem('share_link', SHARE_URL);

    for (const [device, userAgent] of [
      ['ios', UA.iphone],
      ['android', UA.android],
      ['bot', UA.twitterbot],
    ] as const) {
      const response = await request.get(`/r/${id}?utm_source=x&utm_content=${id}`, {
        headers: { 'user-agent': userAgent },
        maxRedirects: 0,
      });

      expect(response.status(), device).toBe(302);
      const location = response.headers()['location']!;
      expect(location, device).toContain('recipefix.app/recipe/');
      // iOS must not be bounced through the App Store: recipefix.app is
      // configured for universal links, so the installed app opens this URL.
      expect(location, device).not.toContain('apps.apple.com');
      // UTMs ride along to whatever the router picks.
      expect(location, device).toContain('utm_source=x');
    }

    await expect
      .poll(async () => {
        const { rows } = await db().query<{ device_class: string }>(
          'select device_class from link_clicks where content_item_id = $1 order by clicked_at',
          [id],
        );
        return rows.map((r) => r.device_class).sort();
      })
      .toEqual(['android', 'bot', 'ios']);
  });

  test('sends iOS to the App Store with campaign parameters only for a native-only post', async ({
    request,
  }) => {
    const id = await seedRoutedItem('app_store', 'https://apps.apple.com/app/id6759676502');

    const response = await request.get(`/r/${id}`, {
      headers: { 'user-agent': UA.iphone },
      maxRedirects: 0,
    });
    const location = response.headers()['location']!;

    expect(location).toContain('apps.apple.com');
    // The parameters App Store Connect actually reads.
    expect(location).toContain('mt=8');
    expect(location).toContain('ct=');
  });

  test('sends an unknown link somewhere real rather than to an error page', async ({ request }) => {
    const response = await request.get('/r/not-a-uuid', { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toContain('recipefix.app');
  });

  test('shows the resolved destination on the item before approval', async ({ page }) => {
    const id = await seedRoutedItem('web', 'https://recipefix.app');
    await page.goto(`/queue/${id}`);

    await expect(page.getByRole('heading', { name: 'Destination' })).toBeVisible();
    // The QC warning that exists precisely for this case.
    await expect(
      page.getByText('the link goes to the homepage', { exact: false }),
    ).toBeVisible();
  });
});
