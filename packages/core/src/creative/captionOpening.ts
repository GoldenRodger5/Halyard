/**
 * §523. How a caption opens, as an axis the account can be varied on.
 *
 * ## What was found
 *
 * Ten of the last twelve captions across two products and three platforms
 * opened with the same construction:
 *
 *     Wet steak stalls: surface water spends pan heat on evaporation…
 *     Mushy ramen starts early: slow heat softens noodles, so add them last.
 *     Gluten hides in pie: only cookies and 3 Tbsp flour changed.
 *     Labels hide tradeoffs: in 1266, wheat prices helped define a legal loaf.
 *
 * A short symptom clause, a colon, the mechanism. Each one is defensible on its
 * own — accurate, specific, no banned phrase, no em dash, passing every rule in
 * `slopFilter`. Together they are a tell. An account that posts this shape
 * daily reads as automated inside a week, which is exactly the failure
 * `captionShape.ts` opens by describing: *"no gate catches it because every
 * individual caption is fine."* It was right, and it was watching the wrong
 * axis — `caption_shape` was varying while every `single` opened identically.
 *
 * ## Why a formula and not a style rule
 *
 * The colon construction is not bad. It is bad *ten times in a row*. So this is
 * a recency axis in the sense of §444, not a prohibition: the move is named,
 * the account's recent moves are handed to the copywriter, and it is asked for
 * one that has not been used. The only move treated as a genuine defect is
 * `label_colon`, because the clause before the colon is a topic label rather
 * than something a person would say aloud, and that is the specific shape that
 * reads as machine-written.
 *
 * ## Only what can be detected without guessing
 *
 * There is no part-of-speech tagger here and there should not be one. Every
 * move below is decided by a regular expression over the first sentence, and
 * anything not matched is `claim` rather than a wrong guess. A classifier that
 * is confidently wrong about the opening move would feed the copywriter a
 * prohibition against something it did not do.
 */

/** The opening moves a caption can make, as far as code can tell them apart. */
export const CAPTION_OPENINGS = [
  /**
   * A short topic label, a colon, then the substance.
   *
   * The one treated as a defect. "Dairy-free pastry confusion:" is not a
   * sentence; it is a filing category, and no one writes it in a caption they
   * expect a person to read.
   */
  'label_colon',
  /** The first sentence is a question. Opens a loop the piece closes. */
  'question',
  /** Opens on a figure. Promises a payload before the sentence resolves. */
  'number_lead',
  /** Opens by naming the reader: "You", "Your", "If you". */
  'direct_address',
  /** Opens with a command. "Stop", "Try", "Skip". */
  'imperative',
  /** Anything else: a plain declarative claim. The healthy default. */
  'claim',
] as const;
export type CaptionOpening = (typeof CAPTION_OPENINGS)[number];

/**
 * The small set of verbs common enough at the head of a social caption to be
 * recognised without a tagger.
 *
 * Deliberately short. A long list would start matching nouns that share a form
 * ("Cook", "Taste", "Rest"), and a caption misfiled as `imperative` teaches the
 * copywriter to avoid a move it never made. Everything unmatched falls to
 * `claim`, which is the safe answer.
 */
const IMPERATIVE_OPENERS = [
  'stop', 'start', 'try', 'skip', 'never', 'always', 'forget', 'add', 'use',
  'check', 'watch', 'read', 'pick', 'choose', 'open', 'keep', 'drop', 'take',
  'make', 'do', 'ask', 'look', 'remember', 'ignore',
];

/** The first sentence, or the first line if the caption breaks before one ends. */
function firstSentence(body: string): string {
  const line = body.trim().split('\n')[0] ?? '';
  const stop = line.search(/[.!?](\s|$)/);
  return (stop === -1 ? line : line.slice(0, stop + 1)).trim();
}

/**
 * §523. Which opening move this caption makes.
 *
 * Order matters: `label_colon` is tested first because a labelled opening can
 * also start with a number ("3 fixes: …") and the colon is the more
 * characteristic tell.
 */
export function openingFormula(body: string): CaptionOpening {
  const first = firstSentence(body);
  if (!first) return 'claim';

  /*
   * A colon within the opening clause, with a short run of words before it.
   * The width bound is what separates a label from a sentence that happens to
   * contain a colon later on: "The reason nobody finishes a watchlist is
   * simple: …" is a sentence, and at nine words before the colon it is not
   * caught here. Six words is where the observed run sat — the longest of the
   * ten was "Underseasoned noodles need timing" at four.
   */
  const colon = first.match(/^([^:\n]{1,48}):\s+\S/);
  if (colon && (colon[1] ?? '').trim().split(/\s+/).length <= 6) return 'label_colon';

  if (first.endsWith('?')) return 'question';

  const head = first.replace(/^[^A-Za-z0-9]+/, '');
  if (/^\d/.test(head)) return 'number_lead';

  const word = (head.split(/[\s,.]+/)[0] ?? '').toLowerCase();
  if (word === 'you' || word === 'your' || word === 'youre' || word === 'if') {
    return 'direct_address';
  }
  if (IMPERATIVE_OPENERS.includes(word)) return 'imperative';

  return 'claim';
}

