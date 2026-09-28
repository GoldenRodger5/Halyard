/**
 * §568. Every route the specs navigate to must exist. Checked first, in
 * milliseconds, before anything opens a browser.
 *
 * The studio reorganisation renamed nearly every screen — `/agents` became
 * `/master/crew`, `/brain` became `/master/product`, `/system` became
 * `/master/system` — and these specs were not moved with them. What that looks
 * like from outside is **not** "a test is pointing at the wrong URL". It looks
 * like forty-nine tests each waiting ten seconds for a heading that is sitting
 * on a 404 page, on a CI job whose ceiling is twenty minutes — so the suite
 * never finishes and the reason never appears anywhere. That is what the E2E
 * job has been doing.
 *
 * This is gotcha 1's shape: a list written in two places, drifting in silence.
 * The answer is the one `assetKinds.test.ts` gives — read both lists and
 * compare them — and here it costs a filesystem walk rather than half an hour
 * of browser time.
 *
 * It deliberately checks only that the page exists. The specs behind these
 * routes also assert on copy that the reorganisation rewrote, so pointing them
 * at the new URLs is not enough to make them pass: they need rewriting against
 * the screens that exist now, which belongs with the UI redesign in
 * `docs/production/UI_PRODUCT_REDESIGN_SPEC.md` rather than to a route rename.
 * Until then this says exactly what is wrong, immediately.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

// Playwright resolves `testDir` from the repository root, and the specs are
// transpiled to CJS, where `import.meta` does not exist.
const ROOT = process.cwd();
const APP = path.join(ROOT, 'apps/web/src/app');
const E2E = path.join(ROOT, 'e2e');

/**
 * Every URL the app router serves, as a pattern.
 *
 * Route groups — `(studio)` — are organisational and contribute no URL
 * segment. `[param]` matches one segment; `[...all]` matches the rest.
 */
function servedRoutes(): RegExp[] {
  const out: RegExp[] = [];

  const walk = (dir: string, url: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, /^\(.*\)$/.test(entry) ? url : `${url}/${entry}`);
      } else if (entry === 'page.tsx' || entry === 'page.ts' || entry === 'route.ts') {
        const literal = url === '' ? '/' : url;
        const source = literal.replace(/\[\.\.\.[^\]]+\]/g, '.+').replace(/\[[^\]]+\]/g, '[^/]+');
        out.push(new RegExp(`^${source}$`));
      }
    }
  };

  walk(APP, '');
  return out;
}

/**
 * Every path a spec could navigate to, with the file that asks for it.
 *
 * Not just `page.goto('…')`. The first version of this check looked only for
 * single-quoted literals and reported thirty-five dead routes; every
 * `` page.goto(`/queue/${id}`) `` and every route held in a `const ROUTES = […]`
 * array that a loop later visits was invisible to it — and `/queue/:id` was
 * dead too. A check that finds most of a problem tells you the problem is
 * smaller than it is, which is its own kind of false green.
 *
 * So it reads **every path-shaped string literal in the file**, quoted or
 * templated. That is deliberately wider than "things passed to goto": a path
 * literal sitting in an E2E spec is a route this suite depends on whatever
 * syntax carries it there, and the few that are not — an API path posted to
 * rather than navigated — are routes the app must serve anyway.
 */
function navigatedPaths(): Array<{ target: string; spec: string }> {
  const out: Array<{ target: string; spec: string }> = [];

  /* A leading slash, then only the characters a URL path is made of. */
  const PATH_SHAPED = /^\/[A-Za-z0-9\-._~/[\]${}]*$/;

  for (const file of readdirSync(E2E).filter((f) => f.endsWith('.spec.ts'))) {
    const source = readFileSync(path.join(E2E, file), 'utf8');

    /* Single-quoted, double-quoted and backticked literals alike. */
    for (const match of source.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)) {
      const raw = match[1] ?? match[2] ?? match[3] ?? '';
      if (!PATH_SHAPED.test(raw)) continue;

      const target = raw.split('?')[0]!.split('#')[0]!;
      if (target === '' || target === '/') {
        if (target === '/') out.push({ target, spec: file });
        continue;
      }

      /*
       * `${id}` stands for a value only known at run time, and the router
       * matches it with a dynamic segment — so it becomes the same wildcard
       * `[param]` becomes on the other side.
       */
      out.push({ target: target.replace(/\$\{[^}]*\}/g, 'x'), spec: file });
    }
  }

  return out;
}

test.describe('the routes the specs navigate to', () => {
  test('all exist in the app router', () => {
    const routes = servedRoutes();
    const dead = [
      ...new Set(
        navigatedPaths()
          .filter(({ target }) => !routes.some((r) => r.test(target)))
          .map(({ target, spec }) => `${target} (${spec})`),
      ),
    ].sort();

    expect(
      dead,
      'These specs navigate to routes the app router does not serve, so they wait on ' +
        'a 404 until they time out. The screens were renamed by the studio ' +
        'reorganisation and the specs need rewriting against the ones that exist. §568.',
    ).toEqual([]);
  });

  test('finds routes and specs at all, so an empty pass cannot look green', () => {
    // A move of either directory would otherwise make the check above vacuous —
    // which is the exact failure mode it exists to prevent.
    expect(servedRoutes().length).toBeGreaterThan(20);
    expect(navigatedPaths().length).toBeGreaterThan(20);
  });
});
