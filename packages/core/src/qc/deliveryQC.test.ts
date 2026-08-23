import { describe, expect, it } from 'vitest';
import { MIN_PACE_VARIATION, runDeliveryQC, type SpokenWord } from './deliveryQC.js';

/** A read at a constant rate — the machine tell. */
function flat(count: number, secondsPerWord = 0.4): SpokenWord[] {
  return Array.from({ length: count }, (_, i) => ({
    text: 'wordy',
    startSeconds: i * secondsPerWord,
    endSeconds: i * secondsPerWord + secondsPerWord,
  }));
}

/** A read that varies, with pauses at sentence ends. */
function human(): SpokenWord[] {
  const spec: Array<[string, number]> = [
    ['Your', 0.18], ['loaf', 0.32], ['keeps', 0.22], ['coming', 0.3], ['out', 0.16], ['gummy', 0.44],
    ['The', 0.12], ['starch', 0.4], ['holds', 0.26], ['water', 0.36],
    ['Give', 0.2], ['it', 0.1], ['time', 0.38], ['to', 0.1], ['set', 0.4],
  ];
  const words: SpokenWord[] = [];
  let t = 0;
  spec.forEach(([text, dur], i) => {
    words.push({ text, startSeconds: t, endSeconds: t + dur });
    t += dur;
    // Breath after "gummy" and "water".
    if (i === 5 || i === 9) t += 0.4;
  });
  return words;
}

describe('runDeliveryQC', () => {
  it('reports not measured rather than clean when there is nothing to measure', () => {
    /**
     * An empty word list scores perfectly on every check below, which reads
     * exactly like a clean one. The same rule every gate here follows.
     */
    const result = runDeliveryQC({ words: [], script: 'Anything.', durationSeconds: 10 });
    expect(result.measured).toBe(false);
    expect(result.findings).toEqual([]);
    expect(result.summary).toMatch(/not measured/);
  });

  it('passes a read that varies and breathes', () => {
    const result = runDeliveryQC({
      words: human(),
      script: 'Your loaf keeps coming out gummy. The starch holds water. Give it time to set.',
      durationSeconds: 5,
    });
    expect(result.measured).toBe(true);
    expect(result.paceVariation).toBeGreaterThan(MIN_PACE_VARIATION);
    expect(result.findings.map((f) => f.rule)).not.toContain('delivery.flat_pace');
  });

  it('catches a read held at one rate throughout', () => {
    // A person speeds through a familiar clause and slows on the point.
    const result = runDeliveryQC({
      words: flat(20),
      script: 'One. Two. Three.',
      durationSeconds: 8,
    });
    expect(result.findings.map((f) => f.rule)).toContain('delivery.flat_pace');
  });

  it('catches sentences run together with no breath', () => {
    /** The loudest synthetic-speech artefact there is. */
    const result = runDeliveryQC({
      words: flat(24),
      script: 'One thing. Two things. Three things. Four things. Five things.',
      durationSeconds: 10,
    });
    expect(result.findings.map((f) => f.rule)).toContain('delivery.runs_sentences_together');
  });

  it('does not demand a pause at every full stop', () => {
    // A short sentence pair genuinely can run on.
    const words = human();
    const result = runDeliveryQC({
      words,
      script: 'A. B. C.',
      durationSeconds: 5,
    });
    expect(result.findings.map((f) => f.rule)).not.toContain('delivery.runs_sentences_together');
  });

  it('flags a word that took far longer than its neighbours', () => {
    const words = human();
    // Same characters, four times the time: the shape of a mispronunciation.
    words.splice(3, 0, { text: 'xanthan', startSeconds: 1.2, endSeconds: 4.0 });
    const result = runDeliveryQC({
      words,
      script: 'Your loaf keeps coming out gummy. The starch holds water.',
      durationSeconds: 8,
    });
    const finding = result.findings.find((f) => f.rule === 'delivery.laboured_word');
    expect(finding).toBeDefined();
    expect(finding!.message).toContain('xanthan');
    // The fix points at the loop that stops it recurring.
    /*
     * Names the screen, not the table. The fix used to say "add the term to
     * voice_lexicon", which was a table an operator had no way to write to —
     * the gate diagnosed correctly and prescribed something impossible. There
     * is a surface now, and the instruction points at it.
     */
    expect(finding!.fix).toMatch(/Settings → Pronunciation/);
  });

  it('flags an opening spoken faster than the rest', () => {
    const words: SpokenWord[] = [];
    // Fast for the first three seconds, then normal.
    for (let i = 0; i < 12; i += 1) {
      words.push({ text: 'quickly', startSeconds: i * 0.22, endSeconds: i * 0.22 + 0.1 });
    }
    for (let i = 0; i < 12; i += 1) {
      words.push({ text: 'steadily', startSeconds: 4 + i * 0.5, endSeconds: 4 + i * 0.5 + 0.42 });
    }
    const result = runDeliveryQC({
      words,
      script: 'One. Two. Three. Four.',
      durationSeconds: 12,
    });
    expect(result.findings.map((f) => f.rule)).toContain('delivery.rushed_open');
  });

  it('never blocks publishing on an uncalibrated threshold', () => {
    /**
     * No real synthesised speech has been measured by this module — there is no
     * ElevenLabs key on this deployment. Every finding stays a warning until
     * the numbers come from observed output rather than from reasoning.
     */
    const result = runDeliveryQC({
      words: flat(30),
      script: 'One. Two. Three. Four. Five. Six.',
      durationSeconds: 12,
    });
    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) expect(finding.severity).toBe('warning');
  });
});
