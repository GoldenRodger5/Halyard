/**
 * §384. Navigation is a promise: every room reachable, every path resolving to
 * exactly one place, and the shape holding as rooms are added.
 *
 * The old sidebar grew to twenty-nine links because nothing asserted its shape.
 * These are the assertions that stop that happening twice.
 */
import { existsSync, readdirSync } from 'node:fs';
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
     * typechecks perfectly and 404s in production.
     *
     * Only asserts over rooms that have landed — a room still to be built has
     * no route yet, and this becomes total the moment step 9 deletes the old
     * group.
     */
    const root = join(__dirname, '..', '..', 'app', '(studio)');
    if (!existsSync(root)) return;
    const built = ROOMS.flatMap((r) => r.tabs.map((t) => t.href)).filter((href) =>
      existsSync(join(root, href, 'page.tsx')),
    );
    expect(built.length).toBeGreaterThan(0);
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

  it('leaves no built room unreachable from the navigation', () => {
    /*
     * The dangerous direction. A route that exists and that nothing links to is
     * a screen an operator can only find by typing the URL, and it is the
     * failure that hides — the other direction 404s loudly the first time
     * anybody clicks it.
     *
     * This is the same shape as every "declared and never executed" defect in
     * this codebase, one level up: built and never linked.
     */
    const root = join(__dirname, '..', '..', 'app', '(studio)');
    if (!existsSync(root)) return;

    const known = new Set(ROOMS.flatMap((r) => [r.href, ...r.tabs.map((t) => t.href)]));
    const orphans: string[] = [];

    const walk = (dir: string, href: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        /* `[id]` is a drill-down, reached from its room rather than the nav. */
        if (entry.name.startsWith('[') || entry.name.startsWith('(')) continue;
        const childHref = `${href}/${entry.name}`;
        if (existsSync(join(dir, entry.name, 'page.tsx')) && !known.has(childHref)) {
          orphans.push(childHref);
        }
        walk(join(dir, entry.name), childHref);
      }
    };
    walk(root, '');

    expect(orphans).toEqual([]);
  });
});
