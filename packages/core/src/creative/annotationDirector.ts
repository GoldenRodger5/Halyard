/**
 * §331. What gets marked, with what, and when.
 *
 * `CREATIVE_SYSTEM.md` lists a director for every decision that makes a piece —
 * treatment, visual language, typography, opening, motion, voice, audio, media
 * source (§296). Annotation had a *renderer* (§284's drawn marks), a *style*
 * (§330's per-product pack) and *geometry* (§330's `arrowTo`), and **no
 * decision**. Somebody had to place every mark by hand, which cannot happen for
 * content nobody is authoring by hand.
 *
 * ## The rule
 *
 * A mark is earned when **the voice refers to something the frame can locate**.
 * Both halves are required and each rules out a common failure:
 *
 * - Voice without a location gives a mark pointing at nothing, which is the
 *   arrow-in-the-corner that reads as decoration.
 * - A location without voice gives a mark on something nobody mentioned,
 *   which makes a viewer look for a significance that is not there.
 *
 * ## Why this is mostly deterministic
 *
 * For a walkthrough the connection is already recorded and needs no
 * perception: a flow step carries both its `narration` and the box of the
 * element it tapped (§324), so the line *is* about that element by
 * construction. The director's work is choosing which of them are worth
 * marking, in what register, without collisions — all arithmetic.
 *
 * Perception is needed only for the harder case: a narration line written
 * separately from the capture, where "the swaps are explained" has to be
 * matched to a region. That is left to a caller that can see the frame, and
 * this decides everything around it.
 *
 * Nothing here knows what a recipe or a film is. It takes labelled boxes and
 * timed lines.
 */

export interface MarkTarget {
  /** What this region is, in the words the piece uses for it. */
  label: string;
  /** Fractions of the frame. */
  box: { x: number; y: number; width: number; height: number };
  /**
   * When the box is true, in seconds.
   *
   * §319: a position measured at a tap is true at that instant and not after —
   * the page scrolls, a result renders. A target with no window is treated as
   * true only briefly, because assuming otherwise is how a mark drifts onto
   * something nobody pressed.
   */
  atSeconds: number;
  /** How long it stays true. Short by default, for the reason above. */
  validForSeconds?: number;
}

export interface SpokenLine {
  atSeconds: number;
  text: string;
  /** The target this line is about, when that is already known. */
  targetLabel?: string | null;
}

export type MarkKind = 'arrow' | 'circle' | 'box' | 'underline';

export interface PlannedMark {
  kind: MarkKind;
  target: MarkTarget;
  atSeconds: number;
  /** How long the stroke takes. A mark is a gesture, not an animation. */
  durationSeconds: number;
  /** Why this mark exists, in a line an operator can disagree with. */
  reason: string;
}

export interface AnnotationPlan {
  marks: PlannedMark[];
  /** Targets considered and refused, so an absent mark has a reason. */
  skipped: Array<{ label: string; because: string }>;
}

/**
 * The shortest gap between two marks.
 *
 * §319 found two rings drawn at once because two taps were 76ms apart, and two
 * marks at once point at neither. This is longer than that collision window on
 * purpose: a viewer needs to finish reading one mark before another appears, and
 * a piece that marks constantly is a piece where nothing is emphasised.
 */
export const MIN_MARK_GAP_SECONDS = 2.2;

/**
 * How much of a piece may carry a mark.
 *
 * A mark is emphasis, and emphasis is a proportion. Marking a third of a video
 * is not three times as emphatic as marking a tenth — it is a video with no
 * emphasis and a lot of drawing on it.
 */
export const MAX_MARKS_PER_MINUTE = 8;

export interface AnnotationDirection {
  /** Lines being spoken, with their timings. */
  narration: SpokenLine[];
  /** Regions the frame can locate, with the window each is true for. */
  targets: MarkTarget[];
  /** The product's mark vocabulary, best first. From `motifFor`. */
  marks: MarkKind[];
  /** Runtime, so the cap is a proportion rather than a constant. */
  durationSeconds: number;
}

/**
 * Choose which moments get a mark.
 *
 * Ordered by the strength of the connection between a line and a region, so
 * when the cap bites it drops the weakest link rather than whatever came last.
 */
