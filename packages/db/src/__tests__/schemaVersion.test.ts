/**
 * §566. The schema version marker cannot go stale without this failing.
 *
 * `schema_version` is only worth reading if it names the newest migration that
 * actually ran. Nothing about applying a migration updates it automatically, so
 * the marker decays the moment somebody adds `0083_*.sql` and forgets — and a
 * release check comparing a stale marker is worse than no check, because it
 * reports agreement it did not verify.
 *
 * So the test reads the migrations directory, applies every file to a real
 * database, and insists the row matches the highest-numbered file on disk. Add
 * a migration without stamping it and this goes red with the reason.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXPECTED_SCHEMA_VERSION } from '../index.js';
import { createIsolatedPool, databaseAvailable } from './testDb.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/** The four-digit prefix every migration file carries. */
function versionOf(file: string): string {
  const match = /^(\d{4})_/.exec(file);
  if (!match) throw new Error(`Migration ${file} does not start with a four-digit version.`);
  return match[1]!;
}

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

d('schema_version', () => {
  beforeAll(async () => {
    pool = await createIsolatedPool('schema_version');
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
  });

  it('names the newest migration on disk', async () => {
    const newest = versionOf(migrationFiles().at(-1)!);
    const { rows } = await pool.query<{ version: string }>('select version from schema_version');

    expect(rows).toHaveLength(1);
    expect(
      rows[0]!.version,
      `schema_version says '${rows[0]?.version}' but the newest migration on disk is ` +
        `'${newest}'. Every migration stamps its own version as its last statement — ` +
        "add `insert into schema_version (id, version, applied_at) values (true, '" +
        newest +
        "', now()) on conflict (id) do update set version = excluded.version, " +
        'applied_at = excluded.applied_at;` to it. §566.',
    ).toBe(newest);
  });

  it('holds exactly one row, so there is one answer to which schema this is', async () => {
    const { rows } = await pool.query<{ n: string }>('select count(*)::text as n from schema_version');
    expect(rows[0]!.n).toBe('1');
  });
});

describe('the migration files themselves', () => {
  it('are numbered without gaps or duplicates, so the newest is unambiguous', () => {
    const versions = migrationFiles().map(versionOf);
    expect(new Set(versions).size, 'two migrations share a number').toBe(versions.length);

    const numbers = versions.map(Number);
    for (let i = 1; i < numbers.length; i += 1) {
      expect(
        numbers[i],
        `migration numbering jumps from ${versions[i - 1]} to ${versions[i]}`,
      ).toBe(numbers[i - 1]! + 1);
    }
  });

  it('agrees with EXPECTED_SCHEMA_VERSION, which is what production compares against', () => {
    const newest = versionOf(migrationFiles().at(-1)!);
    expect(
      EXPECTED_SCHEMA_VERSION,
      `EXPECTED_SCHEMA_VERSION in packages/db is '${EXPECTED_SCHEMA_VERSION}' but the ` +
        `newest migration on disk is '${newest}'. The System surface compares that ` +
        'constant against the database, and a stale constant reports agreement it ' +
        'did not verify. §566.',
    ).toBe(newest);
  });

  it('stamps the schema version in the newest migration', () => {
    const newest = migrationFiles().at(-1)!;
    const sql = readFileSync(path.join(MIGRATIONS, newest), 'utf8');
    expect(
      /insert\s+into\s+schema_version/i.test(sql),
      `${newest} is the newest migration and does not stamp schema_version, so the ` +
        'release marker would silently describe an older schema. §566.',
    ).toBe(true);
  });
});
