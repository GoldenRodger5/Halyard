/**
 * The worker's token refresh, against a real Postgres.
 *
 * This exists because the handler previously *reported* which accounts were due
 * and refreshed nothing, deferring to a web cron scheduled once a day against
 * tokens that live two hours. Nothing caught it, because nothing asserted the
 * handler had an effect.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdapter, sealToken } from '@halyard/core';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { HANDLERS } from './handlers/index.js';
import type { HandlerContext, Job } from './poller.js';

// The same fixed test key the other suites use; sealing needs one present.
process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
const logs: Array<{ message: string; detail?: Record<string, unknown> }> = [];

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('tokenrefresh', 4);
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
  logs.length = 0;
  await pool.query('delete from notifications');
  await pool.query(`delete from social_accounts where handle = '@refreshtest'`);
});

function ctx(): HandlerContext {
  return {
    pool,
    workerId: 'test',
    log: (message: string, detail?: Record<string, unknown>) => logs.push({ message, detail }),
    enqueue: async () => undefined,
  } as unknown as HandlerContext;
}

const job = { id: 'job-1', kind: 'refresh_tokens', payload: {} } as unknown as Job;

async function seedAccount(minutesToExpiry: number): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into social_accounts
       (product_id, platform, persona, handle, capability_state,
        access_token_enc, refresh_token_enc, token_expires_at, identity_confirmed_at)
     values ('recipefix','x','brand','@refreshtest','live',$1,$2, now() + ($3 || ' minutes')::interval, now())
     returning id`,
    [sealToken('access-live'), sealToken('refresh-live'), String(minutesToExpiry)],
  );
  return rows[0]!.id;
}

d('the worker refresh handler', () => {
  it('is registered for the scheduled job kind', () => {
    // The scheduler enqueues `refresh_tokens` hourly; without a handler that
    // does something, the job succeeds and nothing happens.
    expect(HANDLERS.refresh_tokens).toBeDefined();
  });

  it('refreshes a token that is close to expiring, and persists it sealed', async () => {
    const id = await seedAccount(10);
    process.env.X_CLIENT_ID = 'test-id';
    process.env.X_CLIENT_SECRET = 'test-secret';

    const spy = vi.spyOn(getAdapter('x'), 'refresh').mockResolvedValue({
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
      expiresAt: new Date(Date.now() + 2 * 60 * 60_000),
    });

    await HANDLERS.refresh_tokens!(job, ctx());

    const { rows } = await pool.query<{ enc: Buffer; expires: Date; state: string }>(
      'select access_token_enc as enc, token_expires_at as expires, capability_state as state from social_accounts where id = $1',
      [id],
    );
    // Stored sealed, never as plaintext.
    expect(rows[0]!.enc.toString('utf8')).not.toContain('rotated-access');
    expect(new Date(rows[0]!.expires).getTime()).toBeGreaterThan(Date.now() + 60 * 60_000);
    expect(rows[0]!.state).toBe('live');

    spy.mockRestore();
  });

  it('leaves an account alone when its token is nowhere near expiry', async () => {
    await seedAccount(48 * 60);
    const spy = vi.spyOn(getAdapter('x'), 'refresh');

    await HANDLERS.refresh_tokens!(job, ctx());

    // No provider call at all: the hourly pass must be nearly free.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('marks the account for reconnection when the refresh is rejected', async () => {
    const id = await seedAccount(10);
    process.env.X_CLIENT_ID = 'test-id';
    process.env.X_CLIENT_SECRET = 'test-secret';
    const spy = vi
      .spyOn(getAdapter('x'), 'refresh')
      .mockRejectedValue(new Error('invalid_grant'));

    await HANDLERS.refresh_tokens!(job, ctx());

    const { rows } = await pool.query<{ state: string; err: string }>(
      'select capability_state as state, last_error as err from social_accounts where id = $1',
      [id],
    );
    expect(rows[0]!.state).toBe('error');
    expect(rows[0]!.err).toContain('invalid_grant');

    const notes = await pool.query<{ n: string }>(
      `select count(*) as n from notifications where kind = 'auth_failure'`,
    );
    expect(Number(notes.rows[0]!.n)).toBe(1);
    spy.mockRestore();
  });

  it('says so loudly when the worker has no client credentials', async () => {
    /**
     * The exact production gap: the worker had no X_CLIENT_ID, so every account
     * would be skipped and the pass would look like a clean no-op right up
     * until the tokens expired.
     */
    await seedAccount(10);
    const saved = [process.env.X_CLIENT_ID, process.env.X_CLIENT_SECRET];
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;

    const spy = vi.spyOn(getAdapter('x'), 'refresh');
    await HANDLERS.refresh_tokens!(job, ctx());

    expect(spy).not.toHaveBeenCalled();
    const warned = logs.find((l) => l.message.includes('want of client credentials'));
    expect(warned).toBeDefined();
    expect(warned!.detail!.accounts).toBe(1);

    // And crucially: a missing credential is not an account fault.
    const { rows } = await pool.query<{ state: string }>(
      `select capability_state as state from social_accounts where handle = '@refreshtest'`,
    );
    expect(rows[0]!.state).toBe('live');

    spy.mockRestore();
    [process.env.X_CLIENT_ID, process.env.X_CLIENT_SECRET] = saved as [string, string];
  });
});
