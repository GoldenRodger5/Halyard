/**
 * §449. Fixing mechanically what a model should not be asked to argue about.
 *
 * ## The loss this prevents
 *
 * Measured live: a `history` piece filled all five slots on attempt two with
 * **zero warnings** — researched, sourced, every citation fetched and read —
 * and was then thrown away because its *caption* failed the copy gate three
 * times on one violation. `disowned: nothing inserted yet`. The content was
 * fine; the wrapper around it was not, and the whole piece went in the bin.
 *
 * That is expensive in a way the log does not show: the research calls, the
 * writing attempts, the operator's slot in the queue, all discarded over
 * punctuation.
 *
 * ## Why a repair rather than another attempt
 *
 * `buildFeedback` already names the rule and the fix, and the copywriter still
 * failed three times on the same gate. That is the signal the codebase's own
 * comment identifies: *"three consecutive attempts failing the same rule means
 * the brief and the gate disagree, which no number of retries will settle."*
 *
 * An em dash is not a disagreement worth a model call. `repairDraft` has done
 * exactly this for **format slots** since §290, deterministically, and the
 * caption path — the one that actually loses pieces — never got the same
 * treatment.
 *
 * ## The line this does not cross
 *
 * Only substitutions that **cannot change what a sentence says**: punctuation
 * a platform mangles anyway, and whitespace. A banned phrase, a hype
 * comparative, an uncited claim, a bad opening line — those are all judgements
 * about *writing*, and rewriting them here would be a regex doing a
 * copywriter's job badly. They stay with the model, which is what the retry
 * loop is for.
 *
 * So this shrinks the set of things worth retrying rather than replacing the
 * retry. Every repair is reported.
 */

export interface CopyRepair {
  rule: string;
  from: string;
  to: string;
  because: string;
}

export interface RepairedCopy {
  body: string;
  hashtags: string[];
  repairs: CopyRepair[];
}

/**
 * The substitutions, and why each is safe.
 *
 * Each one is a *typographic* variant of a character the piece could have
 * written plainly. None removes a word, and none can flip a meaning — which is
 * the whole test for whether a fix belongs here rather than in a rewrite.
 */
const SUBSTITUTIONS: Array<{ rule: string; find: RegExp; replace: string; because: string }> = [
  {
    rule: 'punctuation.curly_quote',
    find: /[\u2018\u2019]/g,
    replace: "'",
    because: 'a curly apostrophe, which platforms mangle and which says nothing a straight one does not',
  },
  {
    rule: 'punctuation.curly_quote',
    find: /[\u201C\u201D]/g,
    replace: '"',
    because: 'curly quotation marks, replaced with straight ones',
  },
  {
    rule: 'punctuation.em_dash',
    /*
     * A comma, not a hyphen. `slopFilter` calls the em dash the single
     * strongest LLM tell, and the construction it marks — a parenthetical aside
     * — reads correctly with a comma. A hyphen would read as a compound word.
     */
    find: /\s*\u2014\s*/g,
    replace: ', ',
    because: 'an em dash, the strongest LLM tell there is, replaced with the comma it stands for',
  },
  {
    rule: 'punctuation.en_dash',
    find: /\s*\u2013\s*/g,
    replace: '-',
    because: 'an en dash, replaced with a hyphen',
  },
  {
    rule: 'punctuation.ellipsis',
    find: /\u2026/g,
    replace: '...',
    because: 'a single-character ellipsis, which some platforms drop entirely',
  },
  {
    rule: 'punctuation.nbsp',
    find: /\u00A0/g,
    replace: ' ',
    because: 'a non-breaking space, invisible here and a wrapping bug on a phone',
  },
];

/**
 * Repair what can be repaired without rewriting.
 *
 * Returns the copy unchanged, with no repairs, when there is nothing
 * mechanical to fix — which is the common case and must cost nothing.
 */
export function repairCopy(body: string, hashtags: string[] = []): RepairedCopy {
  const repairs: CopyRepair[] = [];
  let text = body;

  for (const { rule, find, replace, because } of SUBSTITUTIONS) {
    const next = text.replace(find, replace);
    if (next !== text) {
      repairs.push({ rule, from: text, to: next, because });
      text = next;
    }
  }

  /*
   * Doubled spaces left by the substitutions above, and trailing whitespace on
   * a line. Not a gate rule — it is tidying after this function's own work, and
   * leaving ", ," where an em dash sat between two commas would be worse than
   * the dash.
   */
  const tidied = text
    .replace(/ {2,}/g, ' ')
    .replace(/ ,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/[ \t]+$/gm, '');
  if (tidied !== text) {
    repairs.push({
      rule: 'whitespace',
      from: text,
      to: tidied,
      because: 'spacing left behind by the substitutions above',
    });
    text = tidied;
  }

  /*
   * Hashtags get the same punctuation treatment: a curly apostrophe in a tag
   * makes it a different tag, which is a silent reach problem rather than a
   * visible one.
   */
  const repairedTags = hashtags.map((tag) =>
    SUBSTITUTIONS.reduce((t, s) => t.replace(s.find, s.replace), tag).replace(/\s+/g, ''),
  );

  return { body: text, hashtags: repairedTags, repairs };
}

/** One line for the log: what was fixed without spending an attempt. */
export function describeRepairs(repairs: CopyRepair[]): string {
  if (repairs.length === 0) return '';
  const rules = [...new Set(repairs.map((r) => r.rule))];
  return `Repaired ${rules.join(', ')} without spending an attempt.`;
}
