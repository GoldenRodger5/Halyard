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
export function markForBeat(
  text: string,
  motif: MotifPack,
  /**
   * §446. Phrases the screenplay asked to be marked, in the piece's own words.
   *
   * The screenwriter names *what to point at* rather than where — resolving a
   * label to something drawable is this side's job, and a screenplay carrying
   * word offsets would be a screenplay that had to know how the line renders.
   *
   * A target is honoured only if it actually appears in this line. A phrase the
   * screenplay named for a different beat, or shortened for the screen, must
   * not silently mark the nearest word instead: that is a mark pointing at
   * something nobody chose, which is worse than none. Falls through to the
   * emphasis word, which is what an undirected beat gets.
   */
  targets?: readonly string[],
): BeatMark | null {
  const words = text.trim().split(/\s+/).filter(Boolean);

  const bare = (w: string) =>
    w.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '').toLowerCase();

  for (const target of targets ?? []) {
    const wanted = bare(target);
    if (wanted.length === 0) continue;
    /* A single word from the line, matched exactly rather than by inclusion. */
    const found = words.findIndex((w) => bare(w) === wanted);
    if (found !== -1) return drawMark(words[found]!, motif);
    /*
     * A multi-word target: mark its last word, which is where a phrase lands.
     * Marking every word of a phrase is a highlighter, not a gesture.
     */
    const parts = wanted.split(/\s+/);
    if (parts.length > 1) {
      const last = parts[parts.length - 1]!;
      const at = words.findIndex((w) => bare(w) === last);
      if (at !== -1) return drawMark(words[at]!, motif);
    }
  }

  const at = emphasisWordFor(text);
  if (at === undefined) return null;

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
  return drawMark(raw, motif);
}

/** One word, drawn in the product's hand. */
function drawMark(raw: string, motif: MotifPack): BeatMark | null {
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
