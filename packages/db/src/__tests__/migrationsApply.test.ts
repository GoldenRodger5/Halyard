/**
 * §379. The migrations apply to an empty database.
 *
 * This is the guard for the failure that hid 445 tests for a day. Migrations
 * 0061 and 0063 inserted rows referencing a product that only exists after
 * `seed.sql`, so they failed on a clean database — and because every
 * database-backed suite guards on `databaseAvailable()`, which was still true,
 * the whole thing surfaced as *skipped* rather than as *failed*.
 *
 * A test file that cannot build its database skips. A test that asserts the
 * database can be built fails. That is the entire difference, and it is why
 * this file exists separately rather than being folded into `schema.test.ts` —
 * which is itself one of the suites that goes dark when this breaks.
 */
import { afterAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createIsolatedPool, databaseAvailable, applySeed } from './testDb.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool | undefined;

afterAll(async () => {
  await pool?.end();
});

d('the migration set', () => {
  it('applies to an empty database, in order, without a seed', async () => {
    /*
     * The whole assertion is that this does not throw. `createIsolatedPool`
     * drops and recreates a database and replays every migration into it, so
     * an ordering mistake, a missing dependency or a foreign key onto seed data
     * fails here and names the file.
     */
    pool = await createIsolatedPool('migrations_apply', 2);
    const { rows } = await pool.query<{ n: string }>(
      "select count(*)::text as n from information_schema.tables where table_schema = 'public'",
    );
    expect(Number(rows[0]!.n)).toBeGreaterThan(50);
  }, 180_000);

  it('accepts the seed on top of them', async () => {
    /*
     * The other half. A seed that no longer matches the schema is the same
     * class of fault seen from the other side, and it is equally invisible
     * when the suite that would catch it cannot start.
     */
    if (!pool) throw new Error('the migration test must run first');
    await applySeed(pool);
    const { rows } = await pool.query<{ n: string }>(
      "select count(*)::text as n from products",
    );
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);
  }, 120_000);
});
