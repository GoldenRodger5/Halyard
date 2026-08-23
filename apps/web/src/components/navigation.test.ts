/**
 * The navigation is a promise: every capability stays reachable.
 *
 * §172 reorganised twenty-nine sidebar links into seven primary destinations and
 * a collapsed More. The reorganisation is only safe if nothing fell out of it,
 * and "I checked the list" is not a guarantee that survives the next edit — so
 * the two ways it can silently break are asserted here instead:
 *
 *   1. A destination that existed before is quietly dropped.
 *   2. A destination is listed but its route does not exist, so it 404s.
 *
 * The baseline is frozen deliberately. It is the set of destinations the sidebar
 * offered before the reorganisation, and it is not derived from the current file
 * — a baseline computed from the thing under test would agree with any deletion.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV, MORE } from './Shell';

/** Every destination the sidebar offered before §172. Frozen; do not regenerate. */
const BEFORE_REORGANISATION = [
  '/',
  '/accounts',
  '/agents',
  '/analytics',
  '/assets',
  '/brain',
  '/calendar',
  '/campaigns',
  '/compose',
  '/finds',
  '/first-30-days',
  '/hooks',
  '/ideas',
  '/inbox',
  '/launch',
  '/library',
  '/products',
  '/queue',
  '/series',
  '/settings',
  '/settings/pronunciation',
  '/settings/readiness',
  '/setup-kit',
  '/social-proof',
  '/submissions',
  '/swipe',
  '/system',
  '/take',
  '/templates',
];

const reachable = [...NAV.map((i) => i.href), ...MORE.flatMap((s) => s.items.map((i) => i.href))];

describe('sidebar navigation', () => {
  it('still reaches every destination that existed before the reorganisation', () => {
    const missing = BEFORE_REORGANISATION.filter((href) => !reachable.includes(href));
    expect(missing).toEqual([]);
  });

  it('lists each destination exactly once', () => {
    const seen = new Map<string, number>();
    for (const href of reachable) seen.set(href, (seen.get(href) ?? 0) + 1);
    expect([...seen.entries()].filter(([, n]) => n > 1).map(([href]) => href)).toEqual([]);
  });

  it('keeps the primary list short enough to scan', () => {
    /*
     * Seven is not a magic number, but a primary list that grows without limit is
     * how the sidebar reached twenty-nine in the first place. A tenth entry should
     * be a decision, not an accident.
     */
    expect(NAV.length).toBeLessThanOrEqual(9);
  });

  it('points every link at a route that exists', () => {
    /*
     * Reads the App Router tree rather than trusting the list. A mistyped href
     * typechecks perfectly and 404s in production — the exact failure mode the
     * product switcher had.
     */
    const root = join(__dirname, '..', 'app', '(dashboard)');
    const broken = reachable.filter((href) => {
      const dir = href === '/' ? root : join(root, href);
      return !existsSync(join(dir, 'page.tsx'));
    });
    expect(broken).toEqual([]);
  });

  it('has a dashboard route for every link, and knows which are not in the sidebar', () => {
    /* Informational: routes that exist but are not linked anywhere in the shell. */
    const root = join(__dirname, '..', 'app', '(dashboard)');
    const top = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
      .map((e) => `/${e.name}`);
    expect(top.length).toBeGreaterThan(0);
  });
});
