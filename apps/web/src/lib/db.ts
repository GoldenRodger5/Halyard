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
    /*
     * §172. Sized for serverless, not for a long-lived server.
     *
     * Production failed with `(EMAXCONNSESSION) max clients reached in session
     * mode`. Every Vercel lambda instance builds its own pool, so the ceiling
     * is `max × concurrent instances` — at `max: 5` a handful of simultaneous
     * requests exhausts Supabase's session-mode client limit and the whole app
     * reports "Halyard cannot reach its database".
     *
     * Two connections is the right number for a request-scoped runtime: the
     * page renders, its queries run, the instance freezes. A short idle timeout
     * hands the connection back rather than holding it across the freeze, and
     * `allowExitOnIdle` lets an instance shut down instead of being kept alive
     * by an open socket.
     *
     * This is mitigation, not the cure. The cure is the **transaction** pooler
     * (port 6543), which multiplexes and is what Supabase documents for
     * serverless — see `docs/PLATFORM_COVERAGE.md` §18. The web tier is safe to
     * move there: it holds no advisory locks, issues no `SET`, and runs no
     * multi-statement transactions. The **worker must stay on session mode**,
     * because §165's correction claim is a session-scoped advisory lock.
     */
    globalThis.__halyardPool = new pg.Pool({
      connectionString,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: true,
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
