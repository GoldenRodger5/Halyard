/**
 * §354. One narration mechanism, whoever wrote the words.
 */
import { describe, it, expect } from 'vitest';
import { linesOverrunning, timeScriptToBeats } from './timeScript.js';

const beats = [
  { atSeconds: 0, seconds: 4 },
  { atSeconds: 4, seconds: 4 },
  { atSeconds: 8, seconds: 4 },
];

describe('timeScriptToBeats', () => {
  it('puts one sentence on each beat, a moment after the visual', () => {
    /* The picture leads and the voice follows: a narrator starting on the same
       frame reads as a caption being dictated. */
    const lines = timeScriptToBeats('One. Two. Three.', beats);
    expect(lines.map((l) => l.text)).toEqual(['One.', 'Two.', 'Three.']);
    expect(lines[0]!.atSeconds).toBeGreaterThan(0);
    expect(lines[1]!.atSeconds).toBeGreaterThan(4);
  });

  it('keeps every sentence when there are more of them than beats', () => {
    /* Losing a sentence to a timing rule is the piece saying less than it was
       written to say. */
    const lines = timeScriptToBeats('A. B. C. D. E. F.', beats);
    const said = lines.map((l) => l.text).join(' ');
    for (const sentence of ['A.', 'B.', 'C.', 'D.', 'E.', 'F.']) {
      expect(said).toContain(sentence);
    }
  });

  it('spreads a short script across the piece rather than front-loading it', () => {
    /* Fewer sentences than beats means some beats are silent, which is correct
       — but the silence should not all be at the end. */
    const lines = timeScriptToBeats('First. Last.', beats);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.atSeconds).toBeGreaterThan(lines[0]!.atSeconds);
  });

  it('does not split a decimal or an abbreviation', () => {
    /* Reuses slopFilter's splitter, which guards these. A naive split makes
       "Rest 3.5 min." into three sentences and times them separately. */
    const lines = timeScriptToBeats('Rest 3.5 min. Then slice.', beats);
    expect(lines[0]!.text).toContain('3.5 min.');
  });

  it('returns nothing rather than throwing for an empty script', () => {
    expect(timeScriptToBeats('', beats)).toEqual([]);
    expect(timeScriptToBeats('Words.', [])).toEqual([]);
  });
});

describe('linesOverrunning', () => {
  it('catches a long sentence over a short beat', () => {
    /*
     * The check §312 applies to a quiz, now available to the artifact path —
     * which has never had it, so this has always been possible there and
     * invisible.
     */
    const long = 'This is a considerably longer sentence than four seconds of speech can hold at any reasonable pace.';
    const lines = timeScriptToBeats(long, [{ atSeconds: 0, seconds: 4 }]);
    expect(linesOverrunning(lines, [{ atSeconds: 0, seconds: 4 }])).toHaveLength(1);
  });

  it('says nothing when every line fits', () => {
    const lines = timeScriptToBeats('Short. Also short. Still short.', beats);
    expect(linesOverrunning(lines, beats)).toEqual([]);
  });

  it('ignores a beat with no declared length', () => {
    const lines = timeScriptToBeats('Anything at all.', [{ atSeconds: 0 }]);
    expect(linesOverrunning(lines, [{ atSeconds: 0 }])).toEqual([]);
  });
});
