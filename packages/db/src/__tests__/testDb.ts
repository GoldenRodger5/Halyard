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
export async function createIsolatedPool(suffix: string, max = 12): Promise<pg.Pool> {
  const base = new URL(TEST_DATABASE_URL);
  const dbName = `halyard_t_${suffix.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`;

  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.query(`create database ${dbName}`);
  await admin.end();

  base.pathname = `/${dbName}`;
  const pool = new pg.Pool({ connectionString: base.toString(), max });
  await migrateInto(pool);
  return pool;
}

async function migrateInto(pool: pg.Pool): Promise<void> {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await pool.query(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }
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
