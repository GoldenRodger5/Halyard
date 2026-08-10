/**
 * Server-side data access.
 *
 * Queries go through a direct Postgres pool rather than PostgREST. Halyard's web
 * tier is entirely server-rendered and single-operator, so the browser never
 * holds a database credential and there is no client-side query surface to
 * secure. RLS (migration 0010) still guards PostgREST, which is what a leaked
 * anon key would reach — see docs/DECISIONS.md.
 *
 * `import 'server-only'` is the guard that keeps this out of a client bundle.
 */
import 'server-only';
import pg from 'pg';

declare global {
  var __halyardPool: pg.Pool | undefined;
}

export function pool(): pg.Pool {
  if (!globalThis.__halyardPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set. Copy .env.example to apps/web/.env.local and point it at your database.',
      );
    }
    globalThis.__halyardPool = new pg.Pool({
      connectionString,
      max: 5,
      application_name: 'halyard-web',
    });
  }
  return globalThis.__halyardPool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool().query<T>(text, params);
  return result.rows;
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Whether the app can reach its database at all. Every page calls this so a
 * missing DATABASE_URL renders an explanation rather than a stack trace.
 */
export async function databaseReachable(): Promise<{ ok: boolean; detail?: string }> {
  try {
    await query('select 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}