export function planAnnotations(input: AnnotationDirection): AnnotationPlan {
  const marks: PlannedMark[] = [];
  const skipped: Array<{ label: string; because: string }> = [];

  const vocabulary = input.marks.length > 0 ? input.marks : (['circle'] as MarkKind[]);
  const cap = Math.max(1, Math.round((input.durationSeconds / 60) * MAX_MARKS_PER_MINUTE));

  /* Candidates: a line, and the region it is about. */
  const candidates: Array<{ line: SpokenLine; target: MarkTarget; strength: number }> = [];

  for (const line of input.narration) {
    for (const target of input.targets) {
      const validFor = target.validForSeconds ?? 1.2;
      /*
       * The line must be spoken while the region is where it was measured.
       * A little latitude before it, because a narrator naturally speaks just
       * ahead of the thing being pointed at.
       */
      const opens = target.atSeconds - 0.6;
      const closes = target.atSeconds + validFor;
      if (line.atSeconds < opens || line.atSeconds > closes) continue;

      /*
       * A declared connection is the strongest evidence there is: the flow
       * step wrote this line *about* this element, so no matching is needed.
       */
      let strength: number;
      if (line.targetLabel && line.targetLabel === target.label) strength = 1;
      else {
        /* Otherwise, whether the line actually mentions the region's words. */
        const words = target.label
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);
        const said = line.text.toLowerCase();
        const hits = words.filter((w) => said.includes(w)).length;
        strength = words.length > 0 ? (hits / words.length) * 0.8 : 0;
      }

      if (strength <= 0) continue;
      candidates.push({ line, target, strength });
    }
  }

  /* Strongest first, then earliest, so ties resolve stably. */
  candidates.sort((a, b) => b.strength - a.strength || a.line.atSeconds - b.line.atSeconds);

  for (const candidate of candidates) {
    if (marks.length >= cap) {
      skipped.push({
        label: candidate.target.label,
        because: `the piece already carries ${cap} marks, which is the most ${input.durationSeconds.toFixed(0)}s can hold before nothing is emphasised`,
      });
      continue;
    }

    const clash = marks.find(
      (m) => Math.abs(m.atSeconds - candidate.line.atSeconds) < MIN_MARK_GAP_SECONDS,
    );
    if (clash) {
      skipped.push({
        label: candidate.target.label,
        because: `"${clash.target.label}" is marked ${Math.abs(clash.atSeconds - candidate.line.atSeconds).toFixed(1)}s away, and two marks that close point at neither`,
      });
      continue;
    }

    /*
     * The mark kind follows from the region's shape, within the product's
     * vocabulary. A wide, short region is a row or a control and wants a box
     * or an underline; a compact one is a chip or an icon and wants a ring.
     * An arrow is for a region near an edge, where a surround would run off
     * frame.
     */
    const ratio = candidate.target.box.width / Math.max(0.001, candidate.target.box.height);
    const nearEdge =
      candidate.target.box.x < 0.08 ||
      candidate.target.box.x + candidate.target.box.width > 0.92;

    const preferred: MarkKind = nearEdge
      ? 'arrow'
      : ratio > 3.2
        ? 'underline'
        : ratio > 1.6
          ? 'box'
          : 'circle';

    /*
     * The product's pack is a restriction, not a suggestion: if it does not
     * include the ideal shape, the nearest thing it does include is used. An
     * account that circles some things and boxes others looks like several
     * people made it.
     */
    const kind = vocabulary.includes(preferred) ? preferred : vocabulary[0]!;

    marks.push({
      kind,
      target: candidate.target,
      /* On the line, not before it: the mark answers the words. */
      atSeconds: Number(Math.max(0, candidate.line.atSeconds).toFixed(2)),
      durationSeconds: 0.45,
      reason:
        candidate.strength === 1
          ? `the line was written about "${candidate.target.label}", and a ${kind} suits its shape`
          : `"${candidate.target.label}" is named in the line being spoken, and a ${kind} suits its shape`,
    });
  }

  marks.sort((a, b) => a.atSeconds - b.atSeconds);
  return { marks, skipped };
}
