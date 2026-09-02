import { describe, expect, it } from 'vitest';
import { OVERUSE_RUN, readContinuity, withContinuity } from './continuity.js';

/** Eight pieces, newest first, as the account actually looks. */
const varied = [
  { framing: 'macro_detail', caption_shape: 'setup_turn' },
  { framing: 'wide_table', caption_shape: 'single' },
  { framing: 'low_hero', caption_shape: 'receipt' },
  { framing: 'overhead_flat_lay', caption_shape: 'setup_turn' },
];

describe('reading an account', () => {
  it('says nothing is over-represented when nothing is', () => {
    const c = readContinuity(varied);
    expect(c.overused).toEqual([]);
    expect(c.summary).toMatch(/^Nothing is over-represented/);
  });

  /**
   * The case the five choosers cannot see.
   *
   * `stalest` demotes what came immediately before, so a run with something in
   * the middle of it reads as varied. Three of five on one framing is a habit
   * and every individual choice that produced it was correct.
   */
  it('catches a value doing too much of the work even when it is not consecutive', () => {
    const c = readContinuity([
      { framing: 'overhead_flat_lay' },
      { framing: 'macro_detail' },
      { framing: 'overhead_flat_lay' },
      { framing: 'wide_table' },
      { framing: 'overhead_flat_lay' },
    ]);
    expect(c.overused.map((r) => r.value)).toContain('overhead_flat_lay');
    expect(c.overused[0]!.used).toBe(3);
    expect(c.overused[0]!.run).toBe(1);
  });

  it('catches a run regardless of share', () => {
    const c = readContinuity([
      { framing: 'macro_detail' },
      { framing: 'macro_detail' },
      { framing: 'macro_detail' },
      { framing: 'a' },
      { framing: 'b' },
      { framing: 'c' },
      { framing: 'd' },
      { framing: 'e' },
    ]);
    const macro = c.overused.find((r) => r.value === 'macro_detail')!;
    expect(macro.run).toBe(OVERUSE_RUN);
    /* Three of eight is under the share threshold, so the run is what caught it. */
    expect(macro.used / macro.of).toBeLessThanOrEqual(0.4);
  });

  it('reads every axis, not only the first', () => {
    const c = readContinuity([
      { framing: 'macro_detail', caption_shape: 'single' },
      { framing: 'wide_table', caption_shape: 'single' },
      { framing: 'low_hero', caption_shape: 'single' },
    ]);
    expect(c.overused.map((r) => r.axis)).toContain('caption_shape');
    expect(c.overused.map((r) => r.axis)).not.toContain('framing');
  });

  /*
   * A text post has no framing. Counting its absence would make "nothing" the
   * most over-used framing on any account that posts text, and then demote
   * every real framing to avoid it.
   */
  it('skips a piece that had no answer on an axis, rather than counting the absence', () => {
    const c = readContinuity([
      { framing: null, caption_shape: 'single' },
      { framing: undefined, caption_shape: 'receipt' },
      { framing: 'macro_detail', caption_shape: 'single' },
    ]);
    const framings = c.readings.filter((r) => r.axis === 'framing');
    expect(framings).toHaveLength(1);
    expect(framings[0]!.of).toBe(1);
  });

  it('judges a short history gently, because nothing is a habit yet', () => {
    expect(readContinuity([{ framing: 'macro_detail' }]).overused).toEqual([]);
    expect(readContinuity([]).overused).toEqual([]);
  });

  it('only looks as far back as it was asked to', () => {
    const long = Array.from({ length: 20 }, () => ({ framing: 'macro_detail' }));
    expect(readContinuity([{ framing: 'wide_table' }, ...long], 3).readings[0]!.of).toBe(3);
  });

  it('states what it found in words a person can act on', () => {
    const c = readContinuity([
      { framing: 'macro_detail' },
      { framing: 'macro_detail' },
      { framing: 'macro_detail' },
    ]);
    expect(c.summary).toMatch(/framing "macro_detail" in 3 of 3, 3 in a row/);
  });
});

describe('feeding the reading back to a chooser', () => {
  const overused = readContinuity([
    { framing: 'overhead_flat_lay' },
    { framing: 'macro_detail' },
    { framing: 'overhead_flat_lay' },
    { framing: 'wide_table' },
    { framing: 'overhead_flat_lay' },
  ]);

  it('demotes an over-represented value by putting it where "recently used" lives', () => {
    /* The chooser's own view: the last piece was a wide table, so nothing else looks recent. */
    const widened = withContinuity(['wide_table'], overused, 'framing');
    expect(widened[0]).toBe('overhead_flat_lay');
    expect(widened).toContain('wide_table');
  });

  it('does not repeat a value the chooser could already see', () => {
    const widened = withContinuity(['overhead_flat_lay', 'macro_detail'], overused, 'framing');
    expect(widened.filter((v) => v === 'overhead_flat_lay')).toHaveLength(1);
  });

  it('leaves an axis alone when nothing on it is over-represented', () => {
    const widened = withContinuity(['single', 'receipt'], overused, 'caption_shape');
    expect(widened).toEqual(['single', 'receipt']);
  });

  it('drops nulls, which is what the choosers expect', () => {
    expect(withContinuity([null, 'wide_table', undefined], overused, 'framing')).toEqual([
      'overhead_flat_lay',
      'wide_table',
    ]);
  });
});
