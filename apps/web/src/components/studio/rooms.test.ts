/**
 * §384. Navigation is a promise: every room reachable, every path resolving to
 * exactly one place, and the shape holding as rooms are added.
 *
 * The old sidebar grew to twenty-nine links because nothing asserted its shape.
 * These are the assertions that stop that happening twice.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOMS, POCKET_ROOMS, roomFor, tabFor } from './rooms.js';

describe('the rooms', () => {
  it('gives every room a question, in the operator’s words', () => {
    /*
     * A room that cannot be written as one question is two rooms. Writing the
     * line is how that gets noticed at the time rather than a fortnight later.
     */
    const silent = ROOMS.filter((r) => !r.question.trim().endsWith('?'));
    expect(silent.map((r) => r.label)).toEqual([]);
  });

  it('keeps every tab row scannable', () => {
    /*
     * Six fits one row at the content width. Beyond that the row wraps and
     * becomes the list it exists to replace.
     */
    const crowded = ROOMS.filter((r) => r.tabs.length > 6);
    expect(crowded.map((r) => `${r.label}: ${r.tabs.length}`)).toEqual([]);
  });

  it('opens each room on its own first tab', () => {
    const orphans = ROOMS.filter((r) => !r.tabs.some((t) => t.href === r.href));
    expect(orphans.map((r) => r.label)).toEqual([]);
  });

  it('numbers the rooms in order, with no gaps', () => {
    expect(ROOMS.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('has no duplicate paths anywhere', () => {
    const all = ROOMS.flatMap((r) => r.tabs.map((t) => t.href));
    expect(new Set(all).size).toBe(all.length);
  });

  it('gives every tab a hint saying what it is for', () => {
    const bare = ROOMS.flatMap((r) => r.tabs.filter((t) => !t.hint).map((t) => t.href));
    expect(bare).toEqual([]);
  });

  it('resolves a path to exactly one room, longest match first', () => {
    expect(roomFor('/gallery')?.label).toBe('Gallery');
    expect(roomFor('/gallery/stock')?.label).toBe('Gallery');
    /* A drill-down: a piece id under the room, matching no tab. */
    expect(roomFor('/gallery/abc-123')?.label).toBe('Gallery');
    expect(roomFor('/floor/live')?.label).toBe('The Floor');
    expect(roomFor('/master/crew')?.label).toBe('Master Control');
    expect(roomFor('/nowhere')).toBeNull();
  });

  it('never leaves a tab row with nothing highlighted', () => {
    /*
     * Arriving from the sidebar, or on a drill-down, must still light a tab —
     * an unlit row reads as a broken page.
     */
    for (const room of ROOMS) {
      expect(tabFor(room, room.href)).not.toBeNull();
      expect(tabFor(room, `${room.href}/some-id`)).not.toBeNull();
    }
    expect(tabFor(ROOMS[2]!, '/gallery/stock')?.label).toBe('Stock');
  });

  it('puts four rooms in the pocket, and they are the ones you use in a moment', () => {
    /*
     * Call Sheet, Floor, Gallery, Wires. You approve and reply in spare
     * moments and you watch the room; you do not configure a rig on a phone.
     */
    expect(POCKET_ROOMS.map((r) => r.label)).toEqual([
      'Call Sheet',
      'The Floor',
      'Gallery',
      'Wires',
    ]);
  });

  it('points every path at a route that exists', () => {
    /*
     * Reads the App Router tree rather than trusting the list. A mistyped href
     * typechecks perfectly and 404s in production, and a nav entry with no page
     * behind it is the most visible bug a console can have — every operator
     * finds it, immediately, by clicking.
     *
     * Total since §389: all seven rooms have landed.
     */
    const root = join(__dirname, '..', '..', 'app', '(studio)');
    const hrefs = [...new Set(ROOMS.flatMap((r) => [r.href, ...r.tabs.map((t) => t.href)]))];
    const dead = hrefs.filter((href) => !existsSync(join(root, href, 'page.tsx')));
    expect(dead, 'nav links with no page behind them').toEqual([]);
  });

  it('only advertises keys on a tab that is a list to move through', () => {
    /*
     * A slate note naming `J / K` on a screen with nothing to step between is
     * the same defect as a declared-and-never-called anything: it tells an
     * operator a capability exists and then does nothing when they use it.
     *
     * Asserted structurally rather than by listing the tabs that may carry one,
     * which would be the same list written twice.
     */
    const withKeys = ROOMS.flatMap((r) => r.tabs).filter((t) => t.detail?.includes('J / K'));
    expect(withKeys.length).toBeGreaterThan(0);
    for (const tab of withKeys) {
      /* The room's own landing tab is the list; a sub-tab is a different screen. */
      expect(ROOMS.some((r) => r.href === tab.href)).toBe(true);
    }
  });

  it('leaves no built room unreachable', () => {
    /*
     * The dangerous direction. A route that exists and that nothing links to is
     * a screen an operator can only find by typing the URL, and it is the
     * failure that hides — the other direction 404s loudly the first time
     * anybody clicks it.
     *
     * Reachable means *linked from somewhere*, not merely present in `ROOMS`.
     * The tab row lists a room's sections; its drill-downs are linked from the
     * page they belong to, which is a real path down and the one an operator
     * actually takes. Checking only the nav model would report every drill-down
     * as an orphan while the room links to all of them.
     */
    const root = join(__dirname, '..', '..', 'app', '(studio)');
    if (!existsSync(root)) return;

    /** Every href written anywhere in the app, in either JSX or a data table. */
    const linked = new Set<string>(ROOMS.flatMap((r) => [r.href, ...r.tabs.map((t) => t.href)]));
    const scan = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const source = readFileSync(full, 'utf8');
          for (const m of source.matchAll(/href[=:]\s*["'`](\/[^"'`${}]*)["'`]/g)) {
            linked.add(m[1]!.replace(/\/$/, '') || '/');
          }
        }
      }
    };
    scan(join(__dirname, '..', '..'));

    const orphans: string[] = [];
    const walk = (dir: string, href: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        /* `[id]` is a drill-down, reached from its room rather than by a link. */
        if (entry.name.startsWith('[') || entry.name.startsWith('(')) continue;
        const childHref = `${href}/${entry.name}`;
        const page = join(dir, entry.name, 'page.tsx');
        if (existsSync(page) && !linked.has(childHref)) {
          /*
           * §497. An alias is not an orphan.
           *
           * `/connections` and `/accounts` exist precisely to be *typed* — they
           * are the words an operator reaches for, and they redirect to the
           * room that answers them. A page whose whole body is a redirect has
           * no screen of its own to be stranded on, which is the thing this
           * check exists to prevent. Detected from the source rather than
           * listed here, so the next alias needs no edit.
           */
          const isAlias = /redirect\(\s*['"`]\//.test(readFileSync(page, 'utf8'));
          if (!isAlias) orphans.push(childHref);
        }
        walk(join(dir, entry.name), childHref);
      }
    };
    walk(root, '');

    expect(orphans, 'pages nothing links to').toEqual([]);
  });
});
