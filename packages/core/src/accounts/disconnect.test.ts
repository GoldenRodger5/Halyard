/**
 * Disconnecting an account, at the logic level.
 *
 * The interesting tests here are the ones about *not* reporting success: an
 * account that does not exist, and an update that silently failed to erase
 * anything. Both must be visibly distinguishable from a real erasure, because
 * the only thing worse than keeping a credential is telling someone it is gone.
 *
 * The proof that the SQL actually nulls the columns lives in
 * `apps/web/src/lib/accountDisconnect.test.ts`, against a real Postgres. A stub
 * cannot demonstrate that.
 */
import { describe, expect, it, vi } from 'vitest';
import { disconnectAccount, type DisconnectQuery } from './disconnect.js';

const ACCOUNT = {
  id: 'acc-1',
  product_id: 'recipefix',
  platform: 'x',
  persona: 'brand',
  handle: '@Recipe_Fix',
  transport: 'direct',
  has_access_token: true,
  has_refresh_token: true,
};

/** Fully erased, as the real UPDATE would return it. */
const ERASED = {
  access_token_enc: null,
  refresh_token_enc: null,
  token_expires_at: null,
  scopes: [],
  identity_confirmed_at: null,
  capability_state: 'pending_auth',
};

interface StubOptions {
  account?: Record<string, unknown> | null;
  erased?: Record<string, unknown> | null;
  pendingDeleted?: number;
}

function stub(options: StubOptions = {}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const account = options.account === undefined ? ACCOUNT : options.account;
  const erased = options.erased === undefined ? ERASED : options.erased;

  const query: DisconnectQuery = vi.fn(async <T,>(sql: string, params?: unknown[]): Promise<T[]> => {
    calls.push({ sql, params });
    if (sql.startsWith('select id, product_id')) return (account ? [account] : []) as T[];
    if (sql.includes('update social_accounts')) return (erased ? [erased] : []) as T[];
    if (sql.includes('delete from pending_connections')) {
      return Array.from({ length: options.pendingDeleted ?? 0 }, (_, i) => ({ id: `p${i}` })) as T[];
    }
    return [] as T[];
  }) as DisconnectQuery;

  return { query, calls };
}

const audit = (calls: Array<{ sql: string; params?: unknown[] }>) =>
  calls.find((c) => c.sql.includes('insert into audit_log'));

describe('disconnecting a social account', () => {
  it('erases the credential and records what it destroyed', async () => {
    const { query, calls } = stub({ pendingDeleted: 1 });
    const out = await disconnectAccount({ query, accountId: 'acc-1', actor: 'op@example.com' });

    expect(out.found).toBe(true);
    expect(out.hadAccessToken).toBe(true);
    expect(out.hadRefreshToken).toBe(true);
    expect(out.pendingDiscarded).toBe(1);

    const detail = JSON.parse(String(audit(calls)!.params![1]));
    expect(detail.operator).toBe('op@example.com');
    expect(detail.erasedAccessToken).toBe(true);
    expect(detail.pendingDiscarded).toBe(1);
    // The record must not imply the platform-side grant went with it.
    expect(detail.revokedAtPlatform).toBe(false);
  });

  it('clears the staged copy in pending_connections as well', async () => {
    /**
     * The failure this prevents: `social_accounts` erased, and a sealed token
     * for the same account still sitting in `pending_connections` for another
     * twenty-nine minutes.
     */
    const { query, calls } = stub();
    await disconnectAccount({ query, accountId: 'acc-1', actor: 'op@example.com' });

    const del = calls.find((c) => c.sql.includes('delete from pending_connections'));
    expect(del).toBeDefined();
    expect(del!.params).toContain('acc-1');
  });

  it('refuses to report success when the erasure did not take effect', async () => {
    /**
     * A policy, trigger or rewritten statement leaves the token in place while
     * the call returns cleanly. Reporting a deletion that did not happen is the
     * whole harm, so this throws rather than returning.
     */
    const { query, calls } = stub({
      erased: { ...ERASED, access_token_enc: Buffer.from('still-here') },
    });

    await expect(
      disconnectAccount({ query, accountId: 'acc-1', actor: 'op@example.com' }),
    ).rejects.toThrow(/did not take effect/);

    // And nothing was written claiming it had been deleted.
    expect(audit(calls)).toBeUndefined();
  });

  it('refuses when a scope survived the erasure', async () => {
    // Permissions are an observation made through the credential. Keeping them
    // would leave the account asserting access it can no longer demonstrate.
    const { query } = stub({ erased: { ...ERASED, scopes: ['tweet.write'] } });
    await expect(
      disconnectAccount({ query, accountId: 'acc-1', actor: 'op@example.com' }),
    ).rejects.toThrow(/did not take effect/);
  });

  it('refuses when the identity confirmation survived the erasure', async () => {
    const { query } = stub({ erased: { ...ERASED, identity_confirmed_at: '2026-08-19T00:00:00Z' } });
    await expect(
      disconnectAccount({ query, accountId: 'acc-1', actor: 'op@example.com' }),
    ).rejects.toThrow(/did not take effect/);
  });

  it('reports not-found rather than a successful erase', async () => {
    const { query, calls } = stub({ account: null });
    const out = await disconnectAccount({ query, accountId: 'nope', actor: 'op@example.com' });

    expect(out.found).toBe(false);
    expect(out.hadAccessToken).toBe(false);
    // No audit entry: nothing was disconnected, so nothing is claimed.
    expect(audit(calls)).toBeUndefined();
    expect(calls.some((c) => c.sql.includes('update social_accounts'))).toBe(false);
  });

  it('is idempotent, and still records the second request', async () => {
    // Running it against an already-disconnected account clears nothing further
    // and reports that honestly — but the request itself is a fact worth keeping.
    const { query, calls } = stub({
      account: { ...ACCOUNT, has_access_token: false, has_refresh_token: false },
    });
    const out = await disconnectAccount({ query, accountId: 'acc-1', actor: 'op@example.com' });

    expect(out.found).toBe(true);
    expect(out.hadAccessToken).toBe(false);
    expect(audit(calls)).toBeDefined();
  });

  it('says when the unified provider still holds its own connection', async () => {
    /**
     * Erasing Halyard's copy does nothing to the provider's. An operator told
     * "disconnected" about a unified account would otherwise believe a
     * connection was severed that is still live.
     */
    const { query } = stub({ account: { ...ACCOUNT, transport: 'unified' } });
    const out = await disconnectAccount({ query, accountId: 'acc-1', actor: 'op@example.com' });
    expect(out.providerHoldsSeparateConnection).toBe(true);
  });

  it('does not delete the account row', async () => {
    // Publications reference it. A publication that cannot say which account it
    // went out from is worse than a retained handle.
    const { query, calls } = stub();
    await disconnectAccount({ query, accountId: 'acc-1', actor: 'op@example.com' });
    expect(calls.some((c) => c.sql.includes('delete from social_accounts'))).toBe(false);
  });
});
