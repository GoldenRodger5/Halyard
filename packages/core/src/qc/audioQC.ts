/**
 * Gate 4 — Audio QC. v2 Part F.4. Runs on any voiceover.
 *
 *   1. Round-trip transcription. Whisper the generated audio, diff against the
 *      source script. Word error rate above 2% means the TTS mispronounced
 *      something.
 *   2. Number pronunciation. "450°F" must read as "four hundred fifty degrees".
 *   3. Pacing. 140 to 175 words per minute.
 *   4. Trailing silence under 300ms.
 *
 * The lexicon pass (v2 D.2) runs *before* synthesis; the gate runs after. When
 * the gate catches a mispronunciation, the term goes into voice_lexicon and the
 * next synthesis gets it right. That loop is the point.
 */

export interface AudioProbe {
  /** The script as sent to the TTS engine, after normalisation. */
  script: string;
  /** Whisper's transcript of the generated audio. */
  transcript: string;
  durationSeconds: number;
  trailingSilenceMs?: number;
  leadingSilenceMs?: number;
}

export interface AudioFinding {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  detail?: string;
  /** Terms worth adding to voice_lexicon. */
  suggestedLexiconTerms?: string[];
}

export interface AudioQCResult {
  passed: boolean;
  findings: AudioFinding[];
  wordErrorRate: number;
  wordsPerMinute: number;
  /** Rendered for the queue: "WER 0.4%, 158 wpm, −14.1 LUFS". */
  summary: string;
}

export const MAX_WORD_ERROR_RATE = 0.02;
export const MIN_WPM = 140;
export const MAX_WPM = 175;
export const MAX_TRAILING_SILENCE_MS = 300;

export interface LexiconEntry {
  term: string;
  phonetic: string;
}

/**
 * Normalise a script before synthesis. Applied in this order:
 *   1. lexicon terms, longest first, so '450°F' wins over '450'
 *   2. temperatures, fractions and remaining numerals
 *
 * v2 D.2: "Pre-normalise numerals in the script before synthesis rather than
 * hoping."
 */
/**
 * Which lexicon terms actually appear in a script.
 *
 * `voice_lexicon.hit_count` exists and the pronunciation screen shows a "used"
 * column, and nothing incremented it — so every term read zero forever, which
 * is the shape of a measurement that looks collected and is not.
 *
 * Separate from `normaliseForSpeech` rather than folded into it: that function
 * has a settled signature and its own tests, and the substitution is applied in
 * places where counting a hit would be wrong. Matching is done the same way the
 * substitution does it — same escaping, same case-insensitivity — so the count
 * cannot disagree with what was actually replaced.
 */
export function lexiconTermsUsed(script: string, lexicon: LexiconEntry[] = []): string[] {
  const used: string[] = [];
  let remaining = script;

  // Longest first, exactly as the substitution runs: '450°F' consumes the text
  // that '450' would otherwise also match, and counting both would overstate.
  for (const entry of [...lexicon].sort((a, b) => b.term.length - a.term.length)) {
    const escaped = entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped, 'gi');
    if (pattern.test(remaining)) {
      used.push(entry.term);
      remaining = remaining.replace(new RegExp(escaped, 'gi'), ' ');
    }
  }
  return used;
}

export function normaliseForSpeech(script: string, lexicon: LexiconEntry[] = []): string {
  let out = script;

  const sorted = [...lexicon].sort((a, b) => b.term.length - a.term.length);
  for (const entry of sorted) {
    const escaped = entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), entry.phonetic);
  }

  // Temperatures: 450°F / 450 F / 450 degrees F
  out = out.replace(/(\d+)\s*°\s*([FC])/g, (_m, n: string, unit: string) =>
    `${numberToWords(Number(n))} degrees ${unit === 'F' ? 'Fahrenheit' : 'Celsius'}`,
  );
  out = out.replace(/(\d+)\s*degrees\b/gi, (_m, n: string) => `${numberToWords(Number(n))} degrees`);

  // Unicode fractions, whole-and-fraction first: 1¾ → one and three quarters
  const FRACTIONS: Record<string, string> = {
    '¼': 'a quarter',
    '½': 'a half',
    '¾': 'three quarters',
    '⅓': 'a third',
    '⅔': 'two thirds',
    '⅛': 'an eighth',
  };
  for (const [glyph, words] of Object.entries(FRACTIONS)) {
    out = out.replace(new RegExp(`(\\d+)\\s*${glyph}`, 'g'), (_m, whole: string) => {
      const spelled = words.replace(/^(a|an) /, 'one ');
      return `${numberToWords(Number(whole))} and ${spelled}`;
    });
    out = out.replace(new RegExp(glyph, 'g'), words);
  }

  // ASCII fractions: 1 3/4 → one and three quarters
  out = out.replace(/(\d+)\s+(\d+)\/(\d+)/g, (_m, whole: string, num: string, den: string) =>
    `${numberToWords(Number(whole))} and ${fractionToWords(Number(num), Number(den))}`,
  );
  out = out.replace(/(?<![\d/])(\d+)\/(\d+)(?![\d/])/g, (_m, num: string, den: string) =>
    fractionToWords(Number(num), Number(den)),
  );

  // Remaining bare integers up to 1000.
  out = out.replace(/\b(\d{1,4})\b/g, (m, n: string) => {
    const value = Number(n);
    return value <= 1000 ? numberToWords(value) : m;
  });

  return out.replace(/\s{2,}/g, ' ').trim();
}

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numberToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n < 20) return ONES[n]!;
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)]!;
    const rest = n % 10;
    return rest === 0 ? tens : `${tens} ${ONES[rest]}`;
  }
  if (n < 1000) {
    const hundreds = `${ONES[Math.floor(n / 100)]} hundred`;
    const rest = n % 100;
    return rest === 0 ? hundreds : `${hundreds} ${numberToWords(rest)}`;
  }
  if (n === 1000) return 'one thousand';
  return String(n);
}

