/**
 * Caption text that says what the script says, at the times whisper heard.
 *
 * §145. This lives in the worker rather than in `@halyard/render` on purpose.
 * `timing.ts` is bundled by Remotion's webpack build for the browser, and the
 * numeral speller it needs comes from `@halyard/core`, whose barrel reaches
 * `node:crypto`. Importing it there builds cleanly, typechecks cleanly, and
 * fails at render time with "UnhandledSchemeError: Reading from node:crypto".
 * Alignment is worker-side preparation, not a rendering concern, so it belongs
 * on this side of that boundary.
 */
import { numberToWords } from '@halyard/core';
import type { TranscriptWord } from '@halyard/render/timing';

/**
 * Put the *script's* words on screen, at the times the speech actually landed.
 *
 * §145. Found by watching a real render. Caption text was taken verbatim from
 * whisper, so every transcription error was burned into the video: a frame at
 * 9.56s read "Keep the rice short, 60 to 90 minutes" where the script says
 * "Keep the rise short, sixty to ninety minutes". The audio gate catches the
 * mishearing as a word error, but the wrong word is already on the picture by
 * then, and the numerals are not errors at all — whisper simply writes digits.
 *
 * The script is ground truth and the transcript is not. Whisper is here for
 * *timing*, which is the one thing the script cannot supply. So this aligns the
 * two and keeps each side's contribution: the script's spelling, whisper's
 * clock.
 *
 * Unmatched script words inherit the neighbouring span rather than vanishing —
 * a caption that silently drops a word is the failure this is meant to prevent.
 */
export function alignToScript(words: TranscriptWord[], script: string): TranscriptWord[] {
  const display = script
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (display.length === 0 || words.length === 0) return words;

  // Numerals are expanded on both sides so "450" lines up with "four hundred
  // fifty" as three tokens rather than one, which is what the aligner needs.
  const heard = words.flatMap((word) => expandNumerals(word));
  const said = display.map((token, index) => ({
    token,
    index,
    keys: comparisonKeys(token),
  }));

  const ref = said.flatMap((s) => s.keys.map(() => s.index));
  const refKeys = said.flatMap((s) => s.keys);
  const hypKeys = heard.map((h) => h.key);

  const pairs = alignSequences(refKeys, hypKeys);

  // Each script word takes the span covering every heard token it matched.
  const spans = new Map<number, { start: number; end: number }>();
  for (const [r, h] of pairs) {
    const wordIndex = ref[r]!;
    const span = heard[h]!;
    const existing = spans.get(wordIndex);
    spans.set(wordIndex, {
      start: existing ? Math.min(existing.start, span.startSeconds) : span.startSeconds,
      end: existing ? Math.max(existing.end, span.endSeconds) : span.endSeconds,
    });
  }

  const out: TranscriptWord[] = [];
  let lastEnd = words[0]!.startSeconds;
  for (const { token, index } of said) {
    const span = spans.get(index);
    if (span) {
      out.push({ text: token, startSeconds: span.start, endSeconds: span.end });
      lastEnd = span.end;
    } else {
      // Never heard, so it has no clock of its own. It rides the previous
      // word's end rather than being dropped from the caption.
      out.push({ text: token, startSeconds: lastEnd, endSeconds: lastEnd });
    }
  }
  return out;
}

/** A word, plus its numeral expansion, each piece carrying a slice of the span. */
function expandNumerals(
  word: TranscriptWord,
): Array<{ key: string; startSeconds: number; endSeconds: number }> {
  const keys = comparisonKeys(word.text);
  if (keys.length <= 1) {
    return [
      {
        key: keys[0] ?? '',
        startSeconds: word.startSeconds,
        endSeconds: word.endSeconds,
      },
    ];
  }
  const step = (word.endSeconds - word.startSeconds) / keys.length;
  return keys.map((key, i) => ({
    key,
    startSeconds: word.startSeconds + step * i,
    endSeconds: word.startSeconds + step * (i + 1),
  }));
}

/** Lowercased, punctuation-free, numerals spelled out. */
function comparisonKeys(token: string): string[] {
  const cleaned = token.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return cleaned.flatMap((part) =>
    /^\d+$/.test(part) ? numberToWords(Number(part)).split(' ') : [part],
  );
}

/** Levenshtein backtrace, returning the (reference, hypothesis) index pairs that matched. */
function alignSequences(ref: string[], hyp: string[]): Array<[number, number]> {
  const rows = ref.length + 1;
  const cols = hyp.length + 1;
  const cost = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) cost[i]![0] = i;
  for (let j = 0; j < cols; j++) cost[0]![j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const same = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      cost[i]![j] = Math.min(
        cost[i - 1]![j]! + 1,
        cost[i]![j - 1]! + 1,
        cost[i - 1]![j - 1]! + same,
      );
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = ref.length;
  let j = hyp.length;
  while (i > 0 && j > 0) {
    const same = ref[i - 1] === hyp[j - 1] ? 0 : 1;
    if (cost[i]![j] === cost[i - 1]![j - 1]! + same) {
      // Substitutions still pair: a misheard word had a time, and that time is
      // where the script's word belongs.
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (cost[i]![j] === cost[i - 1]![j]! + 1) {
      i--;
    } else {
      j--;
    }
  }
  return pairs.reverse();
}
