/**
 * Account connection. Milestone 40.
 *
 * The rule under test is that a token never becomes an account without a human
 * looking at whose account it is.
 */
import { db, expect, test } from './fixtures';

const PENDING_HANDLE = 'e2e-wrong-account';

test.describe('identity confirmation', () => {
  test.afterEach(async () => {
    await db().query('delete from pending_connections where handle like $1', ['e2e-%']);
    await db().query('delete from social_accounts where handle like $1', ['@e2e-%']);
  });

  test('a staged connection is not an account until it is confirmed', async ({ page }) => {
    const { rows } = await db().query<{ id: string }>(
      `insert into pending_connections
         (product_id, platform, persona, platform_user_id, handle, display_name,
          follower_count, scopes, access_token_enc, warnings)
       values ('recipefix','x','brand','e2e-1',$1,'Wrong Account', 3, array['tweet.write'],
               '\\x00'::bytea,
               '[{"kind":"handle_mismatch","message":"You expected @recipefix but authorised @e2e-wrong-account.","fix":"Open the connect link in a private window, then reconnect.","severe":true}]'::jsonb)
       returning id`,
      [PENDING_HANDLE],
    );
    const pendingId = rows[0]!.id;

    // Nothing exists on the accounts table yet.
    const before = await db().query('select id from social_accounts where platform_user_id = $1', [
      'e2e-1',
    ]);
    expect(before.rows).toHaveLength(0);

    // The accounts screen surfaces it rather than leaving it stranded.
    await page.goto('/accounts');
    await expect(page.getByText('Waiting for you to confirm an identity')).toBeVisible();

    await page.goto(`/accounts/confirm/${pendingId}`);
    await expect(page.getByRole('heading', { name: 'Is this the right account?' })).toBeVisible();
    await expect(page.getByText(`@${PENDING_HANDLE}`).first()).toBeVisible();

    // The warning names the cause and the fix, not just that something is off.
    await expect(page.getByText('You expected @recipefix but authorised')).toBeVisible();
    // Both the warning's fix and the platform's browser-profile note say this.
    await expect(page.getByText('private window').first()).toBeVisible();

    // Discarding leaves the accounts table exactly as it was.
    await page.getByRole('button', { name: 'Discard this token' }).click();
    await page.waitForLoadState('networkidle');

    const after = await db().query('select id from social_accounts where platform_user_id = $1', [
      'e2e-1',
    ]);
    expect(after.rows).toHaveLength(0);

    // Polled: the discard is a server action, and `networkidle` reports a quiet
    // network rather than a committed transaction.
    await expect
      .poll(async () => {
        const { rows } = await db().query('select id from pending_connections where id = $1', [
          pendingId,
        ]);
        return rows.length;
      })
      .toBe(0);
  });

  test('an expired staging row cannot be confirmed after the fact', async ({ page }) => {
    const { rows } = await db().query<{ id: string }>(
      `insert into pending_connections
         (product_id, platform, persona, platform_user_id, handle, access_token_enc, expires_at)
       values ('recipefix','threads','brand','e2e-2','e2e-expired','\\x00'::bytea,
               now() - interval '1 minute')
       returning id`,
    );
    const response = await page.goto(`/accounts/confirm/${rows[0]!.id}`);
    expect(response?.status()).toBe(404);
  });
});

test.describe('routing safety', () => {
  test('the database refuses a brand item pointed at the founder account', async () => {
    const founder = await db().query<{ id: string }>(
      `select id from social_accounts where persona = 'founder' limit 1`,
    );
    expect(founder.rows).toHaveLength(1);

    await expect(
      db().query(
        `insert into content_items (product_id, account_id, platform, persona, format, category, body)
         values ('recipefix', $1, 'x', 'brand', 'text', 'education', 'E2E cross-persona attempt')`,
        [founder.rows[0]!.id],
      ),
    ).rejects.toThrow(/routing|foreign key/i);
  });
});

test.describe('the accounts screen', () => {
  test('groups by product and then persona, and says what to do before connecting', async ({
    page,
  }) => {
    await page.goto('/accounts');

    await expect(page.getByRole('heading', { name: 'RecipeFix' })).toBeVisible();
    await expect(
      page.getByText('One founder account, shared across every product'),
    ).toBeVisible();

    // Every platform states its pre-flight requirements before the round trip.
    const checklists = page.locator('summary', { hasText: 'Before you connect' });
    expect(await checklists.count()).toBeGreaterThanOrEqual(14);

    await checklists.first().click();
    await expect(page.getByText(/Otherwise:/).first()).toBeVisible();
  });
});
