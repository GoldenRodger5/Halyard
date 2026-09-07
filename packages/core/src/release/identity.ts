/**
 * §567. What code is this, and does it match everything else that is running?
 *
 * Halyard has been deployed as two independently-released components against
 * one database since the first Railway push, and until now neither could say
 * what it was. The worker wrote a commit SHA into its heartbeat (§243) and
 * nothing read it; the web tier wrote nothing at all. So the two questions an
 * operator actually asks when a feature misbehaves — *is the deployed worker
 * running this code?* and *is the database the shape this code expects?* — were
 * answerable only by reading a Railway dashboard next to a Vercel dashboard
 * next to `psql`.
 *
 * §243 already found the failure this prevents: a worker deployed before three
 * handlers existed left those jobs `pending` forever, with no error and no
 * failed job, and the features looked broken for reasons nothing explained.
 *
 * This module is deliberately product-neutral and dependency-free — it reads
 * the environment and returns a value. The web tier, the worker and the
 * Auditor all use the same one so that "commit" means the same thing in three
 * places, and a comparison between them is meaningful rather than a comparison
 * of two different conventions.
 */

/** Where a component believes it is running. */
export type DeploymentEnvironment = 'production' | 'preview' | 'development' | 'test' | 'unknown';

export interface ReleaseIdentity {
  /** Short commit SHA, or `null` when nothing in the environment says. */
  commit: string | null;
  /** ISO timestamp of the build, or `null` when the platform does not record one. */
  builtAt: string | null;
  environment: DeploymentEnvironment;
  /** Which platform's variables answered — useful when the answer is surprising. */
  source: string;
}

/**
 * Twelve characters: long enough to be unambiguous in this repository, short
 * enough to read on a status line. The full SHA is always a click away in the
 * platform that produced it.
 */
const SHA_LENGTH = 12;

function shorten(sha: string | undefined): string | null {
  const trimmed = sha?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, SHA_LENGTH);
}

/*
 * `next.config.ts` bakes `HALYARD_RELEASE` as the literal string `unknown` when
 * Vercel supplied no SHA, so "unknown" is an absent value wearing a value's
 * clothes. Reporting it as a commit would make the status page confidently
 * wrong, which is worse than blank.
 */
const NOT_A_VALUE = new Set(['unknown', 'none', 'null', 'undefined']);

function firstNonEmpty(env: NodeJS.ProcessEnv, keys: string[]): [string, string] | null {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value && !NOT_A_VALUE.has(value.toLowerCase())) return [key, value];
  }
  return null;
}

/**
 * Normalise the several names the platforms use for the same three states.
 *
 * Vercel says `production` / `preview` / `development`; Railway says the
 * environment's own name, which is whatever somebody typed. `unknown` is the
 * honest answer for an unrecognised one — guessing `production` would make the
 * riskiest state the default.
 */
function readEnvironment(env: NodeJS.ProcessEnv): DeploymentEnvironment {
  const explicit = env.HALYARD_ENV?.trim().toLowerCase();
  const vercel = env.VERCEL_ENV?.trim().toLowerCase();
  const railway = env.RAILWAY_ENVIRONMENT_NAME?.trim().toLowerCase();
  const node = env.NODE_ENV?.trim().toLowerCase();

  for (const candidate of [explicit, vercel, railway]) {
    if (candidate === 'production' || candidate === 'prod') return 'production';
    if (candidate === 'preview' || candidate === 'staging') return 'preview';
    if (candidate === 'development' || candidate === 'dev' || candidate === 'local') {
      return 'development';
    }
    if (candidate === 'test') return 'test';
  }

  if (node === 'test') return 'test';
  if (node === 'production') {
    /*
     * `NODE_ENV=production` is set by every production *build*, including one
     * running on a laptop, so on its own it does not mean the production
     * deployment. It is the weakest signal here and deliberately last.
     */
    return 'production';
  }
  if (node === 'development') return 'development';
  return 'unknown';
}

