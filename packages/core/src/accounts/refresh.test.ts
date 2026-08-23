/**
 * Token refresh, which is what stands between a working X account and one that
 * silently dies two hours after it is connected.
 *
 * The tests that matter most here are the negative ones: a missing credential
 * must not look like a broken account, and a failed refresh must not throw away
 * the refresh token that is the only route back.
 */
import { describe, expect, it, vi } from 'vitest';
import { refreshDueTokens, type RefreshQuery } from './refresh.js';
import { sealToken } from '../crypto/tokenCrypto.js';

process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');

const soon = () => new Date(Date.now() + 10 * 60_000).toISOString();
const later = () => new Date(Date.now() + 48 * 60 * 60_000).toISOString();

function account(over: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    platform: 'x',
    access_token_enc: sealToken('access-abc'),
    refresh_token_enc: sealToken('refresh-abc'),
    token_expires_at: soon(),
    ...over,
  };
}

/** A query stub that returns accounts once, then records every write. */
function stubQuery(rows: unknown[]) {
  const writes: Array<{ sql: string; params?: unknown[] }> = [];
  let served = false;
  const query: RefreshQuery = vi.fn(async <T,>(sql: string, params?: unknown[]): Promise<T[]> => {
    if (!served && sql.includes('from social_accounts')) {
      served = true;
      return rows as T[];
    }
    writes.push({ sql, params });
    return [] as T[];
  }) as RefreshQuery;
  return { query, writes };
}

const CREDS = { X_CLIENT_ID: 'id', X_CLIENT_SECRET: 'secret' } as NodeJS.ProcessEnv;

describe('refreshing tokens before they expire', () => {
  it('skips an account whose token is not close to expiring', async () => {
    const { query } = stubQuery([account({ token_expires_at: later() })]);
    const out = await refreshDueTokens({ query, env: CREDS });
    expect(out.skippedNotDue).toBe(1);
    expect(out.refreshed).toBe(0);
    // Idempotence: an hourly pass costs one read and no provider calls.
    expect(vi.mocked(query)).toHaveBeenCalledTimes(1);
  });

  it('does not mark an account broken when the environment has no credentials', async () => {
    /**
     * The failure this exists to prevent: the worker had no X_CLIENT_ID, and a
     * naive implementation would have recorded a refresh failure and told the
     * operator to reconnect a perfectly healthy account.
     */
    const { query, writes } = stubQuery([account()]);
    const out = await refreshDueTokens({ query, env: {} as NodeJS.ProcessEnv });

    expect(out.skippedNoCredentials).toBe(1);
    expect(out.failed).toBe(0);
    expect(writes.filter((w) => w.sql.includes("capability_state = 'error'"))).toHaveLength(0);
  });
});

describe('when a refresh fails', () => {
  it('marks the account for reconnection and raises a critical notification', async () => {
    const { query, writes } = stubQuery([account()]);
    const { getAdapter } = await import('../adapters/index.js');
    const spy = vi
      .spyOn(getAdapter('x'), 'refresh')
      .mockRejectedValue(new Error('invalid_grant'));

    const out = await refreshDueTokens({ query, env: CREDS });

    expect(out.failed).toBe(1);
    const errored = writes.find((w) => w.sql.includes("capability_state = 'error'"));
    expect(errored).toBeDefined();
    expect(String(errored!.params![1])).toContain('invalid_grant');

    const notified = writes.find((w) => w.sql.includes('into notifications'));
    expect(notified).toBeDefined();
    expect(String(notified!.params![1])).toContain('Reconnect');

    spy.mockRestore();
  });

  it('never logs or leaks the token in the recorded error', async () => {
    const { query, writes } = stubQuery([account()]);
    const { getAdapter } = await import('../adapters/index.js');
    const spy = vi.spyOn(getAdapter('x'), 'refresh').mockRejectedValue(new Error('boom'));

    await refreshDueTokens({ query, env: CREDS });
    const recorded = JSON.stringify(writes);
    expect(recorded).not.toContain('access-abc');
    expect(recorded).not.toContain('refresh-abc');

    spy.mockRestore();
  });
});

describe('when a refresh succeeds', () => {
  it('persists the new access token and the rotated refresh token', async () => {
    const { query, writes } = stubQuery([account()]);
    const { getAdapter } = await import('../adapters/index.js');
    const spy = vi.spyOn(getAdapter('x'), 'refresh').mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt: new Date(Date.now() + 2 * 60 * 60_000),
    });

    const out = await refreshDueTokens({ query, env: CREDS });
    expect(out.refreshed).toBe(1);

    const update = writes.find((w) => w.sql.includes('set access_token_enc'));
    expect(update).toBeDefined();
    // Sealed, never plaintext.
    expect(Buffer.isBuffer(update!.params![1])).toBe(true);
    expect(String(update!.params![1])).not.toContain('new-access');

    spy.mockRestore();
  });

  it('keeps the existing refresh token when the provider returns none', async () => {
    /**
     * X rotates the refresh token on each use, but a provider that omits it
     * must not cost us the only route back — dropping it would strand the
     * account permanently.
     */
    const existing = sealToken('refresh-abc');
    const { query, writes } = stubQuery([account({ refresh_token_enc: existing })]);
    const { getAdapter } = await import('../adapters/index.js');
    const spy = vi.spyOn(getAdapter('x'), 'refresh').mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: null,
      expiresAt: new Date(Date.now() + 2 * 60 * 60_000),
    });

    await refreshDueTokens({ query, env: CREDS });
    const update = writes.find((w) => w.sql.includes('set access_token_enc'));
    expect(update!.params![2]).toBe(existing);

    spy.mockRestore();
  });
});
