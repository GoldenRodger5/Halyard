/**
 * `PlatformId` and `social_accounts_platform_check` are the same list written
 * twice, and only this can catch them disagreeing.
 *
 * The same trap as `JOB_KINDS` versus `jobs_kind_check` — gotcha 1 in
 * `CLAUDE.md`, which cost three migrations. It had already sprung here without
 * anyone noticing: `packages/db` exported a third copy listing six platforms
 * while the type and the constraint both listed seven, `bluesky` being the one
 * it dropped. That copy is gone; this is what replaces it.
 *
 * Adding a platform to the type without a migration typechecks cleanly and
 * fails on the first insert. Adding one to the database without the type means
 * no adapter can address it. Neither is visible from the other side.
 *
 * It lives in `apps/worker` for the same reason `handlerCoverage.test.ts` does:
 * it needs both the adapters and the schema, and `packages/db` must not import
 * `packages/core` — that is the dependency the other way round.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allAdapters } from '@halyard/core';
import {
  createIsolatedPool,
  databaseAvailable,
} from '../../../packages/db/src/__tests__/testDb.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('platformparity', 2);
}, 180_000);

afterAll(async () => {
  if (available) await pool.end();
});

/** The platforms the database will actually accept, read from the constraint. */
async function constraintPlatforms(): Promise<string[]> {
  const { rows } = await pool.query<{ def: string }>(
    `select pg_get_constraintdef(oid) as def
       from pg_constraint where conname = 'social_accounts_platform_check'`,
  );
  expect(rows).toHaveLength(1);
  return [...rows[0]!.def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]!).sort();
}

d('the platform list, in both places it exists', () => {
  it('reads a non-empty constraint, so an empty match cannot pass', async () => {
    // The failure mode of this file: `pg_get_constraintdef` changes shape, the
    // regex matches nothing, and two empty lists compare equal.
    const platforms = await constraintPlatforms();
    expect(platforms.length).toBeGreaterThanOrEqual(6);
    expect(platforms).toContain('x');
  });

  it('accepts exactly the platforms that have adapters', async () => {
    const adapters = allAdapters()
      .map((a): string => a.platform)
      .sort();
    expect(await constraintPlatforms()).toEqual(adapters);
  });

  it('really does reject a platform outside the list', async () => {
    /**
     * Not a restatement of the constraint text — an actual insert. A constraint
     * that parses correctly and is not enforced would satisfy the comparison
     * above and nothing else.
     */
    await pool.query(
      `insert into products (id, name, connector_type) values ('parity','Parity','none')
       on conflict (id) do nothing`,
    );
    await expect(
      pool.query(
        `insert into social_accounts (product_id, platform, persona, handle)
         values ('parity','mastodon','brand','@nope')`,
      ),
    ).rejects.toThrow(/social_accounts_platform_check|violates check constraint/i);
  });

  it('accepts every platform that has an adapter', async () => {
    // The other direction: a type entry the database refuses is just as broken,
    // and it is the direction gotcha 1 actually failed in.
    await pool.query(
      `insert into products (id, name, connector_type) values ('parity','Parity','none')
       on conflict (id) do nothing`,
    );
    for (const adapter of allAdapters()) {
      await expect(
        pool.query(
          `insert into social_accounts (product_id, platform, persona, handle)
           values ('parity', $1, 'brand', $2)`,
          [adapter.platform, `@parity-${adapter.platform}`],
        ),
      ).resolves.toBeTruthy();
    }
  });
});
