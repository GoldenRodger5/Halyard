/**
 * §484. Lines become one spoken script without running into each other.
 *
 * A format's narration is a list of lines, each placed on the composition's
 * clock. The record of what was said — `vo_script`, which the audio gate
 * transcribes against and the lexicon reads — was those lines joined with a
 * space, so a title with no full stop ran straight into the first tip:
 *
 *   "Keep Herbs Alive Two Weeks Trim the stems, stand herbs in an inch…"
 *
 * That is a different sentence from the one on screen, and a transcript of
 * the mix compared against it counts the seam as an error. Every line ends a
 * sentence when it is spoken, so every line ends one here.
 */
const ENDS_A_SENTENCE = /[.!?…"”’)]$/;

export function joinSpoken(lines: readonly string[]): string {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (ENDS_A_SENTENCE.test(line) ? line : `${line}.`))
    .join(' ');
}
