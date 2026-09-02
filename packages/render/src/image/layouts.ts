/**
 * §267. Carousel layouts — the composition, separate from the type.
 *
 * Halyard renders for whatever product is attached to it, so nothing here knows
 * what a recipe is. A layout is a **shape for an argument**: a claim on its own,
 * a claim with support, a number that carries the point, a term being defined,
 * a step in a sequence. Every product has those; only the words change.
 *
 * §265 gave the image path six typography systems and every slide still had one
 * composition, so a feed varied by font and by nothing else. Type alone does not
 * read as variety at feed size — the eye reads *position* first. These are the
 * positions.
 *
 * Layouts are chosen, not cycled: `chooseLayout` maps the slide's role and the
 * piece's visual language onto a shape, and breaks ties by what the account has
 * used least recently. A hook slide gets a layout that can carry six words at
 * display size; a slide with three supporting sentences gets one that can hold
 * them without shrinking to nothing.
 */
import { box, text, type SatoriElement } from './elements.js';
import { CANVAS, paddingFor, type BrandTokens } from '../brand.js';
import type { RenderTypography } from './templates.js';

export const CAROUSEL_LAYOUTS = [
  'editorial',
  'statement',
  'numbered',
  'split_rule',
  'lead_emphasis',
  'photo_lead',
  'photo_overlay',
] as const;

export type CarouselLayout = (typeof CAROUSEL_LAYOUTS)[number];

/** What the slide is doing in the argument, in product-neutral terms. */
export type SlideRole = 'hook' | 'problem' | 'detail' | 'evidence' | 'close';

/**
 * Which layouts suit which visual language.
 *
 * A language that is calm and considered should not open on a slab of display
 * type, and one built on momentum should not be given a quiet editorial column.
 * A language nothing declares gets the whole set rather than a default, for the
 * same reason `selectTypography` does: a default is how a new language silently
 * inherits the look of every old one.
 */
export const LAYOUTS_FOR_LANGUAGE: Record<string, CarouselLayout[]> = {
  documentary: ['editorial', 'split_rule'],
  clean_modern: ['editorial', 'split_rule', 'numbered'],
  premium_instructional: ['editorial', 'numbered', 'split_rule'],
  bold_social: ['statement', 'lead_emphasis', 'numbered'],
  energetic_short: ['statement', 'lead_emphasis'],
  fast_cut_creator: ['statement', 'lead_emphasis', 'numbered'],
  kinetic: ['statement', 'lead_emphasis'],
  editorial_calm: ['editorial', 'split_rule'],
  geometric: ['numbered', 'split_rule', 'editorial'],
};

/**
 * §268. Layouts that need a photograph and are unusable without one.
 *
 * Kept out of every language's default pool: `chooseLayout` only reaches for
 * them when the caller says an image exists, because a photo layout with no
 * photo renders a hole.
 */
export const PHOTO_LAYOUTS: CarouselLayout[] = ['photo_lead', 'photo_overlay'];

/** Layouts that can carry a slide with no body copy at all. */
const BODYLESS: CarouselLayout[] = ['statement', 'lead_emphasis', 'numbered'];

/** Layouts that hold three or more supporting lines without crowding. */
const ROOMY: CarouselLayout[] = ['editorial', 'split_rule'];

