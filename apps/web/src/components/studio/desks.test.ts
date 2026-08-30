/**
 * §387. The floor claims to show every part of a production. A stage with no
 * desk is a stage that happens invisibly, which is the one thing this screen
 * exists to prevent.
 */
import { describe, expect, it } from 'vitest';
/*
 * `STAGE_ORDER` is imported here rather than in `desks.ts`, which is reached
 * from a client component and must not touch the core barrel — §-gotcha-10.
 */
import { STAGE_ORDER } from '@halyard/core';
import { DESKS, WIRES, deskForStage } from './desks';

const ALL_STAGES: readonly string[] = STAGE_ORDER;

describe('the floor’s desks', () => {
  it('seats every production stage at a desk', () => {
    // §-gotcha-1's shape: two lists that must agree, written apart.
    expect(ALL_STAGES.filter((s) => deskForStage(s) === null)).toEqual([]);
  });

  it('seats no stage at two desks', () => {
    const seen = new Map<string, string>();
    for (const desk of DESKS) {
      for (const stage of desk.stages) {
        expect(seen.get(stage), `${stage} is at two desks`).toBeUndefined();
        seen.set(stage, desk.id);
      }
    }
  });

  it('claims no stage the production does not run', () => {
    // The inverse. A desk waiting on a stage that never fires never lights up.
    const real = new Set(ALL_STAGES);
    for (const desk of DESKS) {
      for (const stage of desk.stages) expect(real.has(stage), stage).toBe(true);
    }
  });

  it('keeps stages at a desk in production order', () => {
    /*
     * A desk's own stages have to run in the order the production runs them,
     * or the desk's progress reads backwards.
     */
    for (const desk of DESKS) {
      const order = desk.stages.map((s) => ALL_STAGES.indexOf(s));
      expect([...order].sort((a, b) => a - b), desk.id).toEqual(order);
    }
  });

  it('gives every desk a short name that identifies it', () => {
    /*
     * The phone's map strip has room for one word. Deriving it from the name
     * gave "The" for The Critic, which names nothing — so it is written, and
     * every one has to be distinct and not an article.
     */
    const shorts = DESKS.map((d) => d.short);
    expect(new Set(shorts).size).toBe(DESKS.length);
    for (const s of shorts) {
      expect(s.split(' ')).toHaveLength(1);
      expect(['The', 'A', 'An']).not.toContain(s);
    }
  });

  it('gives every desk a distinct place and its bubble directly above it', () => {
    const places = new Set(DESKS.map((d) => `${d.at.left}/${d.at.top}`));
    expect(places.size).toBe(DESKS.length);
    for (const desk of DESKS) {
      // Above, never beside: two bubbles at the same height can collide.
      expect(parseFloat(desk.bubble.top), desk.id).toBeLessThan(parseFloat(desk.at.top));
    }
  });

  it('wires every desk to the next one, and none to itself', () => {
    expect(WIRES).toHaveLength(DESKS.length - 1);
    for (const [from, to] of WIRES) expect(from).not.toBe(to);
    expect(WIRES.map(([f]) => f)).toEqual(DESKS.slice(0, -1).map((d) => d.id));
  });
});
