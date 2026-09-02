/**
 * §440. The editor — the only agent here that removes anything.
 *
 * ## Why this exists
 *
 * Every agent in Halyard adds. The researcher adds facts, the writer adds
 * words, the hook generator adds an opening, the annotation director adds
 * marks, the music director adds a bed. Nothing has ever taken anything out.
 *
 * That is not a stylistic observation, it is the mechanical reason a
 * thirty-second format rendered at fifty-three seconds. A pipeline of adders
 * has no equilibrium: it stops when it runs out of stages, not when the piece
 * is the right size.
 *
 * §439 put a budget in front of the writer, which is the better fix because it
 * shapes the piece rather than trimming it. This is the second line: a model
 * told to write 8-word questions writes 8-word questions *most* of the time,
 * and a piece that ships long is a piece that is not distributed.
 *
 * ## What it will and will not do
 *
 * It cuts **structure**, never prose. It will drop the fifth of five questions;
 * it will not shorten a sentence, because shortening a sentence is writing and
 * writing is a model's job. If dropping every droppable instance still leaves
 * the piece over its ceiling, it says so and changes nothing further — an
 * editor that mangled prose to hit a number would be worse than a long piece.
 *
 * The governing rule holds: this is arithmetic and a small set of stated
 * priorities, so it is deterministic. *Agents perceive, code decides*, and "this
 * is fourteen seconds over" is not a perception.
 *
 * ## Everything it does is reported
 *
 * `cut` carries what went and why, and it reaches the Gallery. An operator who
 * reads *"cut question 5 — the budget was 32s and five questions run 47"*
 * understands the piece. One that is quietly shorter has learned nothing, and
 * silent removal is the single fastest way to lose trust in a system that
 * writes on your behalf.
 */
import type { PostFormat } from '../formats/catalog.js';
import { type LengthBand, predictSeconds } from './length.js';

/** One line of a draft, as the editor sees it. */
export interface EditableSlot {
  key: string;
  index: number;
  text: string;
  citation?: string | null;
}

export interface Removal {
  /** `question[4]`, for a person. */
  what: string;
  because: string;
  /** Seconds this removal bought. */
  saved: number;
}

export interface EditResult {
  slots: EditableSlot[];
  cut: Removal[];
  /** What the piece ran before editing. */
  beforeSeconds: number;
  /** What it runs now. */
  afterSeconds: number;
  /**
   * True when the piece is still past its ceiling with everything droppable
   * dropped.
   *
   * The editor stops rather than cutting into the format's minimum, and this
   * is how it says so. The caller decides — regenerate, accept, or refuse —
   * because that is policy and this function does arithmetic.
   */
  stillOver: boolean;
}

/**
 * Cut a draft to fit its band.
 *
 * ## The priorities, stated
 *
 * A deterministic editor cannot judge which of five questions is best, and
 * pretending otherwise would be the kind of false confidence this codebase
 * refuses elsewhere. So the rules are the ones that follow from structure
 * alone, in order:
 *
 * 1. **Only repeating slots are droppable.** A `hook`, a `turn`, a `correction`
 *    is the piece. Dropping one leaves a different, broken format.
 * 2. **Never below the format's own minimum.** `repeatsMin` is the point at
 *    which a quiz stops being a quiz.
 * 3. **Cut from the end of a run.** Not because the last is worst in any
 *    provable sense, but because a writer asked for five things puts its
 *    strongest first — and because cutting from the middle renumbers a
 *    sequence the viewer is counting.
 * 4. **Slots that move together move together.** A question and its answer
 *    share an index; dropping one without the other leaves a reveal with
 *    nothing to reveal.
 * 5. **Stop at the ceiling, not the target.** The target is what the writer was
 *    briefed to; missing it is a warning. The ceiling is where distribution
 *    breaks, and that is the only number worth cutting a piece for.
 */
export function cutToBudget(
  format: PostFormat,
  slots: EditableSlot[],
  band: LengthBand,
): EditResult {
  const textOf = (list: EditableSlot[]) => list.map((s) => s.text);
  const beforeSeconds = predictSeconds(textOf(slots));

  let kept = [...slots];
  const cut: Removal[] = [];

  /*
   * The droppable slots, and how far each may be dropped. Grouped by the range
   * they declare so that peers — a question and its answer — are cut in step
   * rather than independently, which is rule 4.
   */
  const droppable = format.slots.filter(
    (s) => (s.repeats ?? 1) > 1 && typeof s.repeatsMin === 'number' && s.repeatsMin < (s.repeats ?? 1),
  );

  if (droppable.length === 0 || beforeSeconds <= band.ceilingSeconds) {
    return {
      slots: kept,
      cut,
      beforeSeconds,
      afterSeconds: beforeSeconds,
      stillOver: beforeSeconds > band.ceilingSeconds,
    };
  }

  /*
   * Highest index present across the droppable slots, cut one round at a time.
   * A round removes index N from every droppable slot at once, which keeps a
   * reveal attached to its question without the editor needing to know that a
   * quiz has reveals.
   */
  for (;;) {
    const afterSeconds = predictSeconds(textOf(kept));
    if (afterSeconds <= band.ceilingSeconds) break;

    let highest = -1;
    for (const slot of droppable) {
      const present = kept.filter((s) => s.key === slot.key);
      if (present.length <= (slot.repeatsMin ?? 1)) continue;
      highest = Math.max(highest, ...present.map((s) => s.index));
    }
    if (highest < 0) break;

    const going = kept.filter((s) => droppable.some((d) => d.key === s.key) && s.index === highest);
    if (going.length === 0) break;

    const before = predictSeconds(textOf(kept));
    kept = kept.filter((s) => !going.includes(s));
    const saved = Number((before - predictSeconds(textOf(kept))).toFixed(2));

    for (const gone of going) {
      cut.push({
        what: `${gone.key}[${gone.index}]`,
        because:
          `${before.toFixed(1)}s against a ${band.ceilingSeconds}s ceiling on this platform. ` +
          `The target is ${band.targetSeconds}s.`,
        /* Attributed to the round, so the numbers in the report add up. */
        saved: Number((saved / going.length).toFixed(2)),
      });
    }
  }

  const afterSeconds = predictSeconds(textOf(kept));
  return {
    slots: kept,
    cut,
    beforeSeconds,
    afterSeconds,
    stillOver: afterSeconds > band.ceilingSeconds,
  };
}

/** The report an operator reads. Empty string when nothing was cut. */
export function describeEdit(result: EditResult): string {
  if (result.cut.length === 0) return '';
  const what = result.cut.map((c) => c.what).join(', ');
  return (
    `Cut ${what} — ${result.beforeSeconds.toFixed(1)}s down to ${result.afterSeconds.toFixed(1)}s` +
    (result.stillOver ? ', which is still over the ceiling.' : '.')
  );
}