export function chooseLayout(input: {
  role: SlideRole;
  visualLanguage?: string;
  bodyLineCount: number;
  /**
   * Words in the headline. §424.
   *
   * `lead_emphasis` inverts the hierarchy — the headline is set small in caps
   * as a label and the first body line takes the display size. That is a good
   * move for a short headline and a bad one for a long one: rendered at the
   * size a phone shows it, "REFRIGERATORS MAKE BREAD GO STALE FASTER" wraps to
   * two lines of small caps and reads as a label that has outgrown its job.
   *
   * Optional, so a caller that does not know keeps the old behaviour rather
   * than silently losing a layout.
   */
  headlineWords?: number;
  recentLayouts?: CarouselLayout[];
  /** §268. Whether a photograph is available for this slide. */
  hasImage?: boolean;
}): { layout: CarouselLayout; reason: string } {
  const declared = input.visualLanguage
    ? (LAYOUTS_FOR_LANGUAGE[input.visualLanguage] ?? [])
    : [];
  let pool: CarouselLayout[] = declared.length > 0 ? declared : [...CAROUSEL_LAYOUTS];

  /*
   * §268. A picture beats a typographic arrangement of the same sentence, so
   * when one exists it is used — but only where it can carry the slide. Photo
   * layouts are never in a language's declared pool, so this is the only route
   * to them, and without an image they are removed entirely.
   */
  if (input.hasImage) {
    if (input.role === 'hook') {
      return {
        layout: 'photo_overlay',
        reason: 'A photograph exists and this is the opening slide, which is the one most people see.',
      };
    }
    pool = [...pool, ...PHOTO_LAYOUTS];
  } else {
    pool = pool.filter((l) => !PHOTO_LAYOUTS.includes(l));
    if (pool.length === 0) pool = ['editorial'];
  }

  /*
   * The content decides what is *possible* before the language decides what is
   * preferred. A statement layout given four sentences has to shrink them past
   * legibility, and an editorial column given no body renders an empty well —
   * both are worse than using a less on-brand shape.
   */
  if (input.bodyLineCount === 0) {
    const fits = pool.filter((l) => BODYLESS.includes(l));
    pool = fits.length > 0 ? fits : BODYLESS;
  } else if (input.bodyLineCount >= 3) {
    const fits = pool.filter((l) => ROOMY.includes(l));
    /* The fallback must respect the image constraint the pool was built for. */
    pool = fits.length > 0 ? fits : ROOMY.filter((l) => input.hasImage || !PHOTO_LAYOUTS.includes(l));
  }

  /*
   * §424. An inversion needs something short to invert.
   *
   * Checked with the other content fits and before any preference, because a
   * layout whose label wraps to two lines is not a stylistic choice — it is the
   * layout failing at the one thing it exists to do.
   */
  if ((input.headlineWords ?? 0) > 7) {
    const fits = pool.filter((l) => l !== 'lead_emphasis');
    if (fits.length > 0) pool = fits;
  }

  /* The opening slide is the only one most people see; give it presence. */
  if (input.role === 'hook' && input.bodyLineCount <= 1) {
    const loud = pool.filter((l) => l === 'statement' || l === 'lead_emphasis');
    if (loud.length > 0) pool = loud;
  }

  const recent = input.recentLayouts ?? [];
  const scored = pool
    .map((layout) => ({
      layout,
      staleness: recent.indexOf(layout) === -1 ? recent.length + 1 : recent.indexOf(layout),
    }))
    .sort((a, b) => b.staleness - a.staleness || a.layout.localeCompare(b.layout));

  const chosen = scored[0]!;
  return {
    layout: chosen.layout,
    reason:
      declared.length === 0
        ? `No layouts declared for '${input.visualLanguage ?? 'unset'}', so the choice is across all of them; ${chosen.layout} is least recently used.`
        : `${chosen.layout} suits ${input.visualLanguage} and ${input.bodyLineCount} supporting line(s), and is the least recently used that fits.`,
  };
}

// ── drawing ────────────────────────────────────────────────────────────────

export interface LayoutInput {
  /** §268. A photograph, already inlined as a data URI by the render handler. */
  imageDataUri?: string;
  brand: BrandTokens;
  type: RenderTypography;
  aspectRatio: string;
  kicker: string;
  headline: string;
  bodyLines: string[];
  index: number;
  total: number;
  /** §509. The nth of a run, when the slide is one. `numbered` prefers it. */
  ordinal?: number;
  wordmark?: string;
  extra?: SatoriElement;
}

const upper = (c: 'none' | 'upper') => (c === 'upper' ? ('uppercase' as const) : ('none' as const));

function shell(
  input: LayoutInput,
  opts: { justify: 'center' | 'flex-start' | 'flex-end' | 'space-between' },
  ...children: SatoriElement[]
): SatoriElement {
  const canvas = CANVAS[input.aspectRatio] ?? CANVAS['4:5']!;
  const padding = paddingFor(input.aspectRatio, canvas.height);
  return box(
    {
      width: canvas.width,
      height: canvas.height,
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: input.brand.background,
      color: input.brand.ink,
      paddingTop: padding.top,
      paddingBottom: padding.bottom,
      paddingLeft: 84,
      paddingRight: 84,
      fontFamily: input.type.body.family,
    },
    box(
      {
        flexDirection: 'column',
        flexGrow: 1,
        justifyContent: opts.justify,
        /*
         * §423. A bottom-anchored block would otherwise sit straight on top of
         * the wordmark, which reads as the type having run out of room rather
         * than as a composition resting on a base. Only where it can collide.
         */
        ...(opts.justify === 'flex-end' ? { marginBottom: 44 } : {}),
      },
      ...children,
    ),
    input.wordmark
      ? text(input.wordmark, {
          fontFamily: input.type.label.family,
          fontSize: 26,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: input.brand.muted,
        })
      : box({ height: 0 }),
  );
}

