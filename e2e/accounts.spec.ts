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
    // Wording changed in the Accounts clarity pass; the behaviour it guards —
    // a staged connection is not an account until a person confirms it — is
    // unchanged, and the assertion below still proves it.
    await expect(page.getByText('Waiting for you to confirm the right account')).toBeVisible();

    await page.goto(`/accounts/confirm/${pendingId}`);
    // Heading reworded in the connection-flow clarity pass. What it guards —
    // the token is held, not saved, until a person confirms — is unchanged, and
    // the assertions below still prove it.
    await expect(page.getByRole('heading', { name: /Confirm your .* account/ })).toBeVisible();
    await expect(page.getByText('Nothing is saved until you confirm.')).toBeVisible();
    await expect(page.getByText(`@${PENDING_HANDLE}`).first()).toBeVisible();

    // The warning names the cause and the fix, not just that something is off.
    await expect(page.getByText('You expected @recipefix but authorised')).toBeVisible();
    // Both the warning's fix and the platform's browser-profile note say this.
    await expect(page.getByText('private window').first()).toBeVisible();

    // Discarding leaves the accounts table exactly as it was.
    // Renamed from "Discard this token": the operator is cancelling a
    // connection, not managing a credential. Same action, same server handler.
    await page.getByRole('button', { name: 'Cancel connection' }).click();
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
    const checklists = page.locator('summary', { hasText: 'What this account needs before connecting' });
    expect(await checklists.count()).toBeGreaterThanOrEqual(14);

    await checklists.first().click();
    await expect(page.getByText(/Otherwise:/).first()).toBeVisible();
  });
});

/**
 * Disconnecting an account, through the screen an operator actually uses.
 *
 * The unit and integration tests prove the erasure works. What only this can
 * prove is that the guard in front of it does: the confirmation is the whole
 * safety mechanism for the one irreversible button on the page, and a guard
 * nobody has typed a wrong value into is a guard nobody has tested.
 */
test.describe('disconnecting an account', () => {
  const HANDLE = '@e2e-disconnect';

  async function seed(): Promise<string> {
    // A throwaway founder slot, so no seeded account is disturbed. The token
    // bytes are a placeholder: nothing on this path ever opens them.
    const { rows } = await db().query<{ id: string }>(
      `insert into social_accounts
         (product_id, platform, persona, handle, platform_user_id, capability_state,
          access_token_enc, refresh_token_enc, token_expires_at, scopes, identity_confirmed_at)
       values ('founder','threads','founder',$1,'e2e-disc','live',
               '\\x00'::bytea, '\\x01'::bytea, now() + interval '2 hours',
               array['threads_basic'], now())
       returning id`,
      [HANDLE],
    );
    return rows[0]!.id;
  }

  const tokenOf = async (id: string): Promise<Buffer | null> => {
    const { rows } = await db().query<{ access_token_enc: Buffer | null }>(
      'select access_token_enc from social_accounts where id = $1',
      [id],
    );
    return rows[0]?.access_token_enc ?? null;
  };

  test.afterEach(async () => {
    await db().query('delete from social_accounts where handle = $1', [HANDLE]);
    await db().query(`delete from audit_log where action = 'account_disconnected'`);
  });

  test('a mistyped handle erases nothing and says so', async ({ page }) => {
    const id = await seed();
    await page.goto('/accounts');

    const panel = page
      .locator('details')
      .filter({ has: page.locator(`input[placeholder="type ${HANDLE} to confirm"]`) });
    await panel.locator('summary').click();

    await panel.locator('input[name="confirmHandle"]').fill('@some-other-account');
    await panel.getByRole('button', { name: 'Disconnect and erase credential' }).click();

    await expect(page.getByText('Nothing was erased.')).toBeVisible();
    expect(await tokenOf(id)).not.toBeNull();
  });

  test('the typed handle erases the stored credential and records it', async ({ page }) => {
    const id = await seed();
    await page.goto('/accounts');

    const panel = page
      .locator('details')
      .filter({ has: page.locator(`input[placeholder="type ${HANDLE} to confirm"]`) });
    await panel.locator('summary').click();

    // Without the leading @, which is what an operator reading the card types.
    await panel.locator('input[name="confirmHandle"]').fill('e2e-disconnect');
    await panel.getByRole('button', { name: 'Disconnect and erase credential' }).click();

    // Polled: a server action's redirect is not the transaction committing.
    await expect.poll(async () => tokenOf(id)).toBeNull();

    // And the operator is told what did *not* happen, not only what did.
    await expect(page.getByText('does not revoke the permission at the platform')).toBeVisible();

    const { rows } = await db().query<{ action: string }>(
      `select action from audit_log where entity_id = $1 and action = 'account_disconnected'`,
      [id],
    );
    expect(rows).toHaveLength(1);

    // The row survives, so anything published from it stays explicable.
    const { rows: still } = await db().query('select id from social_accounts where id = $1', [id]);
    expect(still).toHaveLength(1);
  });
});
