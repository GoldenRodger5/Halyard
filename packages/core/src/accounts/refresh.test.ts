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

/**
 * A query stub that returns accounts once, then records every write.
 *
 * §531 added a lease: the refresher claims an account with a conditional
 * update before it touches the provider, and treats an empty result as "held
 * by someone else". So the stub has to answer that claim, and `leaseHeld`
 * models the other process winning it — which is the case the whole lease
 * exists for, and which had no test because the lease had no code.
 */
function stubQuery(rows: unknown[], leaseHeld = false) {
  const writes: Array<{ sql: string; params?: unknown[] }> = [];
  let served = false;
  const query: RefreshQuery = vi.fn(async <T,>(sql: string, params?: unknown[]): Promise<T[]> => {
    if (!served && sql.includes('from social_accounts')) {
      served = true;
      return rows as T[];
    }
    if (sql.includes('refresh_locked_at = now()')) {
      writes.push({ sql, params });
      return (leaseHeld ? [] : [{ id: 'acc-1' }]) as T[];
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
    // Idempotence: a pass costs one read and no provider calls. The lease is
    // claimed *after* the due check, so a quiet run does not write either.
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
  /*
   * §531. This test used to assert the defect.
   *
   * It required the first failure to set `capability_state = 'error'` and raise
   * a critical notification — and the select in `refreshDueTokens` filtered on
   * `capability_state in ('live','draft_only')`, so that first failure removed
   * the account from every future refresh. @Recipe_Fix sat in `error` for ten
   * days holding a refresh token good for six months, and the only way out was
   * a person pressing Reconnect. The test passed the whole time, because it was
   * checking that the door closed.
   */
  it('backs off and keeps trying, rather than marking the account broken', async () => {
    const { query, writes } = stubQuery([account()]);
    const { getAdapter } = await import('../adapters/index.js');
    const spy = vi
      .spyOn(getAdapter('x'), 'refresh')
      .mockRejectedValue(new Error('Value passed for the token was invalid.'));

    const out = await refreshDueTokens({ query, env: CREDS });

    expect(out.failed).toBe(1);
    expect(out.needsReconnect ?? 0).toBe(0);

    const update = writes.find((w) => w.sql.includes('refresh_failures = $3'));
    expect(update).toBeDefined();
    expect(String(update!.params![1])).toContain('Value passed for the token was invalid');
    expect(update!.params![2], 'first failure of six').toBe(1);
    /* Still tried again, and soon. */
    expect(update!.params![3]).toBe(5);
    expect(update!.sql, 'one blip must not close the door').not.toContain("capability_state = 'error'");

    /* And nobody is woken for a failure the machine is about to retry. */
    expect(writes.find((w) => w.sql.includes('into notifications'))).toBeUndefined();

    spy.mockRestore();
  });

  it('asks for a person only after the retries are spent', async () => {
    const { query, writes } = stubQuery([account({ refresh_failures: 5 })]);
    const { getAdapter } = await import('../adapters/index.js');
    const spy = vi.spyOn(getAdapter('x'), 'refresh').mockRejectedValue(new Error('invalid_grant'));

    const out = await refreshDueTokens({ query, env: CREDS });

    expect(out.needsReconnect).toBe(1);
    const update = writes.find((w) => w.sql.includes('refresh_failures = $3'));
    expect(update!.sql).toContain("capability_state = 'error'");

    const notified = writes.find((w) => w.sql.includes('into notifications'));
    expect(notified).toBeDefined();
    expect(String(notified!.params![1])).toContain('reconnect it');
    /* Even now it keeps trying, so a provider that recovers needs nobody. */
    expect(String(notified!.params![1])).toContain('Retries continue');

    spy.mockRestore();
  });

  it('does not call the provider when another process holds the lease', async () => {
    /*
     * §531. The race this exists to stop. X's refresh token is single use: the
     * second caller presents one the first has already rotated away, X answers
     * "Value passed for the token was invalid", and the chain is dead. Three
     * things called this function with no coordination — the worker schedule,
     * the web tier's cron backstop, and routinely a second worker.
     */
    const { query, writes } = stubQuery([account()], true);
    const { getAdapter } = await import('../adapters/index.js');
    const spy = vi.spyOn(getAdapter('x'), 'refresh').mockResolvedValue({
      accessToken: 'should-never-be-requested',
      refreshToken: 'nor-this',
      expiresAt: new Date(),
    });

    const out = await refreshDueTokens({ query, env: CREDS });

    expect(spy, 'a second refresher must not touch the token endpoint').not.toHaveBeenCalled();
    expect(out.skippedLocked).toBe(1);
    expect(out.refreshed).toBe(0);
    expect(writes.find((w) => w.sql.includes('set access_token_enc'))).toBeUndefined();

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

/**
 * §532. Only one environment may own an account's tokens.
 *
 * X keeps a single token chain per (user, developer app). @Recipe_Fix is
 * authorised in the local development database and in production through the
 * same `X_CLIENT_ID`, so a refresh in either rotates the chain and kills the
 * other's stored refresh token. Whichever ran last wins; the loser is told to
 * reconnect. The lease in §531 cannot help — the two refreshers are in
 * different databases and cannot see each other.
 */
describe('§532 an environment that does not own the tokens', () => {
  it('makes no query and no provider call when refresh is switched off', async () => {
    const { query } = stubQuery([account()]);
    const out = await refreshDueTokens({
      query,
      env: { ...CREDS, HALYARD_TOKEN_REFRESH: 'off' } as NodeJS.ProcessEnv,
    });

    expect(out.disabled).toBe(true);
    expect(out.refreshed).toBe(0);
    /* Not even the read: a disabled environment costs nothing. */
    expect(vi.mocked(query)).not.toHaveBeenCalled();
  });

  it('defaults to on, so production and a fresh clone are unchanged', async () => {
    const { query } = stubQuery([account({ token_expires_at: later() })]);
    const out = await refreshDueTokens({ query, env: CREDS });
    expect(out.disabled).toBeUndefined();
    expect(vi.mocked(query)).toHaveBeenCalled();
  });

  it('is not switched off by an unrelated value', async () => {
    const { query } = stubQuery([account({ token_expires_at: later() })]);
    const out = await refreshDueTokens({
      query,
      env: { ...CREDS, HALYARD_TOKEN_REFRESH: 'on' } as NodeJS.ProcessEnv,
    });
    expect(out.disabled).toBeUndefined();
    expect(vi.mocked(query)).toHaveBeenCalled();
  });
});
