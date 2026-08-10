/**
 * Artifact → template props.
 *
 * This is where "content is built from real product output" becomes concrete:
 * every string on a rendered card comes from a highlight, and every highlight
 * carries the source path Gate 2 verifies. Nothing on a card is invented here.
 */
import type { ProductArtifact } from '@halyard/core';
import type {
  CarouselSlideProps,
  ChefNoteProps,
  ScalingMathProps,
  SubstitutionRatioProps,
  TransformationDiffProps,
} from './templates.js';

type WithoutChrome<T> = Omit<T, 'brand' | 'aspectRatio' | 'wordmark'>;

export function transformationDiffProps(
  artifact: ProductArtifact,
  highlightIndex = 0,
): WithoutChrome<TransformationDiffProps> | null {
  const swaps = artifact.highlights.filter((h) => h.type === 'swap');
  const swap = swaps[highlightIndex];
  if (!swap) return null;

  return {
    headline: artifact.headline,
    before: swap.before ?? 'nothing',
    after: swap.after ?? '',
    reason: trim(swap.reason ?? '', 220),
    alternative: swap.alternative ?? null,
  };
}

export function chefNoteProps(
  artifact: ProductArtifact,
  index = 0,
): WithoutChrome<ChefNoteProps> | null {
  const notes = artifact.highlights.filter((h) => h.type === 'chef_note' && h.text);
  const note = notes[index];
  if (!note?.text) return null;
  return { quote: trim(note.text, 180), attribution: artifact.headline };
}

export function substitutionRatioProps(
  artifact: ProductArtifact,
  index = 0,
): WithoutChrome<SubstitutionRatioProps> | null {
  const swaps = artifact.highlights.filter((h) => h.type === 'swap' && h.before && h.after);
  const swap = swaps[index];
  if (!swap) return null;

  return {
    ingredient: shortestNoun(swap.before ?? ''),
    substitute: shortestNoun(swap.after ?? ''),
    ratio: extractRatio(swap.before ?? '', swap.after ?? ''),
    failureMode: trim(swap.reason ?? '', 200),
  };
}

export function scalingMathProps(
  artifact: ProductArtifact,
  servings: { from: number; to: number },
): WithoutChrome<ScalingMathProps> | null {
  const scaled = artifact.highlights.filter((h) => h.type === 'scaling');
  const rows = scaled.slice(0, 4).map((h) => ({
    label: shortestNoun(h.before ?? h.title ?? ''),
    linear: h.before ?? '',
    actual: h.after ?? '',
  }));
  if (rows.length === 0) return null;

  return {
    fromServings: servings.from,
    toServings: servings.to,
    rows,
    note: trim(scaled[0]?.reason ?? '', 180),
  };
}

/**
 * The six-slide carousel from v1 §5.1:
 *   original → what breaks → swaps → why → chef notes → result
 *
 * Slides are only produced when the artifact actually supports them, so a thin
 * adaptation yields four slides rather than six slides of padding.
 */
export function carouselProps(
  artifact: ProductArtifact,
): Array<WithoutChrome<CarouselSlideProps>> {
  const swaps = artifact.highlights.filter((h) => h.type === 'swap');
  const techniques = artifact.highlights.filter((h) => h.type === 'technique');
  const notes = artifact.highlights.filter((h) => h.type === 'chef_note');

  const slides: Array<{ kicker: string; headline: string; bodyLines: string[] }> = [];

  slides.push({
    kicker: 'The original',
    headline: artifact.headline,
    bodyLines: swaps.slice(0, 3).map((s) => s.before ?? '').filter(Boolean),
  });

  if (swaps.length > 0) {
    slides.push({
      kicker: 'What breaks',
      headline: firstSentence(swaps[0]!.reason ?? ''),
      bodyLines: [],
    });
  }

  if (swaps.length > 0) {
    slides.push({
      kicker: 'The swaps',
      headline: `${swaps.length} change${swaps.length === 1 ? '' : 's'}`,
      // Written as words rather than an arrow glyph: the latin font subset has
      // no U+2192, and a tofu box on slide 3 is a very visible failure.
      bodyLines: swaps
        .slice(0, 4)
        .map((s) => (s.before ? `${s.before} becomes ${s.after ?? ''}` : `add ${s.after ?? ''}`)),
    });
  }

  if (swaps.length > 0) {
    slides.push({
      kicker: 'Why',
      headline: 'The mechanism',
      bodyLines: swaps.slice(0, 3).map((s) => trim(s.reason ?? '', 130)),
    });
  }

  if (techniques.length > 0 || notes.length > 0) {
    slides.push({
      kicker: 'Chef notes',
      headline: techniques[0]?.title ?? 'What to watch',
      bodyLines: [
        ...techniques.slice(0, 2).map((t) => trim(t.note ?? '', 130)),
        ...notes.slice(0, 1).map((n) => trim(n.text ?? '', 130)),
      ].filter(Boolean),
    });
  }

  slides.push({
    kicker: 'The result',
    headline: artifact.headline,
    bodyLines: notes.slice(0, 2).map((n) => trim(n.text ?? '', 130)),
  });

  const total = slides.length;
  return slides.map((slide, i) => ({ ...slide, index: i + 1, total }));
}

// ── helpers ────────────────────────────────────────────────────────────────

function trim(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(', '));
  return (lastStop > max * 0.6 ? cut.slice(0, lastStop) : cut.trimEnd()) + '...';
}

function firstSentence(value: string): string {
  const match = /^[^.!?]+[.!?]/.exec(value.trim());
  return trim(match ? match[0] : value, 90);
}

/** Strip a leading quantity so "3 1/4 cups bread flour" reads as "bread flour". */
function shortestNoun(value: string): string {
  return (
    value
      .replace(/^[\d\s./¼½¾⅓⅔⅛]+/, '')
      .replace(/^(cups?|tablespoons?|teaspoons?|tbsp|tsp|grams?|g|oz|ounces?|ml|l|pounds?|lb)\s+/i, '')
      .trim() || value
  );
}

/** "3 1/4 cups → 3 1/4 cups" becomes "1 : 1"; different amounts become the pair. */
function extractRatio(before: string, after: string): string {
  const beforeQty = /^[\d\s./¼½¾⅓⅔⅛]+/.exec(before)?.[0]?.trim();
  const afterQty = /^[\d\s./¼½¾⅓⅔⅛]+/.exec(after)?.[0]?.trim();
  if (!beforeQty || !afterQty) return 'Different, not equal';
  if (beforeQty === afterQty) return `${beforeQty} : ${afterQty}, by volume only`;
  return `${beforeQty} becomes ${afterQty}`;
}
