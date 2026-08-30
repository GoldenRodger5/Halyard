/**
 * §371. A director reads the screenplay, and disagrees out loud.
 *
 * `writeScreenplay` produces scenes carrying `move`, `score`, `gestures`,
 * `ground` and `bedMood` — every decision the motion, music and annotation
 * directors make. And the directors **still decide independently**, so the
 * screenplay describes a piece nobody makes. It is a document about an intended
 * video sitting beside the actual one.
 *
 * The obvious repair is to have each director read the screenplay and use what
 * it says. That is right and it is not enough, because it throws away the
 * director's own judgement silently — and the director is the thing that knows
 * about the ground's measured luminance, the account's recent treatments, and
 * what the last four pieces looked like. The screenplay is written before any of
 * that is known.
 *
 * So: **the screenplay wins, and the disagreement is recorded.** This is the
 * same bargain the Studio already strikes with a pinned direction — *"the
 * directors honour it absolutely, including over their own objection, which
 * they record rather than silently overriding"*. Applied here, it means a piece
 * that came out unlike its screenplay has a written trail saying which director
 * wanted what, and §369's account of the piece shows it.
 *
 * ## Why the director still runs
 *
 * It would be cheaper to skip a director whose decision the screenplay has
 * already made. Cheaper and wrong: the objection is the valuable part. A motion
 * director that would have refused a slow push on a two-second scene is telling
 * you the screenplay is wrong, and the only way to hear that is to ask it.
 */

export interface Honoured<T> {
  /** What will actually be used. */
  value: T;
  /** True when the screenplay overruled the director. */
  overruled: boolean;
  /**
   * The disagreement, in one line, or null when there was none.
   *
   * Written for an operator reading the account of a finished piece, so it
   * names both sides rather than only the winner.
   */
  note: string | null;
}

export interface HonourInput<T> {
  /** What the screenplay staged. Null or undefined means it said nothing. */
  staged: T | null | undefined;
  /** What the director would have chosen on its own. */
  directed: T;
  /** What is being decided, in the operator's words. */
  what: string;
  /** Why the director wanted its own answer. Improves the note; optional. */
  directorsReason?: string;
  /**
   * How to tell two answers apart. Defaults to `Object.is`, which is right for
   * strings and enums and wrong for anything structural.
   */
  same?: (a: T, b: T) => boolean;
}

export function honour<T>(input: HonourInput<T>): Honoured<T> {
  const same = input.same ?? ((a: T, b: T) => Object.is(a, b));

  /*
   * A screenplay that said nothing about this is not an override. Silence and
   * agreement are different facts and only one of them is worth recording.
   */
  if (input.staged === null || input.staged === undefined) {
    return { value: input.directed, overruled: false, note: null };
  }

  if (same(input.staged, input.directed)) {
    return { value: input.staged, overruled: false, note: null };
  }

  const wanted = input.directorsReason ? ` — ${input.directorsReason}` : '';
  return {
    value: input.staged,
    overruled: true,
    note:
      `${input.what}: the screenplay stages ${describe(input.staged)} and the director wanted ` +
      `${describe(input.directed)}${wanted}. The screenplay wins, because it is the piece being made.`,
  };
}

/** A value as a person would read it, without dumping JSON into a sentence. */
function describe(value: unknown): string {
  if (value === null || value === undefined) return 'nothing';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} of them`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['id', 'name', 'title', 'kind', 'type']) {
      const named = record[key];
      if (typeof named === 'string') return named;
    }
    return 'something structural';
  }
  return String(value);
}

/**
 * Every disagreement from a run, ready for the account of the piece.
 *
 * Collected rather than logged one at a time so a caller can record them in one
 * line and an operator reads them together — three directors overruled on one
 * piece is a statement about the screenplay, and three separate log lines is
 * not.
 */
export function disagreements(results: Array<Honoured<unknown>>): string[] {
  return results.filter((r) => r.overruled && r.note).map((r) => r.note!);
}

/**
 * §371. The screenplay's move, in the motion director's vocabulary.
 *
 * The two lists were written for different readers and do not line up.
 * `MOVES` is what a screenwriter stages — *hold, push_in, drift, cut, settle* —
 * and `CAMERA_MOVES` is what a renderer can execute — *still, push, pull, pan,
 * parallax*. Mapping them is a real translation, not a rename, and two of the
 * five staged moves are not camera moves at all:
 *
 * - `cut` is a transition between scenes, not a movement within one. A scene
 *   staged as a cut holds still and the *edit* does the work.
 * - `settle` is a move that ends, which the camera vocabulary has no word for.
 *   A pull is the closest honest reading: it opens out and comes to rest.
 *
 * Returning null for a staged move with no camera equivalent rather than
 * guessing, because a wrong translation would be recorded as a disagreement the
 * director never had.
 */
export function cameraForStagedMove(move: string): string | null {
  switch (move) {
    case 'hold':
      return 'still';
    case 'push_in':
      return 'push';
    case 'drift':
      return 'pan';
    case 'settle':
      return 'pull';
    case 'cut':
      /* A cut is an edit between scenes. Within the scene, nothing moves. */
      return 'still';
    default:
      return null;
  }
}