const DENOMINATORS: Record<number, [string, string]> = {
  2: ['half', 'halves'],
  3: ['third', 'thirds'],
  4: ['quarter', 'quarters'],
  8: ['eighth', 'eighths'],
  16: ['sixteenth', 'sixteenths'],
};

function fractionToWords(num: number, den: number): string {
  const names = DENOMINATORS[den];
  if (!names) return `${numberToWords(num)} over ${numberToWords(den)}`;
  return `${numberToWords(num)} ${num === 1 ? names[0] : names[1]}`;
}

/** Levenshtein distance over word arrays — the standard WER numerator. */
export function wordErrorRate(reference: string, hypothesis: string): number {
  const [ref, hyp] = reconcileWordBoundaries(tokenise(reference), tokenise(hypothesis));
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;

  let previous = Array.from({ length: hyp.length + 1 }, (_, i) => i);
  for (let i = 1; i <= ref.length; i++) {
    const current = [i, ...new Array<number>(hyp.length).fill(0)];
    for (let j = 1; j <= hyp.length; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[hyp.length]! / ref.length;
}

/**
 * Longest run of tokens this aligner will fuse when looking for a match.
 *
 * Three covers every real case seen — "trade off", "gluten free", "one hundred"
 * — and bounds the damage if two genuinely different sequences happen to
 * concatenate alike.
 */
const MAX_FUSED_TOKENS = 3;

/**
 * Reconcile word boundaries that disagree without changing what was said.
 *
 * §152. The audio gate exists to catch a **mispronunciation**, and at the
 * levels that actually occur it was catching whisper's tokeniser instead. One
 * real video failed at 2.94% on a single finding: the script said `tradeoff`,
 * the narration said "tradeoff", and whisper wrote `trade off`. Two errors
 * against sixty-eight words, for a word that was pronounced correctly.
 *
 * Nothing downstream is harmed by that disagreement. It is inaudible, it cannot
 * reach the captions — those are anchored to the script since §145 — and it
 * touches no product claim. It is an artefact of how the transcript is written,
 * exactly like the numerals §144 already reconciles.
 *
 * So the threshold is not the thing that was wrong, and it is unchanged at 2%.
 * The fix is to compare what was *said*: where a token on one side equals a run
 * of tokens on the other, the two are the same utterance and are fused.
 *
 * A genuine mispronunciation still scores, because concatenation has to match
 * exactly — "zanthem" is not "xanthan" joined to anything.
 */
export function reconcileWordBoundaries(ref: string[], hyp: string[]): [string[], string[]] {
  const outRef: string[] = [];
  const outHyp: string[] = [];
  let i = 0;
  let j = 0;

  /** The run of `from` starting at `at` that concatenates to `target`, if any. */
  const fusedRun = (from: string[], at: number, target: string): number => {
    let joined = '';
    for (let k = at; k < from.length && k < at + MAX_FUSED_TOKENS; k++) {
      joined += from[k];
      if (joined === target) return k - at + 1;
      if (joined.length >= target.length) break;
    }
    return 0;
  };

  while (i < ref.length && j < hyp.length) {
    if (ref[i] === hyp[j]) {
      outRef.push(ref[i]!);
      outHyp.push(hyp[j]!);
      i++;
      j++;
      continue;
    }

    // One script word heard as several — "tradeoff" transcribed "trade off".
    const heardAsMany = fusedRun(hyp, j, ref[i]!);
    if (heardAsMany > 1) {
      outRef.push(ref[i]!);
      outHyp.push(ref[i]!);
      i++;
      j += heardAsMany;
      continue;
    }

    // Several script words heard as one — the same disagreement, mirrored.
    const writtenAsMany = fusedRun(ref, i, hyp[j]!);
    if (writtenAsMany > 1) {
      outRef.push(hyp[j]!);
      outHyp.push(hyp[j]!);
      i += writtenAsMany;
      j++;
      continue;
    }

    outRef.push(ref[i]!);
    outHyp.push(hyp[j]!);
    i++;
    j++;
  }

  // Whatever is left is a real length difference and must still be scored.
  return [
    [...outRef, ...ref.slice(i)],
    [...outHyp, ...hyp.slice(j)],
  ];
}

/**
 * Words, with numerals spelled out so both sides land in the same space.
 *
 * §144. `normaliseForSpeech` converts the script's numerals to words before
 * synthesis, and whisper converts them straight back — "four hundred fifty
 * degrees" is transcribed "450 degrees". Comparing the two orthographies
 * scored three substitutions against speech that was word-perfect, and a
 * product about temperatures and timings puts a number in nearly every
 * script, so the audio gate failed almost everything it measured.
 *
 * WER is meant to compare what was *said*. "450" and "four hundred fifty" are
 * the same utterance, so they are the same tokens here. A real mispronunciation
 * still scores, because the words themselves still have to match.
 */
function tokenise(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).flatMap((token) =>
    /^\d+$/.test(token) ? numberToWords(Number(token)).split(' ') : [token],
  );
}

export function runAudioQC(probe: AudioProbe): AudioQCResult {
  const findings: AudioFinding[] = [];

  /**
   * A probe with no script or no transcript is not clean audio — it is a
   * measurement that did not happen. Every check below compares the two, and
   * comparing nothing to nothing yields a perfect score, which is the same
   * false pass an empty body produces in the copy gate.
   */
  if (!probe?.script?.trim() || !probe?.transcript?.trim()) {
    return {
      passed: false,
      findings: [
        {
          rule: 'audio.not_measured',
          severity: 'error',
          message: probe?.script?.trim()
            ? 'No transcript, so the audio was never checked against its script.'
            : 'No script, so there is nothing to check the audio against.',
          detail:
            'Word error rate, pacing and silence are all comparisons. Without both sides there is no measurement, and an unmeasured voiceover must not read as a passing one.',
        },
      ],
      wordErrorRate: 1,
      wordsPerMinute: 0,
      summary: 'failed — the voiceover was never measured',
    };
  }

  const wer = wordErrorRate(probe.script, probe.transcript);
  if (wer > MAX_WORD_ERROR_RATE) {
    findings.push({
      rule: 'audio.word_error_rate',
      severity: 'error',
      message: `Word error rate ${(wer * 100).toFixed(1)}%, over the ${(MAX_WORD_ERROR_RATE * 100).toFixed(0)}% limit.`,
      detail: 'The synthesiser mispronounced something. Common culprits: ingredient names, temperatures, fractions.',
      suggestedLexiconTerms: suspectTerms(probe.script, probe.transcript),
    });
  }

  const scriptWords = tokenise(probe.script).length;
  const wpm = probe.durationSeconds > 0 ? (scriptWords / probe.durationSeconds) * 60 : 0;
  if (wpm < MIN_WPM || wpm > MAX_WPM) {
    findings.push({
      rule: 'audio.pacing',
      severity: 'error',
      message: `${wpm.toFixed(0)} words per minute, outside ${MIN_WPM}–${MAX_WPM}.`,
      detail: wpm < MIN_WPM ? 'Too slow. Regenerate at a higher speed.' : 'Too fast to follow.',
    });
  }

  if (probe.trailingSilenceMs !== undefined && probe.trailingSilenceMs > MAX_TRAILING_SILENCE_MS) {
    findings.push({
      rule: 'audio.trailing_silence',
      severity: 'error',
      message: `${probe.trailingSilenceMs}ms of trailing silence, over ${MAX_TRAILING_SILENCE_MS}ms.`,
      detail: 'Trim it. Dead air at the end reads as a mistake.',
    });
  }

  // Any digit left in the script means normalisation did not run, and the
  // synthesiser is guessing at how to read it.
  const rawNumerals = probe.script.match(/\d/g);
  if (rawNumerals && rawNumerals.length > 0) {
    findings.push({
      rule: 'audio.unnormalised_numerals',
      severity: 'error',
      message: 'The synthesis script still contains numerals.',
      detail: 'Run normaliseForSpeech() with the product lexicon before calling the TTS engine.',
    });
  }

  return {
    passed: findings.filter((f) => f.severity === 'error').length === 0,
    findings,
    wordErrorRate: Number(wer.toFixed(4)),
    wordsPerMinute: Number(wpm.toFixed(0)),
    summary: `WER ${(wer * 100).toFixed(1)}%, ${wpm.toFixed(0)} wpm`,
  };
}

/** Words present in the script but absent from the transcript — lexicon candidates. */
export function suspectTerms(script: string, transcript: string): string[] {
  const heard = new Set(tokenise(transcript));
  const missing = tokenise(script).filter((w) => w.length > 3 && !heard.has(w));
  return [...new Set(missing)].slice(0, 8);
}
