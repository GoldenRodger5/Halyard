/**
 * §441. The screenplay vocabulary, restated in this bundle and held to core's.
 *
 * `narrative.tsx` declares `SCENE_MOVES` and `formatVideo.ts` declares
 * `SceneDirection`, both mirroring types in `@halyard/core`. They cannot import
 * them: gotcha 10, this package is webpacked for the browser by Remotion and
 * the core barrel reaches `node:crypto`.
 *
 * A duplicated list is gotcha 1, and gotcha 1's answer is not "do not
 * duplicate" — sometimes you must — it is **guard the duplicate with a test**.
 * A move added to the screenplay and not to the grammar renders as the default
 * push, silently, on the beat that asked for something else.
 */
import { describe, expect, it } from 'vitest';
import { MOVES, SCENE_WEIGHTS, GROUNDS } from '@halyard/core';
import { MOVE_GRAMMAR, SCENE_MOVES } from './narrative.js';

describe('the render bundle knows every move the screenplay can ask for', () => {
  it('has the same moves as core, in the same order', () => {
    expect([...SCENE_MOVES]).toEqual([...MOVES]);
  });

  it('gives every move a camera grammar', () => {
    for (const move of MOVES) {
      expect(MOVE_GRAMMAR[move as (typeof SCENE_MOVES)[number]], move).toBeDefined();
    }
  });

  it('gives every move a distinct one, so no two names mean the same thing', () => {
    const shapes = Object.values(MOVE_GRAMMAR).map((g) => `${g.from}/${g.to}/${g.panX}`);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  /*
   * `hold` is the one direction whose whole value is that nothing happens. A
   * grammar that quietly gave it a push would make "hold this so it can be
   * read" indistinguishable from every other beat — which is the state this
   * work exists to leave.
   */
  it('actually holds on hold', () => {
    expect(MOVE_GRAMMAR.hold.from).toBe(MOVE_GRAMMAR.hold.to);
    expect(MOVE_GRAMMAR.hold.panX).toBe(0);
  });

  it('covers every weight the screenplay can assign', () => {
    /* The mapping lives in formatVideo; this asserts the vocabulary matches. */
    expect([...SCENE_WEIGHTS].sort()).toEqual(['aside', 'lead', 'support']);
  });

  it('knows every ground, so a new one cannot be silently ignored', () => {
    /*
     * `SceneDirection.ground` is a union restated in formatVideo.ts. If core
     * grows a ground this fails, which is the point: only `colour` currently
     * changes what the worker does, and a new ground needs a decision rather
     * than a default.
     */
    expect([...GROUNDS].sort()).toEqual(['colour', 'footage', 'photograph', 'product_capture']);
  });
});
