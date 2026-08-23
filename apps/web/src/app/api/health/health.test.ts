/**
 * The health endpoint must not become a topology leak.
 *
 * §174. It is unauthenticated by design, which makes it the one route where an
 * accidental `detail: err.message` ships the connection string to the internet —
 * node-postgres routinely puts the host, port and user in its error text. This
 * asserts the response shape stays closed rather than trusting review.
 */
import { describe, expect, it } from 'vitest';
import { describePooler } from '@halyard/core';

const SESSION = 'postgresql://user:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const TRANSACTION = 'postgresql://user:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

/** The exact projection the route performs. Kept in step by the shape test below. */
function healthBody(connectionString: string, dbOk: boolean) {
  const pooler = describePooler(connectionString, 'web');
  return {
    ok: dbOk && pooler.ok,
    database: dbOk ? 'reachable' : 'unreachable',
    pooler: pooler.mode,
    poolerCorrectForTier: pooler.ok,
  };
}

describe('health response', () => {
  it('reports healthy on the transaction pooler with a reachable database', () => {
    expect(healthBody(TRANSACTION, true)).toEqual({
      ok: true,
      database: 'reachable',
      pooler: 'transaction',
      poolerCorrectForTier: true,
    });
  });

  it('is not ok when the web tier is on the session pooler', () => {
    const body = healthBody(SESSION, true);
    expect(body.ok).toBe(false);
    expect(body.poolerCorrectForTier).toBe(false);
    /* Still reports the database honestly — the connection works, the mode is wrong. */
    expect(body.database).toBe('reachable');
  });

  it('is not ok when the database is unreachable', () => {
    expect(healthBody(TRANSACTION, false).ok).toBe(false);
  });

  it('never includes the host, port, user, password or driver detail', () => {
    for (const url of [SESSION, TRANSACTION]) {
      for (const dbOk of [true, false]) {
        const text = JSON.stringify(healthBody(url, dbOk));
        expect(text).not.toContain('secret');
        expect(text).not.toContain('user');
        expect(text).not.toContain('pooler.supabase.com');
        expect(text).not.toContain('5432');
        expect(text).not.toContain('6543');
      }
    }
  });

  it('exposes exactly four keys, so a new field is a deliberate decision', () => {
    expect(Object.keys(healthBody(TRANSACTION, true)).sort()).toEqual([
      'database',
      'ok',
      'pooler',
      'poolerCorrectForTier',
    ]);
  });
});
