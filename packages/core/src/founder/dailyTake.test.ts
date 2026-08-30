import { describe, expect, it } from 'vitest';
import { opinionPreserved } from './dailyTake.js';


/**
 * §377. The Daily Take exists so the opinion is the operator's. A draft that
 * comes back fluent, verified and entirely generic is the failure that matters,
 * and `opinionPreserved` was written for it and called by nothing.
 */
describe('whether the draft still carries what you said', () => {
  it('recognises a draft that kept the claim', () => {
    const verdict = opinionPreserved(
      'Gluten-free bread fails because people swap flours without changing hydration.',
      'Most gluten-free bread fails on hydration, not on flour. Swapping the flour without changing the water is the actual mistake.',
    );
    expect(verdict.preserved).toBe(true);
    expect(verdict.overlap).toBeGreaterThan(0.3);
  });

  it('catches a draft that sanded the opinion off', () => {
    /*
     * Fluent, publishable, and about nothing the operator said. This is what
     * publishes under their name if nobody looks.
     */
    const verdict = opinionPreserved(
      'Gluten-free bread fails because people swap flours without changing hydration.',
      'Baking is a craft that rewards patience. Every loaf teaches you something new about the process.',
    );
    expect(verdict.preserved).toBe(false);
    expect(verdict.note).toContain('sand the opinion off');
  });

  it('does not complain when there was nothing to compare', () => {
    expect(opinionPreserved('', 'anything at all').preserved).toBe(true);
  });

  it('ignores the words every sentence has', () => {
    /*
     * "this", "that", "with", "from" would otherwise carry a generic draft over
     * the threshold on function words alone.
     */
    const verdict = opinionPreserved(
      'This is that thing with those from them.',
      'Completely unrelated prose about baking bread.',
    );
    expect(verdict.overlap).toBeLessThan(0.3);
  });
});
