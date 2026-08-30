/**
 * §354. One narration mechanism, whoever wrote the words.
 *
 * §306 gave format pieces **timed lines**: each sentence carries the second its
 * visual appears, so the voice cannot answer a quiz during its own countdown.
 * The artifact path — `transformation`, the oldest and most-used shape — kept
 * the original behaviour: one block of prose, read straight through.
 *
 * So there are two narration systems. Not a design: a repair that reached the
 * new path and not the old one. The consequence is that the format that runs
 * most often is the one that cannot place a line on a beat.
 *
 * ## What is unified, and what is not
 *
 * The **mechanism**, not the writer. Where the words come from stays different
 * and should — a format's slots are already written and gated, while an
 * artifact's script is written by `writeVoScript` from the piece's own beats.
 * What both now produce is the same thing: lines with times.
 *
 * ## Why sentences
 *
 * A beat is a unit of meaning and so is a sentence, and prose written for a
 * piece with five beats almost always has about five sentences — because the
 * writer was told what the beats were. Splitting anywhere else would cut a
 * thought in half to fit a clock.
 *
 * Where the counts do not match, sentences are distributed rather than
 * truncated: no words are lost, because losing a sentence to a timing rule is
 * the piece saying less than it was written to say.
 */

import { splitSentences } from '../qc/slopFilter.js';

export interface TimedLine {
  atSeconds: number;
  text: string;
}

export interface ScriptBeat {
  /** When this beat's visual appears, in seconds. */
  atSeconds: number;
  /** How long it holds. Used to keep a line inside its own beat. */
  seconds?: number;
}

/*
 * §354. The splitter already existed in `slopFilter`, and it is better than the
 * one written here: it guards decimals and a list of abbreviations —
 * "Rest 3.5 min. Then slice." is two sentences — which a lookahead for a
 * capital letter gets wrong. Reused rather than reimplemented, which is the
 * whole lesson of the two narration systems this file exists to end.
 */

/**
 * Place a written script onto a piece's beats.
 *
 * The line for a beat starts a moment after the visual, so the picture leads
 * and the voice follows — a narrator who starts on the same frame reads as a
 * caption being dictated.
 */
export function timeScriptToBeats(
  script: string,
  beats: readonly ScriptBeat[],
  options: { leadSeconds?: number } = {},
): TimedLine[] {
  const lead = options.leadSeconds ?? 0.25;
  const sentences = splitSentences(script);
  if (sentences.length === 0 || beats.length === 0) return [];

  /*
   * More sentences than beats: the extras join the beat they follow rather
   * than being dropped or given a time of their own. Two lines at one moment
   * is a paragraph, which is what the writer wrote.
   */
  if (sentences.length >= beats.length) {
    const perBeat = Math.ceil(sentences.length / beats.length);
    return beats
      .map((beat, i) => {
        const text = sentences.slice(i * perBeat, (i + 1) * perBeat).join(' ');
        return text ? { atSeconds: Number((beat.atSeconds + lead).toFixed(2)), text } : null;
      })
      .filter((line): line is TimedLine => line !== null);
  }

  /*
   * Fewer sentences than beats: some beats are silent, which is correct rather
   * than a gap to fill. Spread across the piece so the silence is distributed
   * instead of leaving the last third with no voice at all.
   */
  const step = beats.length / sentences.length;
  return sentences.map((text, i) => {
    const beat = beats[Math.min(beats.length - 1, Math.floor(i * step))]!;
    return { atSeconds: Number((beat.atSeconds + lead).toFixed(2)), text };
  });
}

/**
 * §354. Would any line run past the beat it belongs to?
 *
 * The same check §312 applies to a quiz, available to the artifact path — which
 * has never had it, so a long sentence over a short beat has always been
 * possible there and invisible.
 */
export function linesOverrunning(
  lines: readonly TimedLine[],
  beats: readonly ScriptBeat[],
): Array<{ text: string; overrunSeconds: number }> {
  const out: Array<{ text: string; overrunSeconds: number }> = [];

  for (const [i, line] of lines.entries()) {
    const beat = beats[i];
    if (!beat?.seconds) continue;
    /* The same speech model everything else here sizes with: ~2.6 words/second. */
    const words = line.text.trim().split(/\s+/).filter(Boolean).length;
    const needs = Math.max(2, words / 2.6 + 0.55);
    const room = beat.seconds - (line.atSeconds - beat.atSeconds);
    if (needs > room + 0.3) {
      out.push({ text: line.text, overrunSeconds: Number((needs - room).toFixed(2)) });
    }
  }

  return out;
}
