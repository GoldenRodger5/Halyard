import { describe, expect, it } from 'vitest';
import { loadFacts, shortWhy } from './quiz.js';

describe('shortWhy (the explanation shown on screen)', () => {
  it('keeps a short explanation whole', () => {
    const w = 'Spelt is a variety of wheat, so it contains gluten. An ancient grain is not a gluten-free one.';
    expect(shortWhy(w)).toBe(w);
  });
  it('keeps only the first sentence of a long one', () => {
    const w =
      'A US federal rule defines gelatin as made from the hides, connective tissue and bones of cattle and swine. Agar-agar is a plant-based gelling swap that sets firmer and at room temperature.';
    expect(shortWhy(w)).toBe('A US federal rule defines gelatin as made from the hides, connective tissue and bones of cattle and swine.');
  });
  it('never returns an empty line for any fact in the bank', () => {
    const facts = loadFacts();
    expect(facts.length).toBeGreaterThan(40);
    for (const f of facts) expect(shortWhy(f.why).split(/\s+/).length).toBeGreaterThan(3);
  });
});
