/**
 * §305. An action the runner cannot execute is a step that silently does nothing.
 *
 * `fillSecret` was added to the action union in §299, used by both of the
 * sign-in's credential steps, and had **no case in `executeStep`** — so the
 * switch fell through to `return {}`, both fields stayed empty, and the form
 * was submitted blank. The failure surfaced 30 seconds later on an unrelated
 * wait, which is a very long way from the mistake.
 *
 * TypeScript cannot catch this. The switch has no `default` that throws and the
 * function returns a value after it, so an unhandled action is exhaustive as
 * far as the compiler is concerned — it just does nothing.
 *
 * This is the same shape as `handlerCoverage.test.ts` and gotcha 1: two lists
 * that must agree, in two files, with nothing tying them together.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOWS } from '@halyard/core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(HERE, 'runFlow.ts');
const FLOWS_SRC = path.join(HERE, '../../../../packages/core/src/capture/flows.ts');

function actionsInUnion(): string[] {
  const source = readFileSync(FLOWS_SRC, 'utf8');
  /* The union that opens the `action:` field, up to its terminating semicolon. */
  const start = source.indexOf("  action:");
  const end = source.indexOf(';', start);
  return [...source.slice(start, end).matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]!);
}

describe('every flow action can actually run', () => {
  const runner = readFileSync(RUNNER, 'utf8');

  it('has a case in executeStep for each action in the union', () => {
    const missing = actionsInUnion().filter((a) => !runner.includes(`case '${a}':`));
    expect(
      missing,
      `These actions are declared and the runner has no case for them, so a step ` +
        `using one does nothing and reports success: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every action a real flow uses is one the runner handles', () => {
    /* The union could be right and a flow could still use something invented. */
    const used = new Set(Object.values(FLOWS).flatMap((f) => f.steps.map((s) => s.action)));
    const unrunnable = [...used].filter((a) => !runner.includes(`case '${a}':`));
    expect(unrunnable).toEqual([]);
  });
});
