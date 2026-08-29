/**
 * §284. Drawing on the screen, in time with the words.
 *
 * The one thing NotebookLM-style video does that Halyard could not: marks that
 * *appear as they are talked about*. An underline drawing under a phrase as the
 * voice says it, a circle closing around the thing being discussed, an arrow
 * connecting two ideas, a highlight sweeping across a line.
 *
 * It reads as "a person made this" for a specific reason: the mark is evidence
 * of intent. A layout can be generated; a mark that lands on the right word at
 * the right moment cannot be, unless something knew what the words were and when
 * they were said.
 *
 * ## Why this is not a video model
 *
 * It is animated SVG over a still, and Remotion is exactly the right tool.
 * `strokeDashoffset` interpolated across frames draws a path; the frames come
 * from the per-word caption timings that already exist (§270). The same word
 * timings that made karaoke captions possible land an underline on the right
 * syllable — which is why this was cheap once those were carried, and impossible
 * before.
 *
 * A generated video cannot do this at all: it cannot hit a cue, and re-rendering
 * gives a different result.
 *
 * ## Hand-drawn, not geometric
 *
 * Every mark is deliberately imperfect — a slight arc on an "underline", an
 * overshoot on a circle, an uneven sweep. A geometrically perfect underline
 * reads as a UI element; a slightly wrong one reads as a person with a pen. The
 * imperfection is seeded from the mark's own text so it is stable across
 * re-renders: the same piece drawn twice is drawn identically, which matters
 * because a correction re-renders and the result must not visibly shift.
 */
import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export type AnnotationKind = 'underline' | 'circle' | 'strike' | 'arrow' | 'highlight' | 'box';

export interface Annotation {
  kind: AnnotationKind;
  /** When the mark starts drawing, in seconds. Usually a word's start. */
  atSeconds: number;
  /** How long the stroke takes. Short: a mark is a gesture, not an animation. */
  durationSeconds?: number;
  /**
   * Where it sits, as **fractions of the frame** (0..1), not pixels and not
   * viewBox units. Fractions because a caller placing a mark on a word knows
   * the word's share of a caption and not the canvas size.
   */
  box: { x: number; y: number; width: number; height: number };
  color?: string;
  /** Stable jitter seed. Defaults to the kind and position. */
  seed?: string;
}

/**
 * A small deterministic wobble, in the range ±1.
 *
 * Seeded so a re-render draws the same imperfection. `Math.random()` here would
 * mean a corrected piece visibly differs from the one an operator approved.
 */
