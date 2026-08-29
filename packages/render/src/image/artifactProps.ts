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
      bodyLines: swaps.slice(0, 3).map((s) => trim(s.reason ?? '', CAROUSEL_BODY_CHARS)),
    });
  }

  if (techniques.length > 0 || notes.length > 0) {
    slides.push({
      kicker: 'Chef notes',
      headline: techniques[0]?.title ?? 'What to watch',
      bodyLines: [
        ...techniques.slice(0, 2).map((t) => trim(t.note ?? '', CAROUSEL_BODY_CHARS)),
        ...notes.slice(0, 1).map((n) => trim(n.text ?? '', CAROUSEL_BODY_CHARS)),
      ].filter(Boolean),
    });
  }

  /**
   * §271. The last slide asks for something.
   *
   * It used to repeat slide one's headline, so the final thing a reader saw was
   * the thing they had already read — and the ending is where saves and shares
   * are decided, which is what a carousel is optimising for. Roughly 5% of
   * brand carousels carry an explicit ask.
   *
   * It **replaces** the old result slide rather than being added after it. The
   * template is `carousel_6` and Instagram crops slides 2..n to match slide 1;
   * a seventh card is a different post shape, and the result slide was the
   * weakest of the six anyway.
   *
   * Deliberately not a link: Instagram does not make one tappable from a
   * carousel, and an unclickable URL rendered into an image tells a reader
   * nobody is paying attention. Saving is the action available on this surface.
   *
   * Product-neutral — it names the thing from the artifact and knows nothing
   * about what a recipe is.
   */
  slides.push({
    kicker: 'The result',
    headline: 'Save this for the next time you make it',
    bodyLines: [
      trim(`${artifact.headline} — the swaps, the reasons, and what each one costs.`, 160),
      ...notes.slice(0, 1).map((n) => trim(n.text ?? '', CAROUSEL_BODY_CHARS)),
    ].filter(Boolean),
  });

  const total = slides.length;
  return slides.map((slide, i) => ({ ...slide, index: i + 1, total }));
}

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * §264. Shorten to a boundary a reader would recognise, never mid-word.
 *
 * This cut at `max` characters and appended `...` to whatever was left, so a
 * production carousel slide read *"keeps the graham flavor and the classic
 * crisp t..."* — stopped inside a word, with a quarter of the canvas empty
 * beneath it. Two faults at once: the budget is a character count that knows
 * nothing about the box, and the fallback cut wherever it happened to land.
 *
 * Now: a sentence end if there is one, else a clause, else a **word** boundary.
 * Never inside a word, because that is the thing that reads as broken software
 * rather than as an abbreviation.
 *
 * The ellipsis is the single character `…`, not three dots — the slop filter
 * looks for `…` when deciding whether copy trails off, and `...` slipped past
 * it.
 */
export function trim(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;

  const cut = clean.slice(0, max);

  /* A sentence that ends inside the budget is the best possible stop. */
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);

  /* Then a clause, which still reads as a deliberate stop. */
  const clause = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('; '));
  if (clause > max * 0.5) return cut.slice(0, clause) + '…';

  /* Otherwise the last whole word. Never a partial one. */
  const word = cut.lastIndexOf(' ');
  const safe = word > 0 ? cut.slice(0, word) : cut;
  return safe.replace(/[\s,;:—-]+$/, '') + '…';
}

/**
 * §264. How much body copy one carousel slide can actually hold.
 *
 * Derived from the box rather than picked: a 4:5 slide is 1080×1350 with 84px
 * side padding, so body sets across ~912px. At 36px with a 1.4 line height that
 * is roughly 46 characters a line and about 50px of height per line, and the
 * slide has ~750px of vertical room once the kicker, headline and wordmark are
 * placed — about fifteen lines, shared between at most three paragraphs.
 *
 * The old budget was 130 characters, which is under three lines of the fifteen
 * available. That is why slides truncated mid-word while most of the canvas sat
 * empty: the limit had nothing to do with the space.
 */
const CAROUSEL_BODY_CHARS = 230;

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