function meta(input: LayoutInput, marginBottom = 32): SatoriElement {
  return box(
    { justifyContent: 'space-between', marginBottom },
    text(input.kicker, {
      fontFamily: input.type.label.family,
      fontWeight: input.type.label.weight,
      fontSize: 26,
      letterSpacing: input.type.label.tracking * 26 + 2,
      textTransform: upper(input.type.label.case),
      color: input.brand.primary,
    }),
    text(`${input.index} / ${input.total}`, {
      fontFamily: input.type.label.family,
      fontSize: 26,
      color: input.brand.muted,
    }),
  );
}

function bodyBlock(input: LayoutInput, size: number, max: number): SatoriElement {
  return box(
    { flexDirection: 'column' },
    ...input.bodyLines.slice(0, max).map((line) =>
      text(line, {
        fontFamily: input.type.body.family,
        fontWeight: input.type.body.weight,
        fontSize: size,
        letterSpacing: input.type.body.tracking * size,
        lineHeight: 1.4,
        marginBottom: 18,
        color: input.brand.ink,
      }),
    ),
  );
}

function headlineAt(input: LayoutInput, size: number, marginBottom: number): SatoriElement {
  return text(input.headline, {
    fontFamily: input.type.display.family,
    fontWeight: input.type.display.weight,
    fontSize: size,
    letterSpacing: input.type.display.tracking * size,
    textTransform: upper(input.type.display.case),
    lineHeight: 1.06,
    marginBottom,
  });
}

/** The original composition: label, headline, supporting lines, centred. */
function editorial(input: LayoutInput): SatoriElement {
  /*
   * §423. Bottom-anchored, like a page.
   *
   * Rendered at the size Instagram actually shows a 4:5 card — 420px wide on a
   * phone — and every text layout was the same picture: a small block floating
   * in the middle with a third of the card empty above and below it. It reads
   * as a slide that is missing something.
   *
   * `photo_overlay` does not have the problem, and the reason is not the
   * photograph: its content is *anchored*. A composition with a base looks
   * decided; a centred block with air on both sides looks unresolved.
   *
   * So the anchor varies by layout, which fixes the composition and is a second
   * axis of variety at the same time — five layouts that were all "centred
   * block" are now four distinct shapes.
   */
  return shell(
    input,
    { justify: 'flex-end' },
    meta(input),
    headlineAt(input, 78, 36),
    bodyBlock(input, 36, 5),
    input.extra ?? box({ height: 0 }),
  );
}

/**
 * One claim, at the largest size the slide can carry, and nothing else.
 *
 * For the slide that has to work on its own — the opening one, which is the
 * only one most people will ever see.
 */
function statement(input: LayoutInput): SatoriElement {
  return shell(
    input,
    { justify: 'center' },
    meta(input, 44),
    headlineAt(input, 116, input.bodyLines.length > 0 ? 40 : 0),
    bodyBlock(input, 38, 1),
    input.extra ?? box({ height: 0 }),
  );
}

/**
 * The slide number as the composition rather than as a caption.
 *
 * Gives the empty upper area a job, which is what the review found missing:
 * space that reads as deliberate rather than as a rendering accident.
 */
function numbered(input: LayoutInput): SatoriElement {
  /* §423. Top-anchored: the numeral leads, so it sits where the eye enters. */
  return shell(
    input,
    { justify: 'flex-start' },
    /* §509. The item's own number when it has one; the slide's otherwise. */
    text(String(input.ordinal ?? input.index).padStart(2, '0'), {
      fontFamily: input.type.display.family,
      fontWeight: input.type.display.weight,
      fontSize: 240,
      lineHeight: 0.82,
      color: input.brand.primary,
      marginBottom: 8,
    }),
    text(input.kicker, {
      fontFamily: input.type.label.family,
      fontWeight: input.type.label.weight,
      fontSize: 26,
      letterSpacing: input.type.label.tracking * 26 + 2,
      textTransform: upper(input.type.label.case),
      color: input.brand.muted,
      marginBottom: 28,
    }),
    headlineAt(input, 72, 28),
    bodyBlock(input, 34, 3),
    input.extra ?? box({ height: 0 }),
  );
}

/** Headline above a rule, support below it. The argument, visibly hinged. */
function splitRule(input: LayoutInput): SatoriElement {
  /* §423. Bottom-anchored; the rule needs something to sit above. */
  return shell(
    input,
    { justify: 'flex-end' },
    meta(input, 28),
    headlineAt(input, 82, 32),
    box({
      height: 3,
      width: '100%',
      backgroundColor: input.brand.primary,
      marginBottom: 32,
    }),
    bodyBlock(input, 36, 4),
    input.extra ?? box({ height: 0 }),
  );
}

