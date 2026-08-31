/**
 * Integration-test harness. Applies the real migrations to a real Postgres and
 * hands back a pool. No mocks — the things being tested here (SKIP LOCKED,
 * unique indexes, RLS, generated columns) only exist in the database.
 *
 * Skips the suite rather than failing when no database is reachable, so a
 * checkout without Postgres still runs the pure unit tests.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://postgres@localhost:54322/postgres';

export async function databaseAvailable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL, connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

export async function migrateFresh(pool: pg.Pool): Promise<void> {
  await pool.query('drop schema if exists public cascade; create schema public;');
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await pool.query(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }
}

export function createPool(max = 12): pg.Pool {
  return new pg.Pool({ connectionString: TEST_DATABASE_URL, max });
}

/**
 * Give each test file its own database.
 *
 * Test files run in parallel, and two files applying migrations to one database
 * at the same time race on `create extension`. An isolated database per file is
 * cheaper than serialising the whole suite.
 */
/**
 * §395. The most connections one suite may hold.
 *
 * Forty-two suites ask for a pool and their declared sizes total **228
 * connections against a Postgres whose `max_connections` is 100**. It works
 * only because Vitest runs a bounded number of files at once — and under a full
 * parallel run enough of them overlap to exhaust the server, at which point
 * suites do not fail so much as *go quiet*: `databaseAvailable()` returns false
 * and they skip. Sixty-one tests went dark that way in one run, and a race
 * test failed because it could not open its second connection.
 *
 * A test suite runs its queries one after another. Two connections is enough
 * for any of them, and the handful that genuinely race need three. The number
 * belongs to the operation rather than to each caller — decision 73's rule,
 * applied to the other resource a suite consumes.
 *
 * §379's lesson underneath it: a suite that skips reports green.
 */
const MAX_CONNECTIONS_PER_SUITE = 4;

export async function createIsolatedPool(suffix: string, max = 12): Promise<pg.Pool> {
  const base = new URL(TEST_DATABASE_URL);
  const dbName = `halyard_t_${suffix.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`;

  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.query(`create database ${dbName}`);
  await admin.end();

  base.pathname = `/${dbName}`;
  const pool = new pg.Pool({
    connectionString: base.toString(),
    max: Math.min(max, MAX_CONNECTIONS_PER_SUITE),
  });
  await migrateInto(pool);
  return pool;
}

async function migrateInto(pool: pg.Pool): Promise<void> {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    try {
      await pool.query(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
    } catch (err) {
      /**
       * §379. Say which migration, and say what it means.
       *
       * Migrations 0061 and 0063 inserted rows referencing a product that does
       * not exist until `seed.sql` runs, so they failed on a clean database and
       * took this whole function down. Every caller guards on
       * `databaseAvailable()`, which was still true — the database was fine —
       * so the failure surfaced as *453 skipped tests* for a day. A skipped
       * test reports green.
       *
       * The error carried no file name, which is why it took a while to find.
       * It does now, and it says the thing worth knowing: a migration must
       * apply to an empty database, because that is the only kind CI has.
       */
      throw new Error(
        `Migration ${file} failed against a clean database: ${(err as Error).message}\n` +
          'A migration has to apply to an empty database — CI has no other kind. ' +
          'Product-scoped seed data belongs in supabase/seed.sql, which runs afterwards.',
        { cause: err },
      );
    }
  }
}

/**
 * Apply `supabase/seed.sql` on top of the migrations.
 *
 * The isolated harness deliberately does not do this by default — most schema
 * tests want an empty database — but the ordering between migrations and the
 * seed is itself a thing worth testing, because a product-scoped
 * `insert ... select from products` inside a migration silently matches nothing
 * on a fresh database.
 */
export async function applySeed(pool: pg.Pool): Promise<void> {
  const seed = path.join(ROOT, 'supabase/seed.sql');
  await pool.query(readFileSync(seed, 'utf8'));
}

/** Minimal fixture graph: product → account → content item. */
export async function seedMinimal(pool: pg.Pool): Promise<{
  productId: string;
  accountId: string;
  contentItemId: string;
}> {
  const productId = 'recipefix';
  await pool.query(
    `insert into products (id, name, connector_type) values ($1, 'RecipeFix', 'mcp')
     on conflict (id) do nothing`,
    [productId],
  );
  const account = await pool.query<{ id: string }>(
    `insert into social_accounts (product_id, platform, persona, handle, capability_state)
     values ($1, 'x', 'brand', '@recipefix', 'live')
     on conflict (product_id, platform, persona) do update set handle = excluded.handle
     returning id`,
    [productId],
  );
  const accountId = account.rows[0]!.id;
  const item = await pool.query<{ id: string }>(
    `insert into content_items (product_id, account_id, platform, persona, format, category, body, status)
     values ($1, $2, 'x', 'brand', 'text', 'education', 'Vinegar firms the crumb.', 'approved')
     returning id`,
    [productId, accountId],
  );
  return { productId, accountId, contentItemId: item.rows[0]!.id };
}
