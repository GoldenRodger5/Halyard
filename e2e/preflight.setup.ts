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

/** Every path a spec navigates to, with the file that asks for it. */
function navigatedPaths(): Array<{ target: string; spec: string }> {
  const out: Array<{ target: string; spec: string }> = [];

  for (const file of readdirSync(E2E).filter((f) => f.endsWith('.spec.ts'))) {
    const source = readFileSync(path.join(E2E, file), 'utf8');
    for (const match of source.matchAll(/page\.goto\(\s*'([^']+)'/g)) {
      const raw = match[1]!;
      if (/^https?:\/\//.test(raw)) continue; // Not this app's router to answer for.
      const target = raw.split('?')[0]!.split('#')[0]!;
      if (target !== '') out.push({ target, spec: file });
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