/**
 * The identity of the currently-running component.
 *
 * `env` is injectable so this is testable without mutating the real process —
 * the guard §565 installs makes accidental environment reads expensive to
 * debug, and a pure function has no such problem.
 */
export function releaseIdentity(env: NodeJS.ProcessEnv = process.env): ReleaseIdentity {
  /*
   * `HALYARD_RELEASE` and `HALYARD_BUILT_AT` first, because `next.config.ts`
   * has baked those two at build time since §174 and inventing a second pair of
   * names for the same fact is the mistake this repository keeps paying for
   * (gotcha 1). Everything after them is the platform's own variable, for the
   * worker, which has no Next build to bake anything.
   */
  const commitHit = firstNonEmpty(env, [
    'HALYARD_RELEASE',
    'RAILWAY_GIT_COMMIT_SHA',
    'VERCEL_GIT_COMMIT_SHA',
    'GIT_COMMIT_SHA',
    'GITHUB_SHA',
  ]);

  const builtHit = firstNonEmpty(env, ['HALYARD_BUILT_AT', 'RAILWAY_DEPLOYMENT_CREATED_AT']);

  return {
    commit: shorten(commitHit?.[1]),
    builtAt: normaliseTimestamp(builtHit?.[1]),
    environment: readEnvironment(env),
    source: commitHit?.[0] ?? 'none',
  };
}

/**
 * A build timestamp is only useful if it is comparable, so anything that is not
 * a real date becomes `null` rather than a string that renders as
 * "Invalid Date" on the status page.
 */
function normaliseTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const asNumber = Number(value);
  const date = Number.isFinite(asNumber) && value.trim() !== '' ? new Date(asNumber) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// ── Compatibility ─────────────────────────────────────────────────────────

export type CompatibilityState = 'ok' | 'warn' | 'fail' | 'unknown';

export interface CompatibilityFinding {
  state: CompatibilityState;
  /** What was actually measured, so the verdict is arguable rather than asserted. */
  detail: string;
}

/**
 * Do the web tier and the worker agree about which commit is deployed?
 *
 * A mismatch is `warn`, not `fail`: a deploy in flight looks exactly like this
 * for a minute or two, and a status page that screams during every normal
 * release teaches the operator to ignore it. What makes a mismatch actionable
 * is the *job kinds* check below, which says whether the disagreement has
 * consequences.
 */
export function compareRevisions(
  web: string | null,
  worker: string | null,
): CompatibilityFinding {
  if (!web || !worker) {
    return {
      state: 'unknown',
      detail:
        !web && !worker
          ? 'neither the web tier nor the worker reports a commit'
          : `only the ${web ? 'web tier' : 'worker'} reports a commit`,
    };
  }
  if (web === worker) return { state: 'ok', detail: `both on ${web}` };
  return { state: 'warn', detail: `web is on ${web}, the worker is on ${worker}` };
}

/**
 * Is the database the shape this checkout expects?
 *
 * `expected` is the newest migration in the deployed checkout; `actual` is what
 * the database stamped when it was last migrated. A database *behind* the code
 * is a `fail` — the code will reference columns that do not exist. A database
 * *ahead* of the code is a `warn`: that is a migration landing before a deploy,
 * which is the safe order and normally resolves itself.
 */
export function compareSchema(expected: string | null, actual: string | null): CompatibilityFinding {
  if (!expected || !actual) {
    return {
      state: 'unknown',
      detail: actual
        ? 'the checkout does not say which migration it expects'
        : 'the database carries no schema_version marker — it predates migration 0082',
    };
  }
  if (expected === actual) return { state: 'ok', detail: `migration ${actual}` };

  const behind = Number(actual) < Number(expected);
  return {
    state: behind ? 'fail' : 'warn',
    detail: behind
      ? `the database is at migration ${actual} but this build expects ${expected} — ` +
        'unapplied migrations, so code will reference columns that do not exist'
      : `the database is at migration ${actual}, ahead of this build's ${expected} — ` +
        'a migration landed before the deploy',
  };
}
