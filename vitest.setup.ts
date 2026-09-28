/**
 * §565. An ordinary test run may not reach a provider, and may not pay one.
 *
 * Gotcha 12 tells you to source `apps/web/.env.local` before running the suite,
 * because forty-three database-backed suites skip without `DATABASE_URL`. That
 * file also carries every *other* real credential — OpenAI, Anthropic,
 * ElevenLabs, Pexels, and six accounts' OAuth clients — and the provider
 * clients all fall back to `process.env`. So the documented way to run the full
 * suite is also the way to hand every test a live, billable credential, and the
 * only thing standing between that and a charge is that no test happens to call
 * the wrong function today. §479 found one test making a real request and fixed
 * that test; this fixes the class.
 *
 * Two guards, because either alone is insufficient:
 *
 *  1. **The network.** Every non-local `fetch` is refused by default. This is
 *     the guard that matters, because it also blocks publishing, engagement,
 *     and any provider whose key is set somewhere this file cannot see.
 *  2. **The credentials.** Paid keys are replaced with an obviously-fake
 *     sentinel, so a client constructed in a test authenticates as nobody even
 *     if it finds a transport this file did not wrap.
 *
 * Neither is a mock. A test that wants a real provider injects its own
 * `fetchImpl` — which is how every provider client in the codebase is already
 * built — and a deliberate live check sets `HALYARD_TEST_ALLOW_NETWORK=1`.
 *
 * What stays reachable: `localhost`, `127.0.0.1` and `::1`, so the E2E app,
 * the capture browser and any local fixture server work unchanged. Postgres is
 * untouched — `pg` speaks TCP, not `fetch`.
 */
import { beforeAll } from 'vitest';

/**
 * Credentials that cost money, or that authorise writing to a platform.
 *
 * §577. The platform half of this list is checked against the real registry.
 *
 * It had drifted: it sanitised `INSTAGRAM_CLIENT_ID`, `THREADS_CLIENT_ID` and
 * `PINTEREST_CLIENT_ID`, and the names those platforms actually use are
 * `*_APP_ID` / `*_APP_SECRET` (§173, §184). Six variables that do not exist
 * were being scrubbed and six that do were being left in place. Nothing leaked
 * — the network guard below refuses the request whatever credential it carries
 * — but the second layer of a defence-in-depth pair was guarding names nobody
 * uses, which is the same as not being there.
 *
 * Kept as a literal rather than imported from `@halyard/core`: this file is a
 * setup module that runs before every test file, and pulling the adapters
 * barrel into that path costs every suite. `credentialIsolation.test.ts` reads
 * `PLATFORM_CLIENT_ENV` and fails if this list ever falls behind it again.
 */
const PAID_OR_PRIVILEGED_KEYS = [
  /* Paid providers — these are the ones that cost money per call. */
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'PEXELS_API_KEY',
  'REPLICATE_API_TOKEN',
  'GITHUB_TOKEN',

  /* Platform OAuth clients, mirroring `PLATFORM_CLIENT_ENV`. */
  'X_CLIENT_ID',
  'X_CLIENT_SECRET',
  'INSTAGRAM_APP_ID',
  'INSTAGRAM_APP_SECRET',
  'THREADS_APP_ID',
  'THREADS_APP_SECRET',
  'PINTEREST_APP_ID',
  'PINTEREST_APP_SECRET',
  'TIKTOK_CLIENT_KEY',
  'TIKTOK_CLIENT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',

  /*
   * Not in the registry, and scrubbed anyway: `META_APP_*` is what Instagram
   * and Threads are usually configured on, the YouTube pair is read by an
   * operator script, and a Bluesky app password is a live posting credential.
   */
  'META_APP_ID',
  'META_APP_SECRET',
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'BLUESKY_APP_PASSWORD',
] as const;

/**
 * Obviously not a credential, and obviously deliberate in a log.
 *
 * Deleting the variable instead would change behaviour: a good many code paths
 * branch on "is a key configured at all" and would take the unconfigured
 * branch, so the suite would test something other than production. A present
 * key that cannot authenticate keeps the branch and removes the spend.
 */
const SENTINEL = 'halyard-test-not-a-real-credential';

function allowNetwork(): boolean {
  const flag = process.env.HALYARD_TEST_ALLOW_NETWORK?.trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocal(url: string): boolean {
  // Non-http schemes (data:, blob:, file:) never leave the process.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true; // relative URL — there is no host to reach.
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
  const host = parsed.hostname;
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
}

function targetOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

beforeAll(() => {
  for (const key of PAID_OR_PRIVILEGED_KEYS) {
    if (process.env[key]) process.env[key] = SENTINEL;
  }

  if (allowNetwork()) return;

  const real = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const target = targetOf(input);
    if (isLocal(target)) return real(input as never, init);

    const host = (() => {
      try {
        return new URL(target).host;
      } catch {
        return target;
      }
    })();

    throw new Error(
      `Refusing a network request to ${host} from a test.\n` +
        'An ordinary test run must not reach a provider, publish, or spend money ' +
        '(§565). Inject a fetch implementation — every provider client in this ' +
        'codebase takes one — or set HALYARD_TEST_ALLOW_NETWORK=1 for a ' +
        'deliberate live check.',
    );
  }) as typeof fetch;
});
