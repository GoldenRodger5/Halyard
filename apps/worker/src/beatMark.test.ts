/**
 * §415. The motif pack reaches a frame at last.
 *
 * Two registers, four mark kinds, a stroke weight and a wobble §330 calls "the
 * single strongest signal of register" — all built in §284, all derived per
 * brand, and none of it had ever been drawn. §110 records why.
 */
import { describe, expect, it } from 'vitest';
import { markForBeat } from './beatMark.js';
import type { MotifPack } from '@halyard/render/video';

const drawn: MotifPack = {
  register: 'drawn',
  marks: ['underline', 'circle', 'arrow', 'box'],
  stroke: 3,
  wobble: 0.6,
  radius: 8,
  head: 'open',
  reason: 'a serif display face on a warm ground',
};

const precise: MotifPack = { ...drawn, register: 'precise', wobble: 0, marks: ['circle', 'underline'] };

describe('which word a beat marks', () => {
  it('marks the word the line lands on', () => {
    expect(markForBeat('Sourdough was probably a mistake', drawn)?.phrase).toBe('mistake');
  });

  it('leaves the full stop out of the mark', () => {
    /*
     * An underline that runs under the punctuation reads as marking the
     * sentence, and the sentence is not what landed.
     */
    expect(markForBeat('Sourdough was probably a mistake.', drawn)?.phrase).toBe('mistake');
    expect(markForBeat('Is it a mistake?', drawn)?.phrase).toBe('mistake');
    expect(markForBeat('It was a "mistake"', drawn)?.phrase).toBe('mistake');
  });

  it('marks nothing when no word lands', () => {
    /* Every word a stopword: underlining an arbitrary one is worse than none. */
    expect(markForBeat('it was the', drawn)).toBeNull();
    expect(markForBeat('', drawn)).toBeNull();
    expect(markForBeat('...', drawn)).toBeNull();
  });

  it('carries the product’s own hand, not a fixed one', () => {
    expect(markForBeat('a real mistake', drawn)?.wobble).toBe(0.6);
    expect(markForBeat('a real mistake', precise)?.wobble).toBe(0);
  });

  it('honours the pack’s preference between the two kinds that suit a word', () => {
    /*
     * A box around a word in running type reads as a form field and a strike
     * says the word is wrong, so only underline and circle are offered. The
     * pack's order decides between them.
     */
    expect(markForBeat('a real mistake', drawn)?.kind).toBe('underline');
    expect(markForBeat('a real mistake', precise)?.kind).toBe('circle');
  });

  it('falls back to an underline when the pack prefers neither', () => {
    const odd: MotifPack = { ...drawn, marks: ['arrow', 'box'] };
    expect(markForBeat('a real mistake', odd)?.kind).toBe('underline');
  });

  it('returns a phrase that is actually in the line, so the split can find it', () => {
    for (const line of ['Sourdough was probably a mistake.', 'Press the tofu dry', 'Bread goes stale']) {
      const mark = markForBeat(line, drawn);
      expect(line.includes(mark!.phrase), `${line} has no ${mark!.phrase}`).toBe(true);
    }
  });
});
