/**
 * §252. A beat field that is not a string never reaches the renderer.
 *
 * A production render died on `Minified React error #31` — an object with
 * keys `{adapted, stepNote, tradeoff, replaceTerm}` passed as a React child.
 * The connector had returned a structured swap where the planner expected a
 * line of text, and every layer between carried it: the plan *types* it as
 * `string | undefined` and nothing checked at runtime, so the first thing to
 * object was React, minified, three retries deep, on the deployed worker.
 *
 * Types do not survive a JSON boundary. This is the runtime check.
 */
import { describe, expect, it } from 'vitest';
import { beatsForRender } from './handlers/generate.js';
import type { CreativePlan } from '@halyard/core';

function planWith(content: Record<string, unknown>): CreativePlan {
  return {
    creativeType: 'before_after',
    platform: 'tiktok',
    format: 'video',
    targetSeconds: 24,
    captionBackdrop: 'surface',
    evidence: [],
    rationale: 'test',
    beats: [
      { id: 'b1', role: 'hook', emphasis: 'hold', content: { text: 'A line' } },
      { id: 'b2', role: 'change', emphasis: 'normal', content: content as never },
    ],
  } as unknown as CreativePlan;
}

function contentOf(plan: CreativePlan): Record<string, unknown> {
  return (beatsForRender(plan)[1] as { content: Record<string, unknown> }).content;
}

describe('beat content reaching the renderer', () => {
  it('keeps strings', () => {
    const c = contentOf(planWith({ before: 'bread flour', after: 'gluten-free blend' }));
    expect(c.before).toBe('bread flour');
    expect(c.after).toBe('gluten-free blend');
  });

  it('salvages a usable string out of an object rather than dropping the beat', () => {
    /*
     * The exact shape production produced. `adapted` is the line a person
     * would have written, so it is used; discarding the whole field would
     * render a transformation card with no "after".
     */
    const c = contentOf(
      planWith({
        before: 'bread flour',
        after: {
          adapted: 'half a cup of gluten-free oat breadcrumbs',
          stepNote: 'divided',
          tradeoff: 'slightly denser',
          replaceTerm: 'breadcrumbs',
        },
      }),
    );
    expect(typeof c.after).toBe('string');
    expect(c.after).toContain('gluten-free oat breadcrumbs');
  });

  it('drops an object with nothing sayable in it', () => {
    // A partial card is a worse render; a card carrying an object is no
    // render at all, because React refuses the whole tree.
    const c = contentOf(planWith({ before: 'a', after: { tradeoff: 1, nested: { x: 2 } } }));
    expect(c.after).toBeUndefined();
    expect(c.before).toBe('a');
  });

  it('drops arrays, which render as concatenated nonsense', () => {
    const c = contentOf(planWith({ reason: ['one', 'two'] }));
    expect(c.reason).toBeUndefined();
  });

  it('keeps a number, because index is legitimately one', () => {
    const c = contentOf(planWith({ text: 'x', index: 3 }));
    expect(c.index).toBe(3);
  });

  it('leaves an absent field absent rather than inventing one', () => {
    const c = contentOf(planWith({ text: 'only text' }));
    expect(c.after).toBeUndefined();
    expect(c.text).toBe('only text');
  });

  it('never emits a non-primitive for any field, whatever arrives', () => {
    /*
     * The invariant, stated once. Anything that survives this function is
     * something React can render.
     */
    const c = contentOf(
      planWith({
        text: { a: 1 },
        reason: [1, 2],
        before: null,
        after: { adapted: 'fine' },
        label: 42,
      }),
    );
    for (const [key, value] of Object.entries(c)) {
      expect(
        value === undefined || typeof value === 'string' || typeof value === 'number',
        `${key} is ${typeof value}`,
      ).toBe(true);
    }
  });
});
