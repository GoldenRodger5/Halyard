/**
 * §444. What the account looks like, as opposed to what this piece looks like.
 *
 * ## The gap
 *
 * Halyard has five independent recency mechanisms:
 *
 *   `chooseLayout` (§293) · `chooseQuizTemplate` (§302) · `chooseStill` (§395)
 *   `chooseShot` (§402) · `chooseCaptionShape` (§419)
 *
 * Each is correct. Each rotates its own vocabulary against what was used most
 * recently **on its own axis, in ignorance of the other four**, and each sees
 * only "what came immediately before" rather than "what this account has been
 * doing".
 *
 * Two consequences, and the second is the one that matters:
 *
 * 1. **Nothing holds the account.** Five pieces can each be individually varied
 *    and collectively monotonous — a different framing every time, and every
 *    one of them an overhead flat lay in warm light because that is what
 *    `stalest` happened to return each time the immediately-previous piece was
 *    something else.
 * 2. **A run is invisible.** `stalest` demotes the last value used. It cannot
 *    see three overhead flat-lays in the last eight pieces if a macro detail
 *    sat between two of them, so the axis reads as varied and the feed does
 *    not.
 *
 * That is the original complaint — *"of course we can't have multiple videos
 * with the same stale background"* — one level up: not the same picture twice,
 * but the same *account* every time.
 *
 * ## What this is
 *
 * One reading of the account across every axis, and a way to feed its answer
 * back through the machinery that already exists. It does **not** replace the
 * five choosers. It augments the history each of them is given, so a value that
 * is over-represented in the window is demoted by exactly the mechanism that
 * already demotes a value used last time.
 *
 * That is deliberate. Replacing five working rotations with one central
 * decision would be a rewrite; making them see further is a widening. And it
 * keeps the rule this codebase runs on: the choosers still decide, in code,
 * from a list.
 */

/** One axis of the account's look, over the window. */
export interface AxisReading {
  /** `framing`, `still_layout`, `caption_shape`, `quiz_template`, … */
  axis: string;
  value: string;
  /** How many pieces in the window used it. */
  used: number;
  /** How many pieces the window held. */
  of: number;
  /** The longest consecutive run of it, anywhere in the window. */
  run: number;
}

export interface Continuity {
  lookback: number;
  /** Values doing too much of the work, worst first. */
  overused: AxisReading[];
  /** Every reading, for an operator who wants the whole picture. */
  readings: AxisReading[];
  /** One line a person can read. */
  summary: string;
}

/**
 * A value is over-represented when it carries more than this share of the
 * window.
 *
 * Two in five is a texture; three in five is a habit. Set against the window
 * rather than as a count so a short history is judged as gently as it deserves
 * — with three pieces on record, nothing is a habit yet.
 */
export const OVERUSE_SHARE = 0.4;

/**
 * A run this long is over-representation regardless of share.
 *
 * Three consecutive pieces on one framing reads as a decision even when the
 * window is long enough that the share looks harmless — and consecutiveness is
 * precisely what a viewer scrolling a profile grid sees.
 */
export const OVERUSE_RUN = 3;

/**
 * The fewest pieces on an axis before a *share* means anything.
 *
 * Two of four is 50% and is not a habit, it is a coin landing twice. Judging
 * share on a short history would make a brand-new account's second piece
 * "over-represented" and send every axis chasing its own tail before there was
 * anything to vary from.
 *
 * A **run** is judged at any length, because three consecutive pieces is three
 * consecutive pieces however new the account is — that is what somebody
 * scrolling a profile grid actually sees.
 */
export const MIN_WINDOW_FOR_SHARE = 5;

/**
 * Read an account's recent pieces.
 *
 * `pieces` is newest first, each a map of axis to the value that piece used.
 * A missing axis on a piece means that piece had no answer for it — a text post
 * has no framing — and is skipped rather than counted as a value, because
 * counting absence would make "no framing" the most over-used framing on any
 * account that posts text.
 */
export function readContinuity(
  pieces: ReadonlyArray<Readonly<Record<string, string | null | undefined>>>,
  lookback = 8,
): Continuity {
  const window = pieces.slice(0, lookback);
  const axes = new Set<string>();
  for (const piece of window) for (const axis of Object.keys(piece)) axes.add(axis);

  const readings: AxisReading[] = [];
  for (const axis of axes) {
    /* Only the pieces that had an answer on this axis. */
    const values = window
      .map((piece) => piece[axis])
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (values.length === 0) continue;

    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

    for (const [value, used] of counts) {
      let run = 0;
      let best = 0;
      for (const v of values) {
        run = v === value ? run + 1 : 0;
        if (run > best) best = run;
      }
      readings.push({ axis, value, used, of: values.length, run: best });
    }
  }

  const overused = readings
    .filter(
      (r) =>
        (r.of >= MIN_WINDOW_FOR_SHARE && r.used / r.of > OVERUSE_SHARE) || r.run >= OVERUSE_RUN,
    )
    .sort((a, b) => b.run - a.run || b.used / b.of - a.used / a.of);

  return {
    lookback,
    readings,
    overused,
    summary:
      overused.length === 0
        ? `Nothing is over-represented across the last ${window.length} pieces.`
        : overused
            .map(
              (r) =>
                `${r.axis} "${r.value}" in ${r.used} of ${r.of}` +
                (r.run >= OVERUSE_RUN ? `, ${r.run} in a row` : ''),
            )
            .join('; '),
  };
}

/**
 * The history to hand a chooser, widened by what the account has been doing.
 *
 * Every chooser here takes a `recent` list, newest first, and picks the value
 * least recently used. So an over-represented value is demoted by *putting it
 * at the front* — which is not a hack, it is the same statement the list
 * already makes: "this was used recently, pick something else."
 *
 * Returned rather than applied, so the caller can log what was added and why.
 * A chooser that silently received a longer list than it was given would be
 * harder to reason about than one whose input is visible.
 */
export function withContinuity(
  recent: ReadonlyArray<string | null | undefined>,
  continuity: Continuity,
  axis: string,
): string[] {
  const demote = continuity.overused.filter((r) => r.axis === axis).map((r) => r.value);
  const already = new Set(recent.filter((v): v is string => typeof v === 'string'));
  /*
   * A value already at the head of `recent` needs no help; adding it twice
   * would only make the list longer. Only the ones the plain list cannot see —
   * the run that had something in the middle of it — are prepended.
   */
  const added = demote.filter((v) => !already.has(v));
  return [
    ...added,
    ...recent.filter((v): v is string => typeof v === 'string' && v.length > 0),
  ];
}