function wobble(seed: string, index: number): number {
  let hash = 2166136261;
  const text = `${seed}:${index}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 2000) / 1000 - 1;
}

/**
 * The path for one mark, in viewBox units (0..100 on both axes).
 *
 * `Annotation.box` is in **fractions of the frame** (0..1) because that is what
 * a caller can compute without knowing the canvas — so it is scaled here.
 * Getting this wrong draws every mark as a speck in the top-left corner, which
 * is what the first version did.
 */
const VIEWBOX = 100;

function pathFor(annotation: Annotation, seed: string): string {
  const x = annotation.box.x * VIEWBOX;
  const y = annotation.box.y * VIEWBOX;
  const w = annotation.box.width * VIEWBOX;
  const h = annotation.box.height * VIEWBOX;
  const j = (i: number, amount = 1.2) => wobble(seed, i) * amount;

  switch (annotation.kind) {
    case 'underline': {
      /* A single stroke with a slight sag, the way a hand draws one. */
      const baseline = y + h;
      return `M ${x + j(1)} ${baseline + j(2, 0.6)} Q ${x + w / 2} ${baseline + 1.4 + j(3, 0.5)} ${x + w + j(4)} ${baseline + j(5, 0.6)}`;
    }
    case 'strike': {
      const mid = y + h / 2;
      return `M ${x + j(1)} ${mid + j(2, 0.5)} L ${x + w + j(3)} ${mid + j(4, 0.5)}`;
    }
    case 'circle': {
      /*
       * An ellipse drawn as two arcs that overshoot where they meet — the
       * closing overlap is what makes a hand-drawn ring read as one.
       */
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = w / 2 + 1.5 + j(1, 0.8);
      const ry = h / 2 + 1.5 + j(2, 0.8);
      return [
        `M ${cx + rx} ${cy}`,
        `A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy}`,
        `A ${rx} ${ry} 0 1 1 ${cx + rx + j(3, 0.6)} ${cy - 1.2}`,
      ].join(' ');
    }
    case 'box': {
      return [
        `M ${x + j(1)} ${y + j(2)}`,
        `L ${x + w + j(3)} ${y + j(4)}`,
        `L ${x + w + j(5)} ${y + h + j(6)}`,
        `L ${x + j(7)} ${y + h + j(8)}`,
        'Z',
      ].join(' ');
    }
    case 'arrow': {
      const x2 = x + w;
      const y2 = y + h;
      const head = 2.5;
      return [
        `M ${x + j(1)} ${y + j(2)}`,
        `Q ${x + w * 0.6} ${y + h * 0.2} ${x2 + j(3)} ${y2 + j(4)}`,
        `M ${x2} ${y2}`,
        `L ${x2 - head} ${y2 - head * 0.6}`,
        `M ${x2} ${y2}`,
        `L ${x2 - head * 0.6} ${y2 - head}`,
      ].join(' ');
    }
    case 'highlight': {
      /* A thick single sweep, drawn behind the text rather than over it. */
      const mid = y + h / 2;
      return `M ${x} ${mid + j(1, 0.4)} L ${x + w} ${mid + j(2, 0.4)}`;
    }
  }
}

/** How thick each mark is, and whether it sits behind the type. */
const STYLE: Record<AnnotationKind, { width: number; behind: boolean; opacity: number }> = {
  underline: { width: 0.9, behind: false, opacity: 1 },
  strike: { width: 0.8, behind: false, opacity: 1 },
  circle: { width: 0.8, behind: false, opacity: 1 },
  box: { width: 0.8, behind: false, opacity: 1 },
  arrow: { width: 0.8, behind: false, opacity: 1 },
  /* A highlighter goes under the words, or it hides them. */
  highlight: { width: 6, behind: true, opacity: 0.32 },
};

export const Annotations: React.FC<{
  annotations: Annotation[];
  /** The accent to draw in. */
  color: string;
}> = ({ annotations, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;

  const visible = annotations.filter((a) => seconds >= a.atSeconds);
  if (visible.length === 0) return null;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {visible.map((annotation, i) => {
        const style = STYLE[annotation.kind];
        const seed = annotation.seed ?? `${annotation.kind}:${annotation.box.x}:${annotation.box.y}`;
        const duration = annotation.durationSeconds ?? 0.45;

        /*
         * The stroke draws in rather than appearing. `strokeDasharray` set to
         * the path length with the offset animated from full to zero is the
         * standard trick, and 140 is a safe over-estimate of any path length in
         * a 100-unit viewBox — an over-estimate just starts the draw slightly
         * later, while an under-estimate would leave the mark unfinished.
         */
        const progress = interpolate(
          seconds,
          [annotation.atSeconds, annotation.atSeconds + duration],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );

        return (
          <path
            key={`${annotation.kind}-${i}`}
            d={pathFor(annotation, seed)}
            fill="none"
            stroke={annotation.color ?? color}
            strokeWidth={style.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={style.opacity}
            strokeDasharray={140}
            strokeDashoffset={progress * 140}
            /* Non-scaling stroke keeps the weight even under the stretched viewBox. */
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
};

/**
 * Place a mark on the word a cue is about.
 *
 * Given a cue's words and the phrase to mark, returns the box to draw over and
 * the moment to start — derived from the word timings rather than guessed, which
 * is the whole reason this can be automatic.
 *
 * Returns null when the phrase is not in the cue: a mark drawn over the wrong
 * words is worse than no mark, and guessing a position is exactly how an
 * annotation stops reading as intentional.
 */
export function annotationForPhrase(input: {
  words: Array<{ text: string; startSeconds: number; endSeconds: number }>;
  phrase: string;
  kind: AnnotationKind;
  /** The caption's own box in the frame, as fractions. */
  captionBox: { x: number; y: number; width: number; height: number };
}): Annotation | null {
  const target = input.phrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (target.length === 0 || input.words.length === 0) return null;

  const clean = (w: string) => w.toLowerCase().replace(/[^a-z0-9'-]/g, '');
  const words = input.words.map((w) => clean(w.text));

  let start = -1;
  for (let i = 0; i <= words.length - target.length; i += 1) {
    if (target.every((t, k) => words[i + k] === clean(t))) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  const end = start + target.length - 1;

  /*
   * Horizontal position weighted by **character count**, not word count.
   *
   * Weighting by words assumes every word is the same width, and the error is
   * visible the moment a long word sits at the end of a line: a circle asked
   * for "gluten-free" in "Your dusting flour is not gluten-free" landed over
   * "en-free", because the last of six words is not the last sixth of the
   * measure.
   *
   * Character count with a space between each is a good enough proxy for a
   * proportional face at this size — the residual error is smaller than the
   * deliberate wobble in the stroke itself, which is the point at which more
   * precision stops being visible.
   */
  const widths = input.words.map((w) => w.text.length + 1);
  const total = widths.reduce((sum, n) => sum + n, 0);
  const upTo = (index: number) => widths.slice(0, index).reduce((sum, n) => sum + n, 0);

  const left = upTo(start) / total;
  const right = upTo(end + 1) / total;

  return {
    kind: input.kind,
    atSeconds: input.words[start]!.startSeconds,
    box: {
      x: input.captionBox.x + left * input.captionBox.width,
      y: input.captionBox.y,
      width: (right - left) * input.captionBox.width,
      height: input.captionBox.height,
    },
    seed: `${input.kind}:${input.phrase}`,
  };
}
