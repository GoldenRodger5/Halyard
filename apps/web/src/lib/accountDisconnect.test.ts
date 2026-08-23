/**
 * Disconnecting an account, against a real Postgres.
 *
 * This is the test the privacy policy depends on. `/privacy` and
 * `/data-deletion` tell a reader that asking for removal erases the stored
 * credential; the only thing that makes that sentence true is a statement that
 * actually nulls `access_token_enc`, and the only way to know it does is to run
 * it and read the column back.
 *
 * It also pins the distinction that made the claim false in the first place:
 * "switched off" is not "disconnected". `setCapabilityState(… 'disabled')`
 * leaves a live, decryptable token in place, and a later refactor that quietly
 * conflated the two would put the false claim back.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectAccount, sealToken } from '@halyard/core';
import { createIsolatedPool, databaseAvailable } from '../../../../packages/db/src/__tests__/testDb.js';

process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('disconnect', 4);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict (id) do nothing`,
  );
}, 180_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from pending_connections');
  await pool.query('delete from audit_log');
  await pool.query(`delete from social_accounts where handle = '@disconnecttest'`);
});

const query = async <T>(sql: string, params?: unknown[]): Promise<T[]> =>
  (await pool.query(sql, params)).rows as T[];

/** A fully-connected account: sealed tokens, scopes, a confirmed identity. */
async function seedConnected(over: { transport?: string } = {}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into social_accounts
       (product_id, platform, persona, handle, platform_user_id, capability_state,
        access_token_enc, refresh_token_enc, token_expires_at, scopes, supported_formats,
        identity_confirmed_at, last_self_test_at, last_self_test_ok, last_self_test_detail,
        last_verified_at, transport, provider_account_id)
     values ('recipefix','x','brand','@disconnecttest','12345','live',
             $1,$2, now() + interval '2 hours', array['tweet.read','tweet.write'], array['text'],
             now(), now(), true, 'x: ok', now(), $3, $4)
     returning id`,
    [
      sealToken('access-secret'),
      sealToken('refresh-secret'),
      over.transport ?? 'direct',
      over.transport === 'unified' ? 'provider-acc-1' : null,
    ],
  );
  return rows[0]!.id;
}

interface StoredAccount {
  access_token_enc: Buffer | null;
  refresh_token_enc: Buffer | null;
  token_expires_at: Date | null;
  scopes: string[];
  supported_formats: string[];
  identity_confirmed_at: Date | null;
  last_self_test_ok: boolean | null;
  last_verified_at: Date | null;
  capability_state: string;
  handle: string;
  platform_user_id: string | null;
}

const read = async (id: string): Promise<StoredAccount | undefined> =>
  (await query<StoredAccount>('select * from social_accounts where id = $1', [id]))[0];

d('disconnecting an account erases the credential', () => {
  it('nulls every stored credential column', async () => {
    const id = await seedConnected();
    const out = await disconnectAccount({ query, accountId: id, actor: 'op@example.com' });

    expect(out.found).toBe(true);
    expect(out.hadAccessToken).toBe(true);
    expect(out.hadRefreshToken).toBe(true);

    const after = await read(id);
    expect(after!.access_token_enc).toBeNull();
    expect(after!.refresh_token_enc).toBeNull();
    expect(after!.token_expires_at).toBeNull();
    expect(after!.scopes).toEqual([]);
    expect(after!.capability_state).toBe('pending_auth');
  });

  it('clears the observations that were made through the credential', async () => {
    // Permissions, formats and verification results are all evidence obtained
    // by holding the token. Keeping them would leave the account describing
    // access Halyard can no longer demonstrate.
    const id = await seedConnected();
    await disconnectAccount({ query, accountId: id, actor: 'op@example.com' });

    const after = await read(id);
    expect(after!.supported_formats).toEqual([]);
    expect(after!.identity_confirmed_at).toBeNull();
    expect(after!.last_self_test_ok).toBeNull();
    expect(after!.last_verified_at).toBeNull();
  });

  it('keeps the account row and its identity, so publications stay explicable', async () => {
    const id = await seedConnected();
    await disconnectAccount({ query, accountId: id, actor: 'op@example.com' });

    const after = await read(id);
    expect(after).toBeDefined();
    expect(after!.handle).toBe('@disconnecttest');
    expect(after!.platform_user_id).toBe('12345');
  });

  it('deletes the sealed copy staged in pending_connections', async () => {
    /**
     * The gap this closes: a token sealed into `pending_connections` during a
     * reconnect lives there for thirty minutes. Erasing only `social_accounts`
     * would leave a usable credential for the same account behind.
     */
    const id = await seedConnected();
    await pool.query(
      `insert into pending_connections
         (product_id, platform, persona, handle, access_token_enc, reconnect_account_id)
       values ('recipefix','x','brand','@disconnecttest',$1,$2)`,
      [sealToken('staged-secret'), id],
    );

    const out = await disconnectAccount({ query, accountId: id, actor: 'op@example.com' });
    expect(out.pendingDiscarded).toBe(1);

    const left = await query('select id from pending_connections');
    expect(left).toHaveLength(0);
  });

  it('records the erasure in the audit log without recording the credential', async () => {
    const id = await seedConnected();
    await disconnectAccount({ query, accountId: id, actor: 'op@example.com', reason: 'test' });

    const entries = await query<{ action: string; detail: Record<string, unknown> }>(
      `select action, detail from audit_log where entity_id = $1`,
      [id],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe('account_disconnected');
    expect(entries[0]!.detail.erasedAccessToken).toBe(true);
    expect(entries[0]!.detail.revokedAtPlatform).toBe(false);

    // The one thing a deletion record must never contain.
    const serialised = JSON.stringify(entries[0]!.detail);
    expect(serialised).not.toContain('access-secret');
    expect(serialised).not.toContain('refresh-secret');
  });

  it('is idempotent', async () => {
    const id = await seedConnected();
    await disconnectAccount({ query, accountId: id, actor: 'op@example.com' });
    const second = await disconnectAccount({ query, accountId: id, actor: 'op@example.com' });

    expect(second.found).toBe(true);
    expect(second.hadAccessToken).toBe(false);
    expect((await read(id))!.access_token_enc).toBeNull();
  });

  it('flags a unified account, whose provider connection it cannot reach', async () => {
    const id = await seedConnected({ transport: 'unified' });
    const out = await disconnectAccount({ query, accountId: id, actor: 'op@example.com' });
    expect(out.providerHoldsSeparateConnection).toBe(true);
  });
});

d('switching an account off is not disconnecting it', () => {
  it('leaves the stored token intact, which is why disconnect had to exist', async () => {
    /**
     * This is the defect the legal pages were forced to describe: the only
     * "off" Halyard had changed one text column. Asserted here so a future
     * refactor cannot quietly make the privacy claim false again by treating
     * `disabled` as removal.
     */
    const id = await seedConnected();
    await pool.query(`update social_accounts set capability_state = 'disabled' where id = $1`, [id]);

    const after = await read(id);
    expect(after!.capability_state).toBe('disabled');
    expect(after!.access_token_enc).not.toBeNull();
    expect(after!.scopes).toEqual(['tweet.read', 'tweet.write']);
  });
});
