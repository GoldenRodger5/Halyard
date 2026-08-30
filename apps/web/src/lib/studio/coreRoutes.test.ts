/**
 * §390. A route named in core has to exist in the app.
 *
 * `assessReadiness` and `FIRST_THIRTY_DAYS` tell an operator where to go —
 * *"Connect at least one account on /master"*, *"Check /master/system for the
 * reason each gave up"*. Those strings live in `@halyard/core`, which cannot
 * see the App Router and has no way to check them.
 *
 * So they went stale. Step 9 deleted eleven routes those files still pointed
 * at, and `/onboarding` had been dead for longer than that. Nothing failed:
 * a fix string is prose until somebody clicks it.
 *
 * This is the cross-package link check. It runs in `apps/web` because that is
 * the only place that can see both the strings and the routes.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'core', 'src');
const APP = path.join(__dirname, '..', '..', 'app');

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
 * Does this path resolve to a page?
 *
 * Checked in both route groups and at the top level, because a group is
 * invisible in a URL — `(studio)/gallery/page.tsx` serves `/gallery`.
 */
function routeExists(route: string): boolean {
  const rel = route === '/' ? '' : route;
  for (const base of [path.join(APP, '(studio)', rel), path.join(APP, rel)]) {
    if (existsSync(path.join(base, 'page.tsx'))) return true;
    /*
     * A route whose only child is dynamic — `/l` is `/l/[slug]`, the link
     * redirector. The directory exists and serves; it just has no page of its
     * own, and prose naming the prefix is naming a real thing.
     */
    if (
      existsSync(base) &&
      statSync(base).isDirectory() &&
      readdirSync(base).some((entry) => entry.startsWith('['))
    ) {
      return true;
    }
  }
  return false;
}

describe('routes named in core', () => {
  it('all resolve to a page in the app', () => {
    const dead: string[] = [];

    for (const file of sources(path.join(CORE, 'readiness'))) {
      const source = readFileSync(file, 'utf8');
      /*
       * Route-shaped tokens only. `/master/system` yes; `packages/core/src/x`
       * no, because it does not start at a word boundary preceded by
       * whitespace or a quote, and a file path has a dot in it.
       */
      for (const m of source.matchAll(/(?:^|[\s'"`(])(\/[a-z][a-z0-9-]*(?:\/[a-z0-9[\]-]+)*)/g)) {
        const route = m[1]!;
        /* Dynamic segments and non-routes are not this test's business. */
        if (route.includes('[') || route.includes('.')) continue;
        if (routeExists(route)) continue;
        dead.push(`${path.basename(file)}: ${route}`);
      }
    }

    expect([...new Set(dead)], 'routes named in core with no page behind them').toEqual([]);
  });
});
