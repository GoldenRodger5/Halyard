import { describe, expect, it } from 'vitest';
import type { TranscriptWord } from '@halyard/render/timing';
import { alignToScript } from './captions.js';

/**
 * §145. Every case here comes from one real render.
 *
 * The frame at 9.56 seconds read "Keep the rice short, 60 to 90 minutes."
 * The script said "Keep the rise short, sixty to ninety minutes." Whisper is
 * the only source of timing and a poor source of spelling; this keeps each.
 */
describe('alignToScript', () => {
  const at = (text: string, startSeconds: number, endSeconds: number): TranscriptWord => ({
    text,
    startSeconds,
    endSeconds,
  });

  it('shows the word that was written, not the word that was heard', () => {
    const heard = [
      at('Keep', 0, 0.3),
      at('the', 0.3, 0.5),
      at('rice', 0.5, 0.9),
      at('short', 0.9, 1.3),
    ];
    const out = alignToScript(heard, 'Keep the rise short');

    expect(out.map((w) => w.text)).toEqual(['Keep', 'the', 'rise', 'short']);
    // The mishearing still supplies the clock — that is what whisper is for.
    expect(out[2]!.startSeconds).toBe(0.5);
    expect(out[2]!.endSeconds).toBe(0.9);
  });

  it('spells numerals the way the script spells them', () => {
    const heard = [
      at('60', 0, 0.4),
      at('to', 0.4, 0.5),
      at('90', 0.5, 0.9),
      at('minutes', 0.9, 1.4),
    ];
    const out = alignToScript(heard, 'sixty to ninety minutes');

    expect(out.map((w) => w.text)).toEqual(['sixty', 'to', 'ninety', 'minutes']);
  });

  it('lines a single spoken numeral up with the several words it stands for', () => {
    const heard = [
      at('Bake', 0, 0.4),
      at('at', 0.4, 0.5),
      at('450', 0.5, 1.4),
      at('degrees', 1.4, 2),
    ];
    const out = alignToScript(heard, 'Bake at four hundred fifty degrees');

    expect(out.map((w) => w.text)).toEqual(['Bake', 'at', 'four', 'hundred', 'fifty', 'degrees']);
    // The three words share the span the numeral occupied, in order.
    expect(out[2]!.startSeconds).toBeCloseTo(0.5, 2);
    expect(out[4]!.endSeconds).toBeCloseTo(1.4, 2);
    expect(out[2]!.startSeconds).toBeLessThan(out[4]!.startSeconds);
  });

  it('keeps a word whisper never heard rather than dropping it from the caption', () => {
    const heard = [at('Let', 0, 0.3), at('cool', 0.3, 0.8)];
    const out = alignToScript(heard, 'Let it cool');

    expect(out.map((w) => w.text)).toEqual(['Let', 'it', 'cool']);
  });

  it('preserves the script punctuation the caption is read with', () => {
    const heard = [at('not', 0, 0.3), at('shaggy', 0.3, 0.7), at('dough', 0.7, 1.1)];
    const out = alignToScript(heard, 'not shaggy dough.');

    expect(out[2]!.text).toBe('dough.');
  });

  it('leaves the words alone when there is no script to anchor to', () => {
    const heard = [at('unanchored', 0, 0.5)];
    expect(alignToScript(heard, '   ')).toEqual(heard);
  });
});
