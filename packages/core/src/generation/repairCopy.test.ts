import { describe, expect, it } from 'vitest';
import { describeRepairs, repairCopy } from './repairCopy.js';
import { slopFilter } from '../qc/slopFilter.js';

const gate = (body: string) =>
  slopFilter({ body, platform: 'tiktok', hashtags: [] }).errors.map((e) => e.rule);

describe('mechanical copy repair', () => {
  it('does nothing, and says nothing, to copy that needs nothing', () => {
    const clean = 'Salt slows yeast on purpose. That is why the timing changes.';
    const out = repairCopy(clean);
    expect(out.body).toBe(clean);
    expect(out.repairs).toEqual([]);
    expect(describeRepairs(out.repairs)).toBe('');
  });

  /**
   * The case that lost a whole piece. A history filled all five slots with zero
   * warnings and was discarded because its caption failed the copy gate three
   * times — the content was fine and the wrapper was not.
   */
  it('turns copy the gate refuses into copy it accepts', () => {
    const refused = 'Salt slows yeast — on purpose — and that changes the timing.';
    expect(gate(refused)).toContain('punctuation.em_dash');
    expect(gate(repairCopy(refused).body)).not.toContain('punctuation.em_dash');
  });

  it('replaces an em dash with the comma it stands for, not a hyphen', () => {
    /* A hyphen would read as a compound word: "yeast-on purpose". */
    expect(repairCopy('Salt slows yeast — on purpose.').body).toBe(
      'Salt slows yeast, on purpose.',
    );
  });

  it('straightens quotes and apostrophes', () => {
    expect(repairCopy('It’s the “right” way.').body).toBe('It\'s the "right" way.');
  });

  it('expands an ellipsis character and kills a non-breaking space', () => {
    expect(repairCopy('Wait… for it').body).toBe('Wait... for it');
    expect(repairCopy('two words').body).toBe('two words');
  });

  it('tidies the spacing its own substitutions leave behind', () => {
    expect(repairCopy('One — , two').body).not.toMatch(/, ,| {2}/);
  });

  it('repairs hashtags too, because a curly apostrophe is a different tag', () => {
    expect(repairCopy('body', ['Baker’sTip', 'Two Words']).hashtags).toEqual([
      "Baker'sTip",
      'TwoWords',
    ]);
  });

  /**
   * The line this must not cross. These are judgements about *writing* and a
   * regex doing a copywriter's job badly is worse than a retry.
   */
  it('never rewrites a banned phrase, a hype word or a claim', () => {
    const judgements = [
      'This is more than just a recipe swap.',
      'A revolutionary game changer for your kitchen.',
      'Whether you are baking or not, this matters.',
    ];
    for (const text of judgements) {
      expect(repairCopy(text).body, text).toBe(text);
      expect(repairCopy(text).repairs, text).toEqual([]);
    }
  });

  it('never changes what a sentence says', () => {
    const before = 'Salt slows yeast — on purpose — and “that” changes it…';
    const words = (t: string) => t.toLowerCase().match(/[a-z]+/g) ?? [];
    expect(words(repairCopy(before).body)).toEqual(words(before));
  });

  it('names every repair it made', () => {
    const out = repairCopy('It’s here — now…');
    expect(out.repairs.map((r) => r.rule)).toContain('punctuation.em_dash');
    expect(out.repairs.map((r) => r.rule)).toContain('punctuation.curly_quote');
    for (const repair of out.repairs) expect(repair.because.length).toBeGreaterThan(20);
    expect(describeRepairs(out.repairs)).toMatch(/^Repaired /);
  });
});
