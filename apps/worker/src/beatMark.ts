/**
 * §415. Which word a beat marks, and in whose hand.
 *
 * The motif pack has existed since §284 and had never appeared in a rendered
 * frame: `<Annotations>` is rendered nowhere, `annotationForPhrase` has no
 * callers, and where the annotation director does run its `kind`, stroke and
 * wobble are discarded and only its yes/no survives (§110).
 *
 * Decided here rather than in the composition, for §394's reason — a React
 * component runs in a browser bundle and cannot read a brand — and extracted
 * from the handler so the choice can be tested without rendering a video.
 */
import { emphasisWordFor } from '@halyard/core';
import type { MotifPack } from '@halyard/render/video';

export interface BeatMark {
  phrase: string;
  kind: 'underline' | 'circle';
  wobble: number;
  stroke: number;
}

/**
 * The mark for one line, or null when there is nothing worth marking.
 *
 * Null is a real answer. A line whose every word is a stopword — "and then it
 * did" — has no word that lands, and underlining an arbitrary one is worse than
 * clean type.
 */
export function markForBeat(text: string, motif: MotifPack): BeatMark | null {
  const at = emphasisWordFor(text);
  if (at === undefined) return null;

  const words = text.trim().split(/\s+/).filter(Boolean);
  const raw = words[at];
  if (!raw) return null;

  /*
   * Trailing punctuation is dropped from the mark but not from the line. An
   * underline that runs under the full stop reads as marking the sentence
   * rather than the word, and the sentence is not what landed.
   *
   * Leading punctuation goes too — an opening quote or bracket is not part of
   * the word either.
   */
  const phrase = raw.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
  if (phrase.length === 0) return null;

  return {
    phrase,
    /*
     * The pack lists its marks in preference order, and only two of the four
     * make sense on a word in a headline: a box around a word in running type
     * reads as a form field, and a strike says the word is wrong. The pack's
     * own preference decides between the two that do.
     */
    kind: motif.marks.indexOf('circle') !== -1 &&
      (motif.marks.indexOf('underline') === -1 ||
        motif.marks.indexOf('circle') < motif.marks.indexOf('underline'))
      ? 'circle'
      : 'underline',
    wobble: motif.wobble,
    stroke: motif.stroke,
  };
}