/**
 * The first supporting line promoted to near-headline size.
 *
 * For a slide whose point is in the sentence rather than in the title — a
 * finding, a consequence, a cost.
 */
function leadEmphasis(input: LayoutInput): SatoriElement {
  const [lead, ...rest] = input.bodyLines;
  return shell(
    input,
    { justify: 'center' },
    meta(input, 36),
    text(input.headline, {
      fontFamily: input.type.label.family,
      fontWeight: input.type.label.weight,
      fontSize: 34,
      letterSpacing: input.type.label.tracking * 34,
      textTransform: upper(input.type.label.case),
      color: input.brand.muted,
      marginBottom: 24,
    }),
    lead
      ? text(lead, {
          fontFamily: input.type.display.family,
          fontWeight: input.type.display.weight,
          fontSize: 86,
          letterSpacing: input.type.display.tracking * 86,
          lineHeight: 1.08,
          marginBottom: rest.length > 0 ? 32 : 0,
        })
      : headlineAt(input, 86, 0),
    box(
      { flexDirection: 'column' },
      ...rest.slice(0, 2).map((line) =>
        text(line, {
          fontFamily: input.type.body.family,
          fontWeight: input.type.body.weight,
          fontSize: 34,
          lineHeight: 1.4,
          marginBottom: 16,
          color: input.brand.muted,
        }),
      ),
    ),
    input.extra ?? box({ height: 0 }),
  );
}

/**
 * §268. The photograph carries the slide; the words sit under it.
 *
 * The picture takes the upper two thirds — the part of a 4:5 card that was
 * empty in every slide of the first production carousel.
 */
function photoLead(input: LayoutInput): SatoriElement {
  return shell(
    input,
    { justify: 'flex-start' },
    input.imageDataUri
      ? box(
          { flexDirection: 'column', borderRadius: 20, overflow: 'hidden', marginBottom: 36 },
          {
            type: 'img',
            props: {
              src: input.imageDataUri,
              style: { width: '100%', height: 620, objectFit: 'cover' },
            },
          } as SatoriElement,
        )
      : box({ height: 0 }),
    meta(input, 24),
    headlineAt(input, 64, 24),
    bodyBlock(input, 32, 2),
  );
}

/**
 * Full-bleed photograph with the hook over it.
 *
 * The opening frame of a real feed post, rather than a caption card. A scrim
 * sits between the picture and the type because legibility over an unknown
 * image cannot be assumed — the photograph is generated per piece and nobody
 * has checked its contrast.
 */
function photoOverlay(input: LayoutInput): SatoriElement {
  const canvas = CANVAS[input.aspectRatio] ?? CANVAS['4:5']!;
  return box(
    {
      width: canvas.width,
      height: canvas.height,
      flexDirection: 'column',
      justifyContent: 'flex-end',
      backgroundColor: input.brand.ink,
      position: 'relative',
    },
    input.imageDataUri
      ? ({
          type: 'img',
          props: {
            src: input.imageDataUri,
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: canvas.width,
              height: canvas.height,
              objectFit: 'cover',
            },
          },
        } as SatoriElement)
      : box({ height: 0 }),
    /* The scrim. Without it the type is at the mercy of whatever was drawn. */
    box({
      position: 'absolute',
      left: 0,
      bottom: 0,
      width: canvas.width,
      height: Math.round(canvas.height * 0.62),
      backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.82))`,
    }),
    box(
      { flexDirection: 'column', paddingLeft: 84, paddingRight: 84, paddingBottom: 96 },
      text(input.kicker, {
        fontFamily: input.type.label.family,
        fontWeight: input.type.label.weight,
        fontSize: 26,
        letterSpacing: input.type.label.tracking * 26 + 2,
        textTransform: upper(input.type.label.case),
        color: '#FFFFFF',
        opacity: 0.85,
        marginBottom: 20,
      }),
      text(input.headline, {
        fontFamily: input.type.display.family,
        fontWeight: input.type.display.weight,
        fontSize: 96,
        letterSpacing: input.type.display.tracking * 96,
        textTransform: upper(input.type.display.case),
        lineHeight: 1.04,
        color: '#FFFFFF',
      }),
    ),
  );
}

export const LAYOUT_RENDERERS: Record<CarouselLayout, (input: LayoutInput) => SatoriElement> = {
  editorial,
  statement,
  numbered,
  split_rule: splitRule,
  lead_emphasis: leadEmphasis,
  photo_lead: photoLead,
  photo_overlay: photoOverlay,
};
