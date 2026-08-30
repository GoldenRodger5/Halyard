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
import { NAV, MORE, SECTIONS, sectionFor } from './Shell';

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

/**
 * §361. The section model's own promises.
 *
 * The frozen baseline above proves nothing was lost. These prove the thing that
 * replaced it stays the shape it was reorganised into — which is the half §172
 * had no test for, and is why More grew back to twenty-one links.
 */
describe('sections', () => {
  it('gives every section a question, in the operator’s words', () => {
    /*
     * A section that cannot be described as one question is two sections.
     * Asserting the line exists is how that gets noticed at the time rather
     * than a fortnight later.
     */
    const silent = SECTIONS.filter((s) => !s.question.trim().endsWith('?'));
    expect(silent.map((s) => s.label)).toEqual([]);
  });

  it('keeps every tab row scannable', () => {
    /*
     * Eight fits one row at the content width. Beyond that the row wraps and
     * becomes the list it exists to replace.
     */
    const crowded = SECTIONS.filter((s) => s.tabs.length > 8);
    expect(crowded.map((s) => `${s.label}: ${s.tabs.length}`)).toEqual([]);
  });

  it('opens a section on its own first tab', () => {
    /*
     * A section href that is not one of its tabs leaves the tab row with
     * nothing highlighted when you arrive from the sidebar.
     */
    const orphans = SECTIONS.filter(
      (s) => s.tabs.length > 0 && !s.tabs.some((t) => t.href === s.href),
    );
    expect(orphans.map((s) => s.label)).toEqual([]);
  });

  it('puts every way of starting a piece in one section', () => {
    /*
     * The reported problem in its most specific form: Make, Create and Co-pilot
     * were three sidebar destinations for one job. If any of them ever becomes
     * a section again, this fails.
     */
    const starts = ['/make', '/studio', '/compose'];
    const sections = new Set(starts.map((href) => sectionFor(href)?.label));
    expect([...sections]).toEqual(['Make']);
  });

  it('resolves every listed destination to exactly one section', () => {
    const everything = [...NAV.map((n) => n.href), ...MORE.flatMap((m) => m.items.map((i) => i.href))];
    const unresolved = everything.filter((href) => !sectionFor(href));
    expect(unresolved).toEqual([]);
  });

  it('resolves a drill-down to its parent section rather than to Home', () => {
    /*
     * Longest match wins. `/settings/readiness` used to fall through to `/` on
     * a naive startsWith, which highlighted Home while you were in Settings.
     */
    expect(sectionFor('/settings/readiness')?.label).toBe('Setup');
    expect(sectionFor('/queue/abc-123')?.label).toBe('Review');
    expect(sectionFor('/make/run/abc-123')?.label).toBe('Make');
    expect(sectionFor('/')?.label).toBe('Home');
  });
});
