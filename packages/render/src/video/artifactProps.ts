/**
 * Props for the Remotion compositions, built from a product artifact.
 *
 * The image pipeline has had `artifactProps.ts` since it was written. The video
 * pipeline never got one, because nothing ever planned a video render — the
 * compositions were only ever driven by their `defaultProps`, which is to say
 * by the sample recipe hard-coded in `root.tsx`.
 *
 * Each builder returns null when the artifact cannot carry that composition,
 * so choosing a template is a matter of asking rather than guessing.
 */
import type { Highlight, ProductArtifact } from '@halyard/core';

/** Composition ids, matching the `Composition` elements registered in root.tsx. */
export type VideoCompositionId =
  | 'TransformationDiff'
  | 'SubstitutionExplainer'
  | 'ScalingMath'
  | 'ChefNoteCard';

function trim(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function swapsIn(artifact: ProductArtifact): Highlight[] {
  return artifact.highlights.filter((h) => h.type === 'swap' && h.before && h.after);
}

/**
 * The headline swap, plus up to two more.
 *
 * Three is the ceiling because the composition animates them in sequence and a
 * fourth pushes a 9:16 frame past the bottom safe area.
 */
export function transformationDiffVideoProps(
  artifact: ProductArtifact,
): Record<string, unknown> | null {
  const swaps = swapsIn(artifact).slice(0, 3);
  if (swaps.length === 0) return null;

  return {
    headline: trim(artifact.headline, 90),
    swaps: swaps.map((s) => ({
      before: s.before!,
      after: s.after!,
      reason: trim(s.reason ?? '', 220),
    })),
  };
}

/**
 * One swap, explained in depth, including what goes wrong without it.
 *
 * Needs a `reason`: without it this composition is a slower TransformationDiff
 * with an empty panel where the explanation should be.
 */
export function substitutionExplainerProps(
  artifact: ProductArtifact,
): Record<string, unknown> | null {
  const swap = swapsIn(artifact).find((s) => (s.reason ?? '').length > 0);
  if (!swap) return null;

  return {
    ingredient: swap.before!,
    substitute: swap.after!,
    ratio: swap.alternative ?? 'Same volume',
    failureMode: trim(swap.reason!, 220),
  };
}

/**
 * A note worth quoting, with the recipe it came from as attribution.
 *
 * `chef_note` is the actual highlight type, and `text` is the field it fills —
 * matching `chefNoteProps` on the image side rather than inventing a shape.
 */
export function chefNoteCardProps(artifact: ProductArtifact): Record<string, unknown> | null {
  const note = artifact.highlights.find((h) => h.type === 'chef_note' && h.text);
  if (!note?.text) return null;

  return {
    quote: trim(note.text, 180),
    attribution: trim(artifact.headline, 90),
  };
}

/**
 * Choose a composition for an artifact.
 *
 * Ordered by how much the artifact supports rather than by preference: a
 * multi-swap adaptation is best shown as a diff, a single well-explained swap
 * as an explainer, and anything else falls back to the quote card, which needs
 * the least.
 *
 * `enabled` is the set of template ids the operator has switched on, so a
 * disabled composition is never chosen — the same rule the image path follows.
 */
export function chooseVideoComposition(
  artifact: ProductArtifact | null | undefined,
  enabled: string[],
): { id: VideoCompositionId; props: Record<string, unknown> } | null {
  if (!artifact) return null;
  const allowed = new Set(enabled);

  const candidates: Array<[VideoCompositionId, Record<string, unknown> | null]> = [
    ['TransformationDiff', transformationDiffVideoProps(artifact)],
    ['SubstitutionExplainer', substitutionExplainerProps(artifact)],
    ['ChefNoteCard', chefNoteCardProps(artifact)],
  ];

  for (const [id, props] of candidates) {
    if (props && allowed.has(id)) return { id, props };
  }
  return null;
}
