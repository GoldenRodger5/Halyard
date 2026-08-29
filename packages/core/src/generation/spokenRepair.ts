/**
 * §287. Fix it, rather than ask again and hope.
 *
 * A YouTube piece failed its voiceover three times and was abandoned, and the
 * three failures were **identical**: `spoken.unspoken_symbol` on "1/4" and a
 * 22-word sentence. The retry loop was working exactly as designed — it named
 * the rule, quoted the excerpt, and supplied the fix — and it changed nothing,
 * three times, for a specific reason.
 *
 * The script is written from a prompt that opens *"Post copy this narrates:"*
 * followed by the body, and that body says "1/4 cup wheat flour". The model is
 * anchored on the text it was asked to narrate, so every rewrite reproduced the
 * fraction it had just been told to remove. Feedback cannot win an argument
 * against the prompt's own source material.
 *
 * ## The rule this establishes
 *
 * **A violation with one correct mechanical answer should never reach a model.**
 * "1/4" becomes "one quarter" — there is no judgement in that, no style, nothing
 * a writer could improve. Spending a model call and an attempt on it is worse
 * than pointless: attempts are finite, and burning them on a transformation code
 * can do with certainty is why this piece was abandoned with two of its three
 * chances spent on the same fraction.
 *
 * So the loop becomes: **repair what is mechanical, re-check, and only ask the
 * model about what is genuinely left.** A second failure then means something
 * different from the first, which is the property the loop needed and did not
 * have.
 *
 * Sentence length is deliberately *not* repaired here. Splitting a sentence
 * changes emphasis and rhythm, which is writing, and a machine that breaks a
 * clause at the nearest comma produces something worse than the model would.
 * That one still goes back — but now it goes back alone.
 */

/** Fractions a recipe actually uses, spoken the way a person says them. */
const FRACTIONS: Array<[RegExp, string]> = [
  [/\b1\/2\b/g, 'half'],
  [/\b1\/3\b/g, 'a third'],
  [/\b2\/3\b/g, 'two thirds'],
  [/\b1\/4\b/g, 'a quarter'],
  [/\b3\/4\b/g, 'three quarters'],
  [/\b1\/8\b/g, 'an eighth'],
  [/\b3\/8\b/g, 'three eighths'],
  [/\b5\/8\b/g, 'five eighths'],
  [/\b7\/8\b/g, 'seven eighths'],
  [/\b1\/6\b/g, 'a sixth'],
  [/\b5\/6\b/g, 'five sixths'],
];

/** Symbols with one unambiguous spoken form. */
const SYMBOLS: Array<[RegExp, string]> = [
  [/(\d+)\s*°\s*F\b/gi, '$1 degrees'],
  [/(\d+)\s*°\s*C\b/gi, '$1 degrees'],
  [/(\d+)\s*(?:°|℉|℃)/g, '$1 degrees'],
  [/(\d+)\s*%/g, '$1 percent'],
  [/\s*&\s*/g, ' and '],
  [/\s*@\s*/g, ' at '],
];

export interface SpokenRepair {
  text: string;
  /** What was changed, for the log and for the operator. */
  changes: string[];
}

/**
 * Make a line speakable, without changing what it says.
 *
 * Every transformation here is meaning-preserving and reversible in the reader's
 * head: "1/4 cup" and "a quarter cup" are the same instruction. Nothing that
 * requires a judgement about emphasis, order or wording belongs in this
 * function — the moment one does, it stops being a repair and becomes an edit
 * nobody reviewed.
 */
export function repairSpoken(text: string): SpokenRepair {
  let out = text;
  const changes: string[] = [];

  for (const [pattern, replacement] of FRACTIONS) {
    if (pattern.test(out)) {
      const before = out;
      out = out.replace(pattern, replacement);
      if (out !== before) changes.push(`fraction → "${replacement}"`);
    }
    pattern.lastIndex = 0;
  }

  for (const [pattern, replacement] of SYMBOLS) {
    if (pattern.test(out)) {
      const before = out;
      out = out.replace(pattern, replacement);
      if (out !== before) changes.push(`symbol → "${replacement.replace('$1 ', '')}"`);
    }
    pattern.lastIndex = 0;
  }

  /*
   * A mixed number reads as two quantities otherwise: "1 1/2" repaired
   * naively becomes "1 half". Handled after the fractions so the numeral is
   * still adjacent to the word that replaced its fraction.
   */
  out = out.replace(/\b(\d+)\s+(half|a third|two thirds|a quarter|three quarters|an eighth)\b/g, (_m, n, frac) => {
    changes.push('mixed number joined');
    return `${n} and ${frac === 'half' ? 'a half' : frac}`;
  });

  /* Collapse whatever double spaces the substitutions left. */
  out = out.replace(/\s{2,}/g, ' ').trim();

  return { text: out, changes };
}

/**
 * Which of a gate's violations this function can answer on its own.
 *
 * Named rather than inferred so the caller can say honestly what it repaired
 * and what it is still asking a model about — and so a new spoken rule does not
 * silently get treated as mechanically fixable when it is not.
 */
export const MECHANICALLY_REPAIRABLE = new Set(['spoken.unspoken_symbol']);

export function canRepair(rule: string): boolean {
  return MECHANICALLY_REPAIRABLE.has(rule);
}
