/**
 * §390. Nothing the old console could reach became unreachable.
 *
 * The studio replaced `(dashboard)` entirely: 53 routes became 49, the room
 * names changed, and everything moved. That is exactly the change where a
 * capability disappears without anybody noticing, because a deleted screen
 * raises no error — it simply stops being somewhere you can go.
 *
 * The baseline below is the **frozen list of every destination the old sidebar
 * offered**, carried over verbatim from `navigation.test.ts`, which made the
 * same promise about §172's reorganisation. It is not derived from anything
 * current: a baseline computed from the thing under test agrees with any
 * deletion, which is the one thing it must never do.
 *
 * Each old destination maps to where it lives now. A map entry is a *claim*
 * that the capability survived, and the test checks the claim resolves to a
 * real page — so the only way to lose something is to say so, here, explicitly.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOMS } from './rooms';

const APP = join(__dirname, '..', '..', 'app');

/**
 * Old destination → where it lives in the studio.
 *
 * Where several old screens fold into one room, several entries point at the
 * same route. That is a real answer: `/ideas`, `/hooks` and `/swipe` were three
 * lists of things a brief draws on, and they are one room because an operator
 * never wanted them apart.
 */
const MOVED: Record<string, string> = {
  '/': '/',
  '/accounts': '/master',
  '/agents': '/master/crew',
  '/analytics': '/numbers',
  '/assets': '/gallery/stock/media',
  '/brain': '/master/product',
  '/calendar': '/rundown',
  '/campaigns': '/rundown/campaigns',
  '/compose': '/floor/chat',
  '/finds': '/wires/finds',
  '/first-30-days': '/rundown/launch',
  '/hooks': '/floor/sources',
  '/ideas': '/floor/sources',
  '/inbox': '/wires',
  '/launch': '/rundown/launch',
  '/library': '/gallery/onair',
  '/products': '/master/product',
  '/queue': '/gallery',
  '/series': '/rundown/series',
  '/settings': '/master/system',
  '/settings/pronunciation': '/master/system/pronunciation',
  '/settings/readiness': '/first-run',
  '/setup-kit': '/master/setup-kit',
  '/social-proof': '/gallery/stock/proof',
  '/submissions': '/gallery/stock/submissions',
  '/swipe': '/floor/sources',
  '/system': '/master/system',
  '/take': '/wires/take',
  '/templates': '/master/templates',
};

/** Frozen. The destinations the old sidebar offered. Do not regenerate. */
const BEFORE_THE_STUDIO = Object.keys(MOVED);

function pageExists(route: string): boolean {
  const rel = route === '/' ? '' : route;
  for (const base of [join(APP, '(studio)', rel), join(APP, rel)]) {
    if (existsSync(join(base, 'page.tsx'))) return true;
    if (existsSync(base) && statSync(base).isDirectory()) {
      if (readdirSync(base).some((e) => e.startsWith('['))) return true;
    }
  }
  return false;
}

describe('the studio replaced the console without losing anything', () => {
  it('has somewhere for every destination the old console offered', () => {
    const lost = BEFORE_THE_STUDIO.filter((old) => !pageExists(MOVED[old]!));
    expect(lost.map((o) => `${o} → ${MOVED[o]}`), 'capabilities with nowhere to go').toEqual([]);
  });

  it('reaches every room from the navigation', () => {
    /*
     * The other half. A page that exists but is linked from nowhere is reachable
     * only by typing a URL, which is the same as gone for anybody who did not
     * already know about it.
     */
    const nav = new Set(ROOMS.flatMap((r) => [r.href, ...r.tabs.map((t) => t.href)]));
    /* A destination is reachable if it is in the nav or is a child of something in it. */
    const unreachable = [...new Set(Object.values(MOVED))].filter(
      (route) => !nav.has(route) && ![...nav].some((n) => n !== '/' && route.startsWith(`${n}/`)),
    );
    expect(unreachable, 'routes with no navigation path to them').toEqual([]);
  });

  it('kept the old console deleted', () => {
    // The point of step 9. Two consoles is worse than either.
    expect(existsSync(join(APP, '(dashboard)'))).toBe(false);
  });
});
