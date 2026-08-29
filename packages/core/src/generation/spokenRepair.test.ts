/**
 * §287. Fix it, rather than ask again and hope.
 *
 * A YouTube piece failed its voiceover three times and was abandoned, and all
 * three failures were identical: `spoken.unspoken_symbol` on "1/4". The loop
 * named the rule, quoted the excerpt and supplied the fix each time, and
 * changed nothing — because the prompt opens with the body being narrated and
 * that body says "1/4 cup".
 *
 * These assert the repair, and the boundary of it: a transformation with one
 * correct answer belongs in code, and anything requiring judgement does not.
 */
import { describe, expect, it } from 'vitest';
import { canRepair, repairSpoken } from './spokenRepair.js';
import { slopFilter } from '../qc/slopFilter.js';

describe('repairing a line so it can be spoken', () => {
  it('fixes the exact text that abandoned a production piece', () => {
    /* Verbatim from the item that failed three times. */
    const body =
      'In this bake, 1/4 cup wheat flour changes to 1/4 cup cornstarch for gravy because it thickens as it simmers.';
    const { text } = repairSpoken(body);
    expect(text).not.toMatch(/\d\/\d/);
    expect(text).toContain('a quarter cup');

    /* And the rule that failed no longer fires on it. */
    const after = slopFilter({ body: text, platform: 'youtube', hashtags: [], spoken: true });
    expect(after.errors.map((e) => e.rule)).not.toContain('spoken.unspoken_symbol');
  });

  it('spells the fractions a recipe actually uses', () => {
    expect(repairSpoken('1/2 cup').text).toBe('half cup');
    expect(repairSpoken('3/4 tsp').text).toBe('three quarters tsp');
    expect(repairSpoken('2/3 of it').text).toBe('two thirds of it');
  });

  it('spells degrees and percent', () => {
    expect(repairSpoken('Bake at 450°F.').text).toContain('450 degrees');
    expect(repairSpoken('About 20% more.').text).toContain('20 percent');
  });

  it('reads a mixed number as one quantity, not two', () => {
    /* "1 1/2" repaired naively becomes "1 half", which is a different amount. */
    expect(repairSpoken('1 1/2 cups').text).toBe('1 and a half cups');
  });

  it('changes nothing in a line that was already speakable', () => {
    const clean = 'Pulse only until the mixture clumps together.';
    const { text, changes } = repairSpoken(clean);
    expect(text).toBe(clean);
    expect(changes).toHaveLength(0);
  });

  it('preserves the meaning, which is what makes it safe to do in code', () => {
    /* A repair that changed the instruction would be an unreviewed edit. */
    const { text } = repairSpoken('Use 1/4 cup and bake at 350°F for 20 minutes.');
    expect(text).toContain('cup');
    expect(text).toContain('350 degrees');
    expect(text).toContain('20 minutes');
  });

  it('reports what it changed, so the log can say why an attempt was not spent', () => {
    const { changes } = repairSpoken('1/4 cup at 350°F');
    expect(changes.length).toBeGreaterThanOrEqual(2);
  });

  it('refuses to claim sentence length as mechanically fixable', () => {
    /*
     * The boundary. Splitting a sentence changes emphasis and rhythm, which is
     * writing — a machine breaking at the nearest comma produces something
     * worse than the model would. That one still goes back to the writer.
     */
    expect(canRepair('spoken.unspoken_symbol')).toBe(true);
    expect(canRepair('spoken.sentence_too_long')).toBe(false);
    expect(canRepair('spoken.parenthetical')).toBe(false);
  });

  it('leaves a long sentence long, so the model is still asked about it', () => {
    const long =
      'In this bake, 1/4 cup wheat flour changes to 1/4 cup cornstarch for gravy because it thickens as it simmers.';
    const after = slopFilter({
      body: repairSpoken(long).text,
      platform: 'youtube',
      hashtags: [],
      spoken: true,
    });
    /* The symbol is gone; the length is not, and that is correct. */
    expect(after.errors.map((e) => e.rule)).toContain('spoken.sentence_too_long');
  });
});
