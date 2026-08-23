/**
 * Delivery — whether the read sounds like a person or like a machine.
 *
 * ## Why this is measurement and not an opinion
 *
 * The obvious way to close this gap is to hand the audio to a model and ask
 * "does this sound robotic". That is a vibe, it is unfalsifiable, and it is
 * exactly the kind of judgement this project has spent weeks moving *out* of
 * models and into code.
 *
 * The things that make synthetic speech sound synthetic are not mysterious, and
 * they are visible in data already produced: whisper returns per-word start and
 * end times for the finished mix, and the script says where the sentences are.
 * From those two, four real properties fall out —
 *
 *   1. **Pace variation.** A person speeds up through a familiar clause and
 *      slows on the point. A flat read holds one rate throughout, and the
 *      coefficient of variation of per-word speaking rate collapses.
 *   2. **Pauses at all.** Running six sentences together with no breath is the
 *      single most recognisable TTS artefact.
 *   3. **Word-duration outliers.** A word taking far longer per character than
 *      its neighbours is usually a mispronunciation or a stumble.
 *   4. **The opening.** A rushed first line loses the viewer before the content
 *      arrives, and it is the most common failure in a read that is otherwise
 *      fine.
 *
 * ## The thresholds here are uncalibrated, and say so
 *
 * There is no ElevenLabs key on this deployment, so **no real synthesised
 * speech has ever been measured by this module**. The numbers below are
 * starting points derived from the pacing band the audio gate already uses,
 * not from observed output.
 *
 * Every finding is therefore a `warning`. Promoting any of them to `error`
 * requires measuring real reads first — a gate that blocks publishing on an
 * invented threshold is worse than no gate, because the number acquires
 * authority it never earned.
 */

