/**
 * Which Supabase pooler a connection string points at, and whether that is safe.
 *
 * §173. The two tiers need *different* poolers, and getting it wrong fails in two
 * very different ways:
 *
 *   - **Web on session mode (5432)** fails loudly. Each serverless instance holds
 *     its own Postgres connection, the ceiling is `max × concurrent instances`,
 *     and production reported `(EMAXCONNSESSION) max clients reached in session
 *     mode`. Bad, but it announces itself.
 *
 *   - **Worker on transaction mode (6543)** fails *silently*, which is worse.
 *     §165's correction claim is `pg_try_advisory_lock`, which is scoped to a
 *     session. Behind a transaction pooler each statement may land on a different
 *     backend, so the lock is taken and released around a single statement and
 *     guards nothing. The claim would return `true` to two workers at once and the
 *     only symptom would be duplicated correction spend.
 *
 * A silent correctness failure is worth refusing to start over, which is what
 * `assertPoolerFor` does for the worker.
 */
export type PoolerMode = 'session' | 'transaction' | 'direct' | 'unknown';

export type PoolerInfo = {
  mode: PoolerMode;
  host: string | null;
  port: number | null;
  /** True when this mode is correct for the given tier. */
  ok: boolean;
  /** Operator-facing explanation. Never contains credentials. */
  detail: string;
};

const SUPABASE_POOLER = /pooler\.supabase\.com$/i;

/** Classify without ever retaining the user or password. */
export function describePooler(
  connectionString: string | undefined,
  tier: 'web' | 'worker',
): PoolerInfo {
  if (!connectionString || connectionString.trim().length === 0) {
    return { mode: 'unknown', host: null, port: null, ok: false, detail: 'DATABASE_URL is not set.' };
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return {
      mode: 'unknown',
      host: null,
      port: null,
      ok: false,
      detail: 'DATABASE_URL could not be parsed as a URL.',
    };
  }

  const host = url.hostname;
  const port = url.port ? Number(url.port) : 5432;
  const pooled = SUPABASE_POOLER.test(host);

  const mode: PoolerMode = !pooled
    ? 'direct'
    : port === 6543
      ? 'transaction'
      : port === 5432
        ? 'session'
        : 'unknown';

  if (tier === 'worker') {
    /*
     * The worker needs a session. Transaction mode is the dangerous one; a direct
     * connection is also a real session and is fine.
     */
    const ok = mode === 'session' || mode === 'direct';
    return {
      mode,
      host,
      port,
      ok,
      detail: ok
        ? `Session-scoped connection (${mode}), which the correction claim requires.`
        : `The worker is on the ${mode} pooler (port ${port}). ` +
          'Advisory locks are session-scoped and do not hold behind a transaction pooler, ' +
          'so the correction claim would guard nothing. Use port 5432.',
    };
  }

  /*
   * The web tier prefers transaction mode but works on either — session mode is
   * survivable with a small pool, so this reports rather than refuses.
   */
  const ok = mode === 'transaction' || mode === 'direct';
  return {
    mode,
    host,
    port,
    ok,
    detail: ok
      ? `Transaction-mode pooling (${mode}), which is what serverless wants.`
      : `The web tier is on the ${mode} pooler (port ${port}). ` +
        'Each serverless instance holds its own connection, so concurrent instances ' +
        'can exhaust the session-mode client limit (EMAXCONNSESSION). Use port 6543.',
  };
}

/** Refuse to start rather than run a lock that silently guards nothing. */
export function assertPoolerFor(connectionString: string | undefined, tier: 'worker'): PoolerInfo {
  const info = describePooler(connectionString, tier);
  if (!info.ok && info.mode === 'transaction') {
    throw new Error(
      `Refusing to start: ${info.detail} ` +
        'This is a correctness failure, not a performance one — see docs/DECISIONS.md §173.',
    );
  }
  return info;
}
