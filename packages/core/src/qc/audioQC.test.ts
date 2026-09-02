import { describe, expect, it } from 'vitest';
import { lexiconTermsUsed, normaliseForSpeech, runAudioQC, wordErrorRate } from './audioQC.js';

/**
 * §137. `hit_count` was displayed and never written, so every term read zero.
 */
describe('lexiconTermsUsed', () => {
  const lexicon = [
    { term: 'tamari', phonetic: 'tuh-MAR-ee' },
    { term: '450°F', phonetic: 'four hundred fifty degrees' },
    { term: '450', phonetic: 'four fifty' },
    { term: 'ghee', phonetic: 'gee' },
  ];

  it('names the terms a script actually contains', () => {
    expect(lexiconTermsUsed('Add tamari and ghee.', lexicon).sort()).toEqual(['ghee', 'tamari']);
  });

  it('counts nothing when no term appears', () => {
    expect(lexiconTermsUsed('Nothing to see.', lexicon)).toEqual([]);
  });

  it('matches case-insensitively, as the substitution does', () => {
    expect(lexiconTermsUsed('TAMARI, generously.', lexicon)).toEqual(['tamari']);
  });

  it('does not double-count a shorter term inside a longer one', () => {
    // '450' is inside '450°F'. The substitution replaces the longer first, so
    // counting both would claim a hit for a term that never fired.
    expect(lexiconTermsUsed('Heat to 450°F.', lexicon)).toEqual(['450°F']);
  });

  it('agrees with what the substitution replaced', () => {
    const script = 'Bring tamari to 450°F with ghee.';
    const spoken = normaliseForSpeech(script, lexicon);
    for (const term of lexiconTermsUsed(script, lexicon)) {
      const phonetic = lexicon.find((l) => l.term === term)!.phonetic;
      expect(spoken).toContain(phonetic);
    }
  });
});

/**
 * §144. Both defects here were invisible until a real voiceover was measured.
 * The gate reported a 29.4% word error rate against speech that was, on
 * listening, word-perfect.
 */
describe('word error rate against a real transcript', () => {
  it('treats a spoken numeral and its digits as the same utterance', () => {
    const script = 'Bake at four hundred fifty degrees for thirty five minutes.';
    // Exactly what whisper.cpp returns for that audio.
    const heard = 'Bake at 450 degrees for 35 minutes.';
    expect(wordErrorRate(script, heard)).toBe(0);
  });

  it('scores sixty and ninety as spoken, not as written', () => {
    expect(wordErrorRate('Keep the rise short, sixty to ninety minutes.', 'Keep the rise short, 60 to 90 minutes.')).toBe(0);
  });

  it('still catches a genuine mispronunciation', () => {
    // The gate exists for this. Normalising numerals must not blunt it.
    expect(
      wordErrorRate('Add the xanthan gum slowly.', 'Add the zanthem gun slowly.'),
    ).toBeGreaterThan(0);
  });

  it('does not silently equate different numbers', () => {
    expect(wordErrorRate('Bake for thirty minutes.', 'Bake for 40 minutes.')).toBeGreaterThan(0);
  });
});

/**
 * §152. Calibrated from five real voiceovers, not from a wish to pass.
 *
 * The gate exists to catch a mispronunciation. At the levels that actually
 * occur it was catching whisper's tokeniser: one video failed at 2.94% on a
 * single finding — the script said `tradeoff`, the narration said "tradeoff",
 * and the transcript read `trade off`. The 2% ceiling is unchanged; what it
 * measures is what changed.
 */
describe('word boundaries that disagree without changing what was said', () => {
  it('scores a compound split by the transcriber as correct', () => {
    // The real failure, verbatim.
    expect(wordErrorRate('It is a tradeoff worth making.', 'It is a trade off worth making.')).toBe(
      0,
    );
  });

  it('works in the other direction too', () => {
    expect(wordErrorRate('Let it rest a full five minutes.', 'Let it rest a fullfive minutes.')).toBe(
      0,
    );
  });

  it('still scores a genuine mispronunciation', () => {
    // The reason the gate exists. Fusing must not reach this.
    expect(
      wordErrorRate('Add the xanthan gum slowly.', 'Add the zanthem gun slowly.'),
    ).toBeGreaterThan(0.3);
  });

  it('still scores a word the narration simply did not say', () => {
    expect(wordErrorRate('Pull it when the center looks barely set.', 'Pull it when set.')).toBeGreaterThan(
      0,
    );
  });

  it('still scores an inserted word, which is a real discrepancy', () => {
    // 1.08% on a real run, under the ceiling — measured, not forgiven.
    expect(wordErrorRate('Bake it until set.', 'Bake it until the set.')).toBeGreaterThan(0);
  });

  it('does not fuse across an unbounded run', () => {
    // A cap, so two unrelated sequences cannot concatenate their way to a match.
    expect(wordErrorRate('abcdefgh', 'a b c d e f g h')).toBeGreaterThan(0);
  });
});

describe('§487 pacing is a property of speech', () => {
  const script = Array.from({ length: 55 }, (_, i) => `word${i}`).join(' ');
  it('measures over the voiced seconds when the mix has designed silence', () => {
    /* 55 words in 20s of speech inside a 30s mix: 165 wpm spoken, 110 over the mix. */
    const result = runAudioQC({ script, transcript: script, durationSeconds: 30, spokenSeconds: 20 });
    expect(result.wordsPerMinute).toBe(165);
    expect(result.silenceShare).toBe(0.33);
    expect(result.findings.some((f) => f.rule === 'audio.pacing')).toBe(false);
    expect(result.summary).toMatch(/33% silence/);
  });
  it('still measures over the whole mix when nothing was measured', () => {
    const result = runAudioQC({ script, transcript: script, durationSeconds: 30 });
    expect(result.wordsPerMinute).toBe(110);
    expect(result.silenceShare).toBeUndefined();
    expect(result.findings.some((f) => f.rule === 'audio.pacing')).toBe(true);
  });
});