export interface SpokenWord {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export interface DeliveryProbe {
  /** Word timings from the finished mix, not from the narration stem. */
  words: SpokenWord[];
  /** The script as sent to synthesis, which is where the sentences are. */
  script: string;
  durationSeconds: number;
}

export interface DeliveryFinding {
  rule: string;
  severity: 'warning';
  message: string;
  fix: string;
}

export interface DeliveryResult {
  measured: boolean;
  findings: DeliveryFinding[];
  /** Coefficient of variation of per-word speaking rate. Higher is more human. */
  paceVariation: number;
  /** Gaps long enough to read as a breath. */
  pauseCount: number;
  summary: string;
}

/** A gap this long or longer reads as a deliberate pause rather than a join. */
export const PAUSE_SECONDS = 0.25;

/**
 * Below this, per-word rate is close enough to constant that the read is flat.
 *
 * **Uncalibrated.** Conversational speech typically lands well above this; the
 * figure is a floor chosen to fire only on something obviously mechanical, not
 * a boundary between good and bad.
 */
export const MIN_PACE_VARIATION = 0.18;

/** A word this many times the median rate is an outlier worth looking at. */
export const STUMBLE_RATIO = 2.5;

/** The window that decides whether anyone keeps watching. */
export const OPENING_SECONDS = 3;

function sentenceCount(script: string): number {
  const parts = script
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return Math.max(1, parts.length);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Characters per second for each word.
 *
 * Per *character* rather than per word, because "a" and "substitution" take
 * very different times to say and a per-word rate would call every long word a
 * stumble.
 */
function rates(words: SpokenWord[]): number[] {
  return words
    .map((w) => {
      const seconds = w.endSeconds - w.startSeconds;
      const chars = w.text.replace(/[^\p{L}\p{N}]/gu, '').length;
      return seconds > 0 && chars > 0 ? chars / seconds : 0;
    })
    .filter((r) => r > 0);
}

export function runDeliveryQC(probe: DeliveryProbe): DeliveryResult {
  const findings: DeliveryFinding[] = [];

  /**
   * Nothing to measure is not a good read.
   *
   * The same rule every gate here follows. An empty word list produces a
   * perfect score on every check below, which reads exactly like a clean one.
   */
  if (probe.words.length < 4) {
    return {
      measured: false,
      findings: [],
      paceVariation: 0,
      pauseCount: 0,
      summary: 'delivery not measured — too few words were transcribed to say anything',
    };
  }

  const wordRates = rates(probe.words);
  const meanRate = wordRates.reduce((a, b) => a + b, 0) / wordRates.length;
  const variance =
    wordRates.reduce((sum, r) => sum + (r - meanRate) ** 2, 0) / wordRates.length;
  const paceVariation = meanRate > 0 ? Math.sqrt(variance) / meanRate : 0;

  if (paceVariation < MIN_PACE_VARIATION) {
    findings.push({
      rule: 'delivery.flat_pace',
      severity: 'warning',
      message: `Every word is spoken at close to the same rate (variation ${paceVariation.toFixed(2)}).`,
      fix: 'A person speeds through a familiar clause and slows on the point. Vary sentence length in the script, or pick a voice with more range.',
    });
  }

  // ── Pauses ────────────────────────────────────────────────────────────────
  let pauseCount = 0;
  for (let i = 1; i < probe.words.length; i += 1) {
    const gap = probe.words[i]!.startSeconds - probe.words[i - 1]!.endSeconds;
    if (gap >= PAUSE_SECONDS) pauseCount += 1;
  }

  const sentences = sentenceCount(probe.script);
  const expectedPauses = Math.max(0, sentences - 1);

  /**
   * Running sentences together is the loudest artefact there is.
   *
   * Half of the expected count rather than all of it: a short sentence pair
   * genuinely can run on, and demanding a pause at every full stop would fire
   * on reads that are fine.
   */
  if (expectedPauses >= 2 && pauseCount < expectedPauses / 2) {
    findings.push({
      rule: 'delivery.runs_sentences_together',
      severity: 'warning',
      message: `${sentences} sentences and only ${pauseCount} audible pause${pauseCount === 1 ? '' : 's'}.`,
      fix: 'The read has no breath in it. Shorter sentences in the script give the synthesiser somewhere to stop.',
    });
  }

  // ── Stumbles ──────────────────────────────────────────────────────────────
  const medianRate = median(wordRates);
  const stumbles = probe.words.filter((w) => {
    const seconds = w.endSeconds - w.startSeconds;
    const chars = w.text.replace(/[^\p{L}\p{N}]/gu, '').length;
    if (seconds <= 0 || chars === 0) return false;
    const rate = chars / seconds;
    return medianRate > 0 && rate * STUMBLE_RATIO < medianRate;
  });

  if (stumbles.length > 0) {
    findings.push({
      rule: 'delivery.laboured_word',
      severity: 'warning',
      message: `${stumbles.length} word${stumbles.length === 1 ? '' : 's'} took far longer than the rest: ${stumbles
        .slice(0, 3)
        .map((w) => `"${w.text}"`)
        .join(', ')}.`,
      fix: 'Usually a mispronunciation. Add the term on Settings → Pronunciation with a phonetic spelling, and the next synthesis gets it right.',
    });
  }

  // ── The opening ───────────────────────────────────────────────────────────
  const opening = probe.words.filter((w) => w.startSeconds < OPENING_SECONDS);
  if (opening.length >= 3 && probe.words.length > opening.length) {
    const openingRate =
      rates(opening).reduce((a, b) => a + b, 0) / Math.max(1, rates(opening).length);
    if (openingRate > meanRate * 1.35) {
      findings.push({
        rule: 'delivery.rushed_open',
        severity: 'warning',
        message: 'The first three seconds are spoken noticeably faster than the rest.',
        fix: 'The opening is the only part most viewers hear. Give it room.',
      });
    }
  }

  return {
    measured: true,
    findings,
    paceVariation,
    pauseCount,
    summary: findings.length === 0
      ? `delivery reads naturally — pace variation ${paceVariation.toFixed(2)}, ${pauseCount} pauses`
      : `${findings.length} delivery note${findings.length === 1 ? '' : 's'} — pace variation ${paceVariation.toFixed(2)}, ${pauseCount} pauses`,
  };
}
