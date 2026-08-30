/**
 * §391. Every route the app sends somebody to has to exist.
 *
 * §390 moved twenty-two screens between route groups. Their *bodies* came with
 * them, and so did every link inside those bodies — all still written against
 * the paths they had in the old console. Thirty-four routing targets were dead
 * the moment `(dashboard)` was deleted, including the OAuth callback's redirect
 * to `/accounts/confirm/${pendingId}`, which is the last step of connecting an
 * account. **Connecting anything was broken and nothing failed**, because a
 * string is a string until somebody clicks it.
 *
 * `coreRoutes.test.ts` makes the same check for `@halyard/core`, where the
 * strings are prose. This one covers the app itself, where they are `href`,
 * `redirect()`, `revalidatePath()` and `new URL()`.
 *
 * ## Why this is not the same as the orphan check
 *
 * `rooms.test.ts` asks whether every page is *linked from* somewhere. This asks
 * whether every link *points at* somewhere. They are opposite directions and
 * both fail silently: an unlinked page is invisible, and a dead link 404s.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.join(__dirname, '..', '..');
const APP = path.join(SRC, 'app');

function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** Does this path resolve to a page or a route handler? */
function resolves(route: string): boolean {
  const rel = route === '/' ? '' : route;
  for (const base of [path.join(APP, '(studio)', rel), path.join(APP, rel)]) {
    if (existsSync(path.join(base, 'page.tsx')) || existsSync(path.join(base, 'route.ts'))) {
      return true;
    }
    /* A prefix whose only child is dynamic — `/l` is `/l/[slug]`. */
    if (existsSync(base) && statSync(base).isDirectory()) {
      if (readdirSync(base).some((e) => e.startsWith('['))) return true;
    }
  }
  return false;
}

/**
 * Routing targets only.
 *
 * An import path is also a string beginning with a slash, and so is a comment.
 * Matching the *context* — `href=`, `redirect(`, `revalidatePath(`, `new URL(`
 * — is what tells a destination apart from a module.
 */
const TARGET = /(?:href[=:]\s*|redirect\(\s*|revalidatePath\(\s*|new URL\(\s*)(["'`])(\/[a-zA-Z0-9/_-]*)/g;

describe('routing targets', () => {
  it('all resolve to a page or a route handler', () => {
    const dead: string[] = [];
    for (const file of sources(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(TARGET)) {
        const route = m[2]!.replace(/\/$/, '') || '/';
        /* A dynamic segment is filled at runtime; its parent is what must exist. */
        if (route.includes('[')) continue;
        if (resolves(route)) continue;
        dead.push(`${path.relative(SRC, file)}: ${route}`);
      }
    }
    expect([...new Set(dead)], 'links pointing at routes that do not exist').toEqual([]);
  });
});
