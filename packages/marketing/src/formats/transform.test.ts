import { describe, expect, it } from 'vitest';
import { atPath, loadTransforms, readTransform, wordDiff, type TransformSpec } from './transform.js';

const kinds = (segs: Array<{ text: string; kind: string }>, k: string) => segs.filter((s) => s.kind === k).map((s) => s.text);

describe('wordDiff', () => {
  it('marks exactly the words the fixed step added, and the kept number', () => {
    const d = wordDiff(['spread it on a foil-lined baking sheet', 'Broil for 8 to 10 minutes'], ['single uncrowded layer on two foil-lined baking sheets', 'broil one sheet at a time for 8 to 10 minutes'], '8 to 10 minutes');
    expect(kinds(d.after, 'ins')).toEqual(['single uncrowded layer', 'two', 'sheets', 'one sheet at a time']);
    expect(kinds(d.before, 'del')).toEqual(['spread it', 'a', 'sheet']);
    expect(kinds(d.before, 'keep')).toEqual(['8 to 10 minutes']);
    expect(kinds(d.after, 'keep')).toEqual(['8 to 10 minutes']);
  });

  // An excerpt that starts later than its counterpart makes the diff strike words the
  // fixed step still says ("spread" above). The shipped spec must strike only real changes.
  it('the shipped spec strikes only what really changed', () => {
    const t = loadTransforms().find((x) => x.id === 'tikka-dairy-free')!;
    const d = wordDiff(t.step.before, t.step.after, t.step.keep);
    expect(kinds(d.before, 'del')).toEqual(['it', 'a', 'sheet']);
    expect(kinds(d.after, 'ins')).toEqual(['in a single uncrowded layer', 'two', 'sheets', 'one sheet at a time']);
  });

  it('refuses a keep phrase that changed', () => {
    expect(() => wordDiff(['bake 20 minutes'], ['bake 25 minutes'], '20 minutes')).toThrow(/keep phrase/);
  });
});

describe('readTransform guards (real stored result)', () => {
  const base = () => structuredClone(loadTransforms().find((t) => t.id === 'tikka-dairy-free')!) as TransformSpec;

  it('reads the tikka result', () => {
    const c = readTransform(base());
    expect(c.capturedOn).toBe('2026-10-21');
    expect(c.servings).toEqual({ from: 4, to: 6 });
    expect(c.swaps.map((s) => s.from)).toEqual(['3/4 cup plain whole-milk yogurt', '2 tablespoons butter', '1/2 cup heavy cream']);
  });

  it('refuses a reason that is not in the stored changeReason', () => {
    const s = base();
    s.swaps[0]!.why = 'Coconut yogurt is a healthier marinade';
    expect(() => readTransform(s)).toThrow(/verbatim/);
  });

  it('refuses a step excerpt that is not in the stored instruction', () => {
    const s = base();
    s.step.after[1] = 'broil one sheet at a time for 12 minutes';
    expect(() => readTransform(s)).toThrow(/verbatim/);
  });

  it('refuses a tip number its source lacks', () => {
    const s = base();
    s.tips[0] = { text: 'Broil 12 minutes per sheet.', from: 'steps[4].instruction' };
    expect(() => readTransform(s)).toThrow(/12/);
  });

  it('refuses a scaled-only line as a swap', () => {
    const s = base();
    s.swaps[0]!.ingredient = 0;
    expect(() => readTransform(s)).toThrow();
  });

  it('atPath reads nested strings and refuses non-strings', () => {
    expect(atPath({ a: [{ b: 'x' }] }, 'a[0].b')).toBe('x');
    expect(() => atPath({ a: 1 }, 'a')).toThrow();
  });
});
