/**
 * §387. No test builds its own `HandlerContext`.
 *
 * §367 wrote `testContext.ts` because twenty test files each built
 * `{ log } as unknown as HandlerContext`, and that cast is a promise the
 * compiler cannot check: adding `as` to the interface typechecked everywhere
 * and failed at runtime in the files that called it.
 *
 * Two files never adopted the factory. The bill came due when `openStage`
 * started calling `ctx.as` — seventeen tests failed with *"ctx.as is not a
 * function"*, none of them about the thing that had changed, and none of them
 * about text-to-speech or rendering either.
 *
 * Writing the helper is not the same as everything using it. This is the part
 * §367 was missing, and it is decision 71's method: assert the *shape* rather
 * than fix the instance.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKER = path.join(__dirname);

function tests(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) tests(full, acc);
    else if (/\.test\.ts$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe('the fake handler context is built in one place', () => {
  it('casts nothing to a HandlerContext', () => {
    const offenders: string[] = [];
    for (const file of tests(WORKER)) {
      const source = readFileSync(file, 'utf8')
        /* Comments first, so a file explaining the rule is not an offender. */
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
      /*
       * The cast in any spelling — `as HandlerContext`, `as unknown as
       * HandlerContext`. A test that needs a partial context passes overrides
       * to `testContext` instead, which keeps satisfying the interface after
       * the next field is added to it.
       */
      if (/\bas\s+(?:unknown\s+as\s+)?HandlerContext\b/.test(source)) {
        offenders.push(path.relative(WORKER, file));
      }
    }
    expect(offenders, 'use testContext() from testContext.ts').toEqual([]);
  });

  it('keeps the factory satisfying the interface it fakes', () => {
    /*
     * Guards the guard. If `testContext` itself started casting, every file
     * above could adopt it and the same runtime failure would return through
     * one file instead of twenty.
     */
    const factory = readFileSync(path.join(WORKER, 'testContext.ts'), 'utf8');
    /*
     * Comments stripped first: this file's own docstring *describes* the cast
     * it exists to remove, and a scan that cannot tell prose from code reports
     * the explanation as the offence. §108 is the same trap in the SQL
     * validator, and §386 in the design-token scan.
     */
    const code = factory
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    expect(/\bas\s+unknown\s+as\s+HandlerContext\b/.test(code)).toBe(false);
    /* It must declare the interface, so adding a field breaks this one file. */
    expect(factory).toMatch(/extends HandlerContext/);
  });
});
