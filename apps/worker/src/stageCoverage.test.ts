/**
 * §387. Every stage the system declares must be opened by something.
 *
 * `STAGE_AGENTS` (§367) names eleven stages and says who owns each. The
 * attribution is structural: wrapping a stage with `ctx.as('write')` attributes
 * everything logged inside it, including lines written by code three modules
 * down that has never heard of a stage.
 *
 * That only works for stages something actually opens. A stage declared in
 * `STAGE_AGENTS` and never passed to `ctx.as` produces no attributed events
 * ever — so the run appears to skip it, the floor's desk for it never lights,
 * and nothing anywhere fails. **Declared, typed, tested, never executed**, in
 * the place whose whole job is making a run legible.
 *
 * This is decision 71's method: look for the shape rather than the instance.
 * `handlerCoverage.test.ts` does the same for `JOB_KINDS`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAGE_ORDER } from '@halyard/core';

const WORKER = path.join(__dirname);

function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) acc.push(full);
  }
  return acc;
}

/**
 * Every stage name opened anywhere in the worker.
 *
 * Both forms: `openStage(ctx, 'write')`, which is what callers should use, and
 * the raw `ctx.as('write')` underneath it — a stage opened either way is
 * attributed, and this test is about attribution rather than about style.
 */
function opened(): Set<string> {
  const found = new Set<string>();
  for (const file of sources(WORKER)) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/\.as\(\s*'([a-z_]+)'\s*\)/g)) found.add(m[1]!);
    for (const m of source.matchAll(/openStage\(\s*\w+\s*,\s*'([a-z_]+)'\s*\)/g)) found.add(m[1]!);
  }
  return found;
}

describe('stage attribution covers the stages that are declared', () => {
  it('opens every stage STAGE_AGENTS names', () => {
    const seen = opened();
    const never = STAGE_ORDER.filter((s) => !seen.has(s));
    expect(never, 'declared in STAGE_AGENTS, never passed to ctx.as').toEqual([]);
  });

  it('opens no stage STAGE_AGENTS does not name', () => {
    /*
     * The inverse. A typo — `ctx.as('rendor')` — attributes every line inside
     * it to nobody, silently, and `agentsForStage` falls back to UNATTRIBUTED
     * rather than throwing. Nothing else would ever notice.
     */
    const declared = new Set<string>(STAGE_ORDER);
    expect([...opened()].filter((s) => !declared.has(s))).toEqual([]);
  });
});
