/**
 * §235. No client component may import the `@halyard/core` barrel.
 *
 * ## Why this needs a test
 *
 * Gotcha 10 is documented, and it still happened. The Studio's client
 * component imported `VISUAL_LANGUAGES` from `@halyard/core` to populate a
 * dropdown. That typechecked, linted, and passed all 2,524 tests — and then
 * failed the production build with `UnhandledSchemeError: node:crypto`,
 * because the barrel reaches `node:crypto` through the accounts module and
 * webpack cannot bundle a Node scheme for the browser.
 *
 * The only thing that caught it was `next build`, which is the slowest signal
 * in the repository and the one least likely to be run mid-change. This is the
 * fast version.
 *
 * ## What is allowed
 *
 * A server component may import core freely — it runs in Node. So this checks
 * only files carrying the `'use client'` directive, and the fix is always the
 * same: the server component imports the value and passes it down as data.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.tsx?$/.test(full) && !full.includes('.test.')) out.push(full);
  }
  return out;
}

describe('the client boundary', () => {
  const files = walk(SRC);

  it('finds files at all, so this cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => readFileSync(f, 'utf8').startsWith("'use client'"))).toBe(true);
  });

  it('never imports the core barrel from a client component', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      /* The directive has to be the first statement, so a leading check is
         enough and cannot be fooled by the string appearing in a comment. */
      if (!/^['"]use client['"]/.test(source.trimStart())) continue;
      if (/from ['"]@halyard\/core['"]/.test(source)) {
        offenders.push(path.relative(SRC, file));
      }
    }
    expect(
      offenders,
      `these client components import @halyard/core, whose barrel reaches node:crypto — ` +
        `the production build will fail with UnhandledSchemeError. Import it in the server ` +
        `component and pass the value down as a prop:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
