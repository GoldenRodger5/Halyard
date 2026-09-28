/**
 * §577. The test environment must scrub the credentials the product reads.
 *
 * `vitest.setup.ts` replaces privileged credentials with a sentinel so that a
 * client constructed during a test authenticates as nobody. That list had
 * drifted from the one the product actually uses: it scrubbed
 * `INSTAGRAM_CLIENT_ID`, `THREADS_CLIENT_ID` and `PINTEREST_CLIENT_ID`, and
 * those three platforms read `*_APP_ID` / `*_APP_SECRET` (§173, §184). Six
 * variables that do not exist were being scrubbed; six that do were not.
 *
 * No request escaped — the setup's second guard refuses every non-local `fetch`
 * whatever credential it carries — but a defence-in-depth pair with one half
 * guarding names nobody uses is a single defence wearing a second one's name.
 *
 * This is gotcha 1's shape again: one list written twice. It gets gotcha 1's
 * answer. The setup file is read as text rather than imported, for the same
 * reason `ciKey.test.ts` reads the workflow: the value lives somewhere no
 * compiler looks, so a test is the only thing that can hold it, and importing
 * it would run the module's `beforeAll` registration inside this suite.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PLATFORM_CLIENT_ENV } from './index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SETUP = path.join(ROOT, 'vitest.setup.ts');

/** The names `vitest.setup.ts` replaces with a sentinel. */
function scrubbedNames(): Set<string> {
  const source = readFileSync(SETUP, 'utf8');
  const block = /const PAID_OR_PRIVILEGED_KEYS = \[([\s\S]*?)\] as const;/.exec(source);
  if (!block) throw new Error('PAID_OR_PRIVILEGED_KEYS not found in vitest.setup.ts');
  return new Set([...block[1]!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!));
}

describe('the test environment scrubs every platform credential the product reads', () => {
  const scrubbed = scrubbedNames();

  /*
   * A placeholder for a platform that authenticates on something other than a
   * client id and secret. It is not a credential and there is nothing to scrub.
   */
  const NOT_A_CREDENTIAL = /_UNUSED$/;

  it('covers every name in PLATFORM_CLIENT_ENV', () => {
    const required = Object.values(PLATFORM_CLIENT_ENV)
      .flatMap((c) => [c.id, c.secret])
      .filter((name) => !NOT_A_CREDENTIAL.test(name));

    const missing = [...new Set(required)].filter((name) => !scrubbed.has(name)).sort();

    expect(
      missing,
      'These platform credentials are read by `PLATFORM_CLIENT_ENV` and are NOT ' +
        'replaced with a sentinel in `vitest.setup.ts`, so a test that builds a ' +
        'client for one of them holds a live credential. Add them to ' +
        'PAID_OR_PRIVILEGED_KEYS. §577.',
    ).toEqual([]);
  });

  it('still scrubs the paid providers, which are the ones that cost money', () => {
    for (const key of [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'ELEVENLABS_API_KEY',
      'PEXELS_API_KEY',
    ]) {
      expect(scrubbed.has(key), `${key} is no longer scrubbed by vitest.setup.ts`).toBe(true);
    }
  });

  it('has actually replaced them in this very process', () => {
    /*
     * The list being right is one thing; the setup having run is another. This
     * asserts the outcome rather than the intention — if a key is set at all in
     * this process, it must be the sentinel and not something that could
     * authenticate.
     */
    for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'X_CLIENT_SECRET']) {
      const value = process.env[key];
      if (value === undefined || value === '') continue;
      expect(value, `${key} still holds a real-looking value inside a test`).toBe(
        'halyard-test-not-a-real-credential',
      );
    }
  });
});
