/**
 * §419. What shape a caption takes on the screen.
 *
 * `VARIETY_BY_POST_TYPE.md` §2.3 calls this the largest gap and the least
 * obvious, "because nothing renders". A text post's *look* is its shape: where
 * the line breaks fall, whether it opens on a question or a claim, whether it is
 * one sentence or a short list.
 *
 * X and Threads are text-first, and `caption_only`, `caption_link` and `reply`
 * have no treatment layer at all — but the gap is wider than those three. **Every
 * post has a caption**, under every video and every carousel, on every platform.
 * An account whose every caption is a three-line paragraph with the same rhythm
 * reads as automated within a fortnight, and no gate catches it because every
 * individual caption is fine.
 *
 * ## Fit, then recency
 *
 * The rule everywhere else here — `chooseLayout` §293, `chooseQuizTemplate`
 * §302, `chooseStill` §395, `chooseShot` §402 — and it is the right rule. A
 * shape is offered only when the piece can actually take it: a `list` needs
 * items to list, a `setup_turn` needs two halves that disagree, a `receipt`
 * needs something to cite. Offering a shape the piece cannot fill produces a
 * caption pretending to a structure it does not have, which is worse than a
 * plain one.
 *
 * ## This is a brief, not a template
 *
 * Nothing here writes words. The shape is handed to the copywriter as a
 * constraint on form, and the copywriter writes to it — because the shape is a
 * *move* rather than a decoration, and which words fill it is exactly the
 * open-ended work a model should be doing.
 */

export const CAPTION_SHAPES = [
  /** One sentence, no break. A claim that needs no scaffolding. */
  'single',
  /** Two lines with a break between; the second contradicts or completes the first. */
  'setup_turn',
  /** A lead line, then two to four short lines. */
  'list',
  /** Opens interrogative, answers below the fold. */
  'question_open',
  /** The claim, then the evidence in a shorter line under it. */
  'receipt',
] as const;
export type CaptionShape = (typeof CAPTION_SHAPES)[number];

/** What the copywriter is told, in the words it writes to. */
export const SHAPE_BRIEF: Record<CaptionShape, string> = {
  single:
    'One sentence. No line break, no list, no question. It has to stand on its own, so make it the strongest claim the piece has.',
  setup_turn:
    'Two lines with a blank line between them. The first is what a reader already believes; the second turns it over. Do not signpost the turn with "but" or "actually" — the break does that work.',
  list:
    'A lead line, then two to four short lines, one per point. No numbering — the line breaks are the numbering. Each line stands alone.',
  question_open:
    'Open on the question itself, then leave it. Answer nothing in the caption; the piece answers it. One line, ending in the question mark.',
  receipt:
    'The claim on one line, then the evidence under it in a shorter line. The second line names who established it, not a URL.',
};

export interface ShapeFit {
  /** Two or more things the piece could list. */
  itemCount?: number;
  /** The piece has a belief and a correction — a myth, a comparison, a turn. */
  hasTurn?: boolean;
  /** Something citable, so a receipt has a receipt. */
  hasSource?: boolean;
  /** The piece is built around a question it does not answer up front. */
  asksQuestion?: boolean;
}

/**
 * Which shapes this piece could honestly take.
 *
 * `single` is always offered: any piece has a strongest claim. The rest each
 * require something the piece must actually have.
 */
export function shapesThatFit(fit: ShapeFit): CaptionShape[] {
  const out: CaptionShape[] = ['single'];
  if ((fit.itemCount ?? 0) >= 2) out.push('list');
  if (fit.hasTurn) out.push('setup_turn');
  if (fit.asksQuestion) out.push('question_open');
  if (fit.hasSource) out.push('receipt');
  return out;
}

export interface CaptionShapeChoice {
  shape: CaptionShape;
  /** What the copywriter is told. */
  brief: string;
  /** Why this one, in the operator's words. */
  reason: string;
  /** What else it could have been, for the operator to disagree with. */
  alternatives: CaptionShape[];
}

/**
 * Choose a shape: what fits, then what has not been used lately.
 *
 * `recent` is the shapes this account's recent captions took, most recent
 * first. Deterministic, so the same piece against the same history chooses the
 * same shape — a caption regenerated after an edit must not silently change its
 * form.
 */
export function chooseCaptionShape(input: {
  fit: ShapeFit;
  recent?: readonly string[];
  /**
   * Something stable and unique to this piece — its job id will do. §421.
   *
   * Used **only** to break ties between shapes that are equally stale, which is
   * every shape when the history is empty or short. Without it the first option
   * always wins a tie, and three pieces briefed at once all choose `single`:
   * they overlap, so each reads a history the others have not written to yet.
   *
   * Observed exactly that way — three Instagram posts briefed through the UI,
   * two of them chose `single` saying "nothing has been written for this
   * account yet", and only the third, which started after the first had
   * committed, chose differently.
   *
   * A seed is an input, so this stays a pure function and a regenerated caption
   * keeps its shape.
   */
  seed?: string;
}): CaptionShapeChoice {
  const fits = shapesThatFit(input.fit);
  const recent = input.recent ?? [];

  /* FNV-1a over the seed, so the spread is stable and not a random draw. */
  let hash = 2166136261;
  for (const ch of input.seed ?? '') hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  const offset = input.seed ? (hash >>> 0) % Math.max(1, fits.length) : 0;

  const scored = fits
    .map((shape, i) => {
      const at = recent.indexOf(shape);
      return {
        shape,
        staleness: at === -1 ? Number.POSITIVE_INFINITY : at,
        /* Rotated by the seed, so ties do not always fall to the first. */
        offered: (i - offset + fits.length) % fits.length,
      };
    })
    .sort((a, b) => b.staleness - a.staleness || a.offered - b.offered);

  const winner = scored[0]!;
  const unused = winner.staleness === Number.POSITIVE_INFINITY;

  return {
    shape: winner.shape,
    brief: SHAPE_BRIEF[winner.shape],
    reason: unused
      ? recent.length === 0
        ? 'nothing has been written for this account yet'
        : `${winner.shape.replace(/_/g, ' ')} has not been used lately`
      : `every shape this piece can take has been used recently; ${winner.shape.replace(/_/g, ' ')} is the oldest`,
    alternatives: scored.slice(1).map((s) => s.shape),
  };
}
