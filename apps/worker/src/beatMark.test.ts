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

/**
 * §446. The screenplay decides which beats earn a mark.
 *
 * `markForBeat` drew one on the last non-stopword of every line, on every beat
 * — which is precisely what a mark exists to avoid. The screenwriter's own
 * brief says *"a gesture is earned, not decorative… most scenes have none. Two
 * marks at once point at neither."* Measured live: gestures on one scene of
 * four, circles on all four.
 */
describe('a mark the screenplay asked for', () => {
  const motif = { register: 'drawn' as const, marks: ['circle', 'underline'], wobble: 0.3, stroke: 6, reason: 'test' };

  it('marks the phrase the screenplay named, not the word the rule would pick', () => {
    const line = 'Searing does not seal in any juices at all';
    const mechanical = markForBeat(line, motif as never)!;
    const directed = markForBeat(line, motif as never, ['searing'])!;
    expect(directed.phrase).toBe('Searing');
    expect(mechanical.phrase).not.toBe('Searing');
  });

  it('marks the last word of a multi-word target, not every word of it', () => {
    const mark = markForBeat('The Maillard reaction is what browns it', motif as never, [
      'Maillard reaction',
    ])!;
    expect(mark.phrase).toBe('reaction');
  });

  /*
   * The screenwriter may shorten a line for the screen, so a target can name
   * something this beat does not contain. Marking the nearest word instead
   * would point at something nobody chose.
   */
  it('falls through to the emphasis word when the target is not in this line', () => {
    const line = 'Searing does not seal in any juices';
    expect(markForBeat(line, motif as never, ['thermometer'])!.phrase).toBe(
      markForBeat(line, motif as never)!.phrase,
    );
  });

  it('ignores an empty target rather than marking the first word', () => {
    const line = 'Searing does not seal in any juices';
    expect(markForBeat(line, motif as never, ['', '   '])!.phrase).toBe(
      markForBeat(line, motif as never)!.phrase,
    );
  });

  it('takes the first target it can actually find', () => {
    const line = 'Searing does not seal in any juices';
    expect(markForBeat(line, motif as never, ['nowhere', 'seal'])!.phrase).toBe('seal');
  });
});
