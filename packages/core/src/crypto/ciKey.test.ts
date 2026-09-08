/**
 * §569. The key CI runs with has to be a key CI can use.
 *
 * `TOKEN_ENCRYPTION_KEY` in `.github/workflows/ci.yml` decoded to **31 bytes**
 * for as long as that file has existed — `dGVzdC1rZXkt…` is
 * "test-key-test-key-test-key-test" — so `loadKey` refused it and every suite
 * that seals a token died on it.
 *
 * Nobody saw that for months, and the reason is the more useful half of the
 * story: the generated-types step ran first, it was failing, and a failed step
 * ends a GitHub Actions job. The Test step simply never ran. §564 fixed the
 * masking; this fixes what the masking was hiding, and stops it returning —
 * the value lives in a YAML file no compiler reads, so nothing else would.
 *
 * The test reads the workflow rather than a copy of the value, because a
 * constant duplicated here would be the same drift one layer along (gotcha 1).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const WORKFLOW = path.join(ROOT, '.github/workflows/ci.yml');

/** AES-256 takes a 256-bit key, and `loadKey` refuses anything else. */
const REQUIRED_BYTES = 32;

describe('the CI workflow’s TOKEN_ENCRYPTION_KEY', () => {
  const yaml = readFileSync(WORKFLOW, 'utf8');
  const match = /^\s*TOKEN_ENCRYPTION_KEY:\s*(\S+)\s*$/m.exec(yaml);

  it('is set at all', () => {
    expect(
      match?.[1],
      'CI has no TOKEN_ENCRYPTION_KEY, so every suite that seals a token will fail.',
    ).toBeTruthy();
  });

  it(`decodes to exactly ${REQUIRED_BYTES} bytes`, () => {
    const decoded = Buffer.from(match![1]!, 'base64');
    expect(
      decoded.length,
      `CI's TOKEN_ENCRYPTION_KEY decodes to ${decoded.length} bytes; loadKey requires ` +
        `${REQUIRED_BYTES} and throws otherwise. Generate one with: ` +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\". §569.",
    ).toBe(REQUIRED_BYTES);
  });
});