/** What the copywriter is told about a move it should not repeat. */
export const OPENING_BRIEF: Record<CaptionOpening, string> = {
  label_colon:
    'a short topic label followed by a colon ("Wet steak stalls: …"). Never use this one: it is a filing category, not something a person says.',
  question: 'a question as the first sentence',
  number_lead: 'a figure as the first word',
  direct_address: 'naming the reader first ("You", "Your", "If you")',
  imperative: 'a command as the first word ("Stop", "Try", "Skip")',
  claim: 'a plain declarative statement',
};

/**
 * §544. The connective an account leans on.
 *
 * §523 fixed how a caption *opens* and the tic moved inward. Measured across
 * 24 consecutive captions afterwards: **10 of them contained a sentence
 * starting "So"** — twice the next most common opener, across two products and
 * three platforms. Every one is defensible alone; together they are one voice
 * with one move, [observation]. So [prescription], forever.
 *
 * This is the same failure `captionShape.ts` opens by describing and §523
 * caught at the first word. A gate cannot refuse "So" — it is a good word — so
 * this is a recency reading like §444's, handed to the writer as something the
 * account has been doing rather than a rule about English.
 */
const CONNECTIVES = ['so', 'and', 'but', 'because', 'which', 'then', 'instead'];

/** How a caption's sentences begin, after the first. */
export function connectivesIn(body: string): string[] {
  const sentences = body
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .slice(1);
  return sentences
    .map((s) => (s.trim().match(/^[A-Za-z']+/) ?? [''])[0].toLowerCase())
    .filter((w) => CONNECTIVES.includes(w));
}

export interface OpeningGuidance {
  /** Moves used often enough in the window that another would read as a habit. */
  overused: CaptionOpening[];
  /** §544. Connectives the account has been leaning on, worst first. */
  leaned: string[];
  /** The paragraph handed to the copywriter, or null when there is nothing to say. */
  brief: string | null;
}

/**
 * §523. What to tell the copywriter about how not to open.
 *
 * `recent` is the account's recent captions, newest first — the bodies, not a
 * stored classification. Computing the move from the text means this works on
 * every row already in the table and cannot drift out of step with a column
 * that something forgot to write, which is the failure mode of half the
 * gotchas in this repo.
 *
 * `label_colon` is always named, even when unused, because it is the one move
 * that is wrong the first time rather than the fourth.
 */
export function openingGuidance(recent: readonly string[], window = 8): OpeningGuidance {
  const moves = recent.slice(0, window).map(openingFormula);
  const counts = new Map<CaptionOpening, number>();
  for (const m of moves) counts.set(m, (counts.get(m) ?? 0) + 1);

  /*
   * Two in the window is a coincidence; three is a habit the reader can feel.
   * `claim` is exempt from the count — it is the residual category rather than
   * a move, and demoting it would push the copywriter toward the four
   * decorated openings, which is the opposite of the point.
   */
  const overused = [...counts.entries()]
    .filter(([move, n]) => move !== 'claim' && move !== 'label_colon' && n >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([move]) => move);

  /*
   * §544. A third of the window, with a floor of three.
   *
   * Set at half first, and measured against the real corpus it never fired:
   * "so" sits at 3 of 8, 5 of 12 and 10 of 24 — a flat **42%** at every window
   * size — so a half threshold made this rule dead code, which is the exact
   * defect this session keeps finding. A third catches it at every size while
   * leaving the next connective alone: "which" runs 2 of 8 and 4 of 24 and
   * stays unflagged, which is right, because that is variety rather than a tic.
   *
   * The floor of three matters more than the fraction. Two captions sharing a
   * connective is coincidence, and a writer told to avoid a common word on thin
   * evidence writes around it badly.
   */
  const connectiveCounts = new Map<string, number>();
  for (const body of recent.slice(0, window)) {
    for (const c of new Set(connectivesIn(body))) {
      connectiveCounts.set(c, (connectiveCounts.get(c) ?? 0) + 1);
    }
  }
  const leaned = [...connectiveCounts.entries()]
    .filter(([, n]) => n >= Math.max(3, Math.ceil(moves.length / 3)))
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);

  const usedLabel = counts.get('label_colon') ?? 0;
  const lines: string[] = [];

  lines.push(`Do not open with ${OPENING_BRIEF.label_colon}`);
  if (usedLabel > 0) {
    lines.push(
      `${usedLabel} of the last ${moves.length} captions for this account opened that way. Break the run.`,
    );
  }
  for (const move of overused) {
    lines.push(
      `Also avoid ${OPENING_BRIEF[move]} — ${counts.get(move)} of the last ${moves.length} captions opened that way.`,
    );
  }

  for (const connective of leaned) {
    lines.push(
      `And do not hinge a sentence on "${connective}" — ${connectiveCounts.get(connective)} of the ` +
        `last ${moves.length} captions for this account did. Join the thought a different way, or do not join it.`,
    );
  }

  return { overused, leaned, brief: lines.join(' ') };
}
