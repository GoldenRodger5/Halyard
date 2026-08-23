/**
 * Every server action authenticates.
 *
 * A server action is a **public POST endpoint**. The `(dashboard)` layout calls
 * `getOperator()` and redirects to `/signin`, but a layout guards *rendering* —
 * it never runs for an action invocation — and the middleware does no auth at
 * all.
 *
 * Ten actions had no `requireOperator()`, including `approveItem` and
 * `publishNow`: the approval gate and the direct publish trigger, reachable
 * without an authenticated operator. That is the boundary §90 and §92 exist to
 * hold, bypassed at the transport layer rather than the logic layer — so none of
 * the adversarial tests that attack the *logic* could have seen it.
 *
 * This reads the source rather than invoking the actions, because what is being
 * asserted is a property of every file marked `'use server'`, including ones
 * that do not exist yet.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts') && !full.includes('.test.')) out.push(full);
  }
  return out;
}

interface Action {
  name: string;
  file: string;
  body: string;
}

/** Every exported function in a file marked `'use server'`, with its body. */
function serverActions(): Action[] {
  const out: Action[] = [];
  for (const file of walk(APP)) {
    const src = readFileSync(file, 'utf8');
    if (!src.slice(0, 200).includes("'use server'")) continue;

    for (const match of src.matchAll(/export async function (\w+)\s*\([^)]*\)[^{]*\{\n/g)) {
      let depth = 1;
      let i = match.index! + match[0].length;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') depth -= 1;
        i += 1;
      }
      out.push({
        name: match[1]!,
        file: path.relative(APP, file),
        body: src.slice(match.index! + match[0].length, i),
      });
    }
  }
  return out;
}

describe('server actions are not public endpoints', () => {
  const actions = serverActions();

  it('finds the actions at all', () => {
    /**
     * Non-vacuity. A regex that stopped matching would report a clean sweep of
     * zero actions — the trap §76 was about, and the one that makes a
     * source-reading test worthless.
     */
    expect(actions.length).toBeGreaterThan(60);
    expect(actions.map((a) => a.name)).toContain('approveItem');
    expect(actions.map((a) => a.name)).toContain('publishNow');
  });

  it('requires an operator in every one', () => {
    const unguarded = actions
      .filter((a) => !a.body.includes('requireOperator'))
      .map((a) => `${a.file}#${a.name}`);

    expect(
      unguarded,
      'a server action is a public POST endpoint and must authenticate; the dashboard layout does not run for it',
    ).toEqual([]);
  });

  it('authenticates before doing any work', () => {
    /**
     * Position matters, not just presence. A check after the database write has
     * already happened is not a check — and `approveItem` reads the item and
     * `publishNow` enqueues a job within a few lines of their opening.
     *
     * Asserted as "before the first statement that touches state", which is the
     * property that actually protects anything.
     */
    const late: string[] = [];
    for (const action of actions) {
      const guard = action.body.indexOf('requireOperator');
      if (guard === -1) continue;
      for (const marker of ['await query(', 'await one<', 'insert into', 'update ']) {
        const first = action.body.indexOf(marker);
        if (first !== -1 && first < guard) {
          late.push(`${action.file}#${action.name} (${marker.trim()})`);
          break;
        }
      }
    }
    expect(late, 'authenticates after already touching state').toEqual([]);
  });
});
