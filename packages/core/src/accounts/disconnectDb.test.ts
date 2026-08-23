/**
 * Credential erasure, against a real Postgres.
 *
 * `disconnect.test.ts` drives `disconnectAccount` with a **stubbed** query
 * function, so it proves the read-back logic reacts correctly to a row that is
 * already erased. It never runs the UPDATE that does the erasing. Deleting
 * `refresh_token_enc = null` from that statement left all 48 of those tests
 * passing while a live refresh token stayed in the database.
 *
 * That matters more here than almost anywhere else: `/data-deletion` is a
 * public page that tells a platform reviewer Disconnect "removes the encrypted
 * access and refresh tokens, the recorded permissions, the identity
 * confirmation, and discards any credential staged mid-reconnect". These
 * assertions are the evidence for that sentence.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../db/src/__tests__/testDb.js';
import { disconnectAccount } from './disconnect.js';
import { sealToken } from '../crypto/tokenCrypto.js';

process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64');

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

/**
 * Typed by the shape used rather than by importing `pg`.
 *
 * `@halyard/core` does not depend on the driver and should not start to for a
 * test — the harness in `@halyard/db` owns that. Only `query` and `end` are
 * needed here.
 */
interface TestPool {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

let pool: TestPool;

/** The real thing, not a stub: whatever the SQL does is what is asserted. */
function realQuery<T>(sql: string, params?: unknown[]): Promise<T[]> {
  return pool.query<T>(sql, params).then((r) => r.rows);
}

beforeAll(async () => {
  if (!available) return;
  pool = (await createIsolatedPool('disconnect_db', 4)) as unknown as TestPool;
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict (id) do nothing`,
  );
});

afterAll(async () => {
  if (pool) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from pending_connections');
  await pool.query('delete from social_accounts');
});

async function seedConnectedAccount(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into social_accounts
       (product_id, platform, persona, handle, access_token_enc, refresh_token_enc,
        token_expires_at, scopes, identity_confirmed_at, capability_state)
     values ('recipefix','x','brand','@rf', $1, $2, now() + interval '1 hour',
             '{tweet.read,tweet.write}', now(), 'live')
     returning id`,
    [sealToken('access-token-secret'), sealToken('refresh-token-secret')],
  );
  return rows[0]!.id;
}

d('disconnectAccount against a real database', () => {
  it('actually nulls both stored tokens', async () => {
    const id = await seedConnectedAccount();
    await disconnectAccount({ query: realQuery, accountId: id, actor: 'op@example.com' });

    const { rows } = await pool.query<{ access: Buffer | null; refresh: Buffer | null }>(
      'select access_token_enc as access, refresh_token_enc as refresh from social_accounts where id = $1',
      [id],
    );
    // The refresh token is the one a stub cannot vouch for: it is what would let
    // a leaked copy mint new access tokens long after a "disconnect".
    expect(rows[0]!.access).toBeNull();
    expect(rows[0]!.refresh).toBeNull();
  });

  it('leaves no ciphertext anywhere in the row', async () => {
    const id = await seedConnectedAccount();
    await disconnectAccount({ query: realQuery, accountId: id, actor: 'op@example.com' });

    const { rows } = await pool.query<Record<string, unknown>>(
      'select * from social_accounts where id = $1',
      [id],
    );
    const serialised = JSON.stringify(rows[0], (_k, v) =>
      Buffer.isBuffer(v) ? v.toString('hex') : v,
    );
    expect(serialised).not.toContain(sealToken('access-token-secret').toString('hex').slice(0, 16));
  });

  it('clears the permissions and the identity confirmation', async () => {
    const id = await seedConnectedAccount();
    await disconnectAccount({ query: realQuery, accountId: id, actor: 'op@example.com' });

    const { rows } = await pool.query<{
      scopes: string[];
      identity_confirmed_at: Date | null;
      token_expires_at: Date | null;
      capability_state: string;
    }>(
      `select scopes, identity_confirmed_at, token_expires_at, capability_state
         from social_accounts where id = $1`,
      [id],
    );
    expect(rows[0]!.scopes).toEqual([]);
    expect(rows[0]!.identity_confirmed_at).toBeNull();
    expect(rows[0]!.token_expires_at).toBeNull();
    // Not "live" with no credential — §5's trap.
    expect(rows[0]!.capability_state).toBe('pending_auth');
  });

  it('discards a credential staged mid-reconnect', async () => {
    const id = await seedConnectedAccount();
    await pool.query(
      `insert into pending_connections (product_id, platform, persona, handle, access_token_enc, expires_at)
       values ('recipefix','x','brand','@rf', $1, now() + interval '30 minutes')`,
      [sealToken('staged-token')],
    );

    await disconnectAccount({ query: realQuery, accountId: id, actor: 'op@example.com' });

    // A disconnect that only touched social_accounts would leave a usable
    // credential for the same account in the other table.
    const { rows } = await pool.query('select 1 from pending_connections');
    expect(rows).toHaveLength(0);
  });

  it('refuses to report success if the erasure did not take effect', async () => {
    // The read-back guard, exercised against a real row rather than a stub.
    const id = await seedConnectedAccount();
    /*
     * A trigger rather than a rule: the UPDATE must *succeed* and return a row,
     * so the failure being tested is the read-back noticing the token survived
     * — a policy or trigger quietly restoring it — rather than the statement
     * erroring, which would be caught anyway.
     */
    await pool.query(`
      create or replace function keep_token() returns trigger language plpgsql as $fn$
      begin
        new.refresh_token_enc := old.refresh_token_enc;
        return new;
      end $fn$;
      create trigger keep_token_trg before update on social_accounts
        for each row execute function keep_token();
    `);
    try {
      await expect(
        disconnectAccount({ query: realQuery, accountId: id, actor: 'op@example.com' }),
      ).rejects.toThrow(/did not take effect|nothing has been reported as deleted/);
    } finally {
      await pool.query('drop trigger if exists keep_token_trg on social_accounts');
    }

    // And the token is still there, which is the honest outcome: nothing was
    // deleted and nothing claimed otherwise.
    const { rows } = await pool.query<{ refresh: Buffer | null }>(
      'select refresh_token_enc as refresh from social_accounts where id = $1',
      [id],
    );
    expect(rows[0]!.refresh).not.toBeNull();
  });
});
