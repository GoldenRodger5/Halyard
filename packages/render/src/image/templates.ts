/**
 * Satori image templates. v1 §5.1.
 *
 * Every template is a pure function from typed props to an element tree. That
 * makes them snapshot-testable without a renderer, and it makes `input_props`
 * on the renders table a complete record of how an image was produced — a render
 * is reproducible from the row alone.
 *
 * All templates read brand tokens rather than hard-coding colour, and all
 * respect the 12% safe area on vertical formats (v2 F.3).
 */
import { CANVAS, paddingFor, type BrandTokens } from '../brand.js';
import { arrowRight, box, h, text, type SatoriElement } from './elements.js';

export interface TemplateBase {
  brand: BrandTokens;
  aspectRatio: string;
  /** Small footer mark. Never a logo lockup; this is a feed, not a billboard. */
  wordmark?: string;
}

export interface TransformationDiffProps extends TemplateBase {
  headline: string;
  before: string;
  after: string;
  reason: string;
  alternative?: string | null;
}

export interface SubstitutionRatioProps extends TemplateBase {
  ingredient: string;
  ratio: string;
  substitute: string;
  failureMode: string;
}

export interface ChefNoteProps extends TemplateBase {
  quote: string;
  attribution?: string;
}

export interface ScalingMathProps extends TemplateBase {
  fromServings: number;
  toServings: number;
  rows: Array<{ label: string; linear: string; actual: string }>;
  note: string;
}

export interface PinterestTallProps extends TemplateBase {
  title: string;
  subtitle: string;
  bullets: string[];
}

export interface CarouselSlideProps extends TemplateBase {
  index: number;
  total: number;
  kicker: string;
  headline: string;
  bodyLines: string[];
  /**
   * A real screenshot of the product, as a data URI. Milestone 41.
   *
   * Satori cannot fetch a URL, so the bytes are inlined by the render handler
   * from the asset the composition picked. A slide showing the actual result
   * card is worth more than any amount of typography describing it.
   */
  screenshotDataUri?: string;
  screenshotCaption?: string;
}

function frame(props: TemplateBase, ...children: SatoriElement[]): SatoriElement {
  const canvas = CANVAS[props.aspectRatio] ?? CANVAS['1:1']!;
  const padding = paddingFor(props.aspectRatio, canvas.height);

  return box(
    {
      width: canvas.width,
      height: canvas.height,
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: props.brand.background,
      color: props.brand.ink,
      paddingTop: padding.top,
      paddingBottom: padding.bottom,
      paddingLeft: 84,
      paddingRight: 84,
      fontFamily: props.brand.bodyFont,
    },
    box({ flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }, ...children),
    props.wordmark
      ? text(props.wordmark, {
          fontSize: 26,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: props.brand.muted,
        })
      : box({ height: 0 }),
  );
}

function kicker(label: string, brand: BrandTokens): SatoriElement {
  return text(label, {
    fontSize: 28,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: brand.primary,
    marginBottom: 28,
  });
}

/** Struck-through original above the swap, reason below (v1 §5.1). */
export function transformationDiff(props: TransformationDiffProps): SatoriElement {
  return frame(
    props,
    kicker('One change', props.brand),
    text(props.headline, {
      fontFamily: props.brand.headingFont,
      fontSize: 76,
      lineHeight: 1.05,
      marginBottom: 48,
    }),
    box(
      { flexDirection: 'column', marginBottom: 40 },
      text(props.before, {
        fontSize: 42,
        color: props.brand.muted,
        textDecoration: 'line-through',
        marginBottom: 14,
      }),
      box(
        { alignItems: 'center' },
        box({ marginRight: 18 }, arrowRight(props.brand.primary, 44)),
        text(props.after, { fontSize: 46, color: props.brand.ink, fontWeight: 600 }),
      ),
    ),
    box(
      {
        borderLeftWidth: 6,
        borderLeftColor: props.brand.primary,
        borderLeftStyle: 'solid',
        paddingLeft: 28,
      },
      text(props.reason, { fontSize: 36, lineHeight: 1.4, color: props.brand.ink }),
    ),
    props.alternative
      ? text(`No ${props.after.split(' ').slice(-1)[0]}? ${props.alternative}`, {
          fontSize: 30,
          color: props.brand.muted,
          marginTop: 28,
        })
      : box({ height: 0 }),
  );
}

/** Ratio card plus the failure mode. The failure mode is the payoff. */
export function substitutionRatio(props: SubstitutionRatioProps): SatoriElement {
  return frame(
    props,
    kicker('Not 1 to 1', props.brand),
    // Stacked rather than side by side: ingredient names run long, and a row
    // layout wraps into an unreadable tangle the moment one of them does.
    box(
      { flexDirection: 'column', marginBottom: 36 },
      text(props.ingredient, {
        fontFamily: props.brand.headingFont,
        fontSize: 60,
        color: props.brand.muted,
        marginBottom: 8,
      }),
      box(
        { alignItems: 'center' },
        box({ marginRight: 18 }, arrowRight(props.brand.primary, 46)),
        text(props.substitute, {
          fontFamily: props.brand.headingFont,
          fontSize: 60,
          flexGrow: 1,
        }),
      ),
    ),
    box(
      {
        backgroundColor: props.brand.primary,
        color: props.brand.background,
        paddingTop: 24,
        paddingBottom: 24,
        paddingLeft: 36,
        paddingRight: 36,
        borderRadius: 12,
        marginBottom: 44,
        alignSelf: 'flex-start',
      },
      text(props.ratio, { fontSize: 58, fontWeight: 600, color: props.brand.background }),
    ),
    text('What goes wrong if you ignore it', {
      fontSize: 26,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: props.brand.muted,
      marginBottom: 14,
    }),
    text(props.failureMode, { fontSize: 38, lineHeight: 1.4 }),
  );
}

/** Pull quote on brand background. */
export function chefNoteQuote(props: ChefNoteProps): SatoriElement {
  return frame(
    props,
    text('"', {
      fontFamily: props.brand.headingFont,
      fontSize: 160,
      color: props.brand.primary,
      lineHeight: 0.6,
      marginBottom: 16,
    }),
    text(props.quote, {
      fontFamily: props.brand.headingFont,
      fontSize: 62,
      lineHeight: 1.25,
    }),
    props.attribution
      ? text(props.attribution, { fontSize: 30, color: props.brand.muted, marginTop: 40 })
      : box({ height: 0 }),
  );
}

/** "Doubling isn't multiplication", visualised as a table. */
export function scalingMath(props: ScalingMathProps): SatoriElement {
  return frame(
    props,
    kicker(`${props.fromServings} servings down to ${props.toServings}`, props.brand),
    text('Doubling is not multiplication', {
      fontFamily: props.brand.headingFont,
      fontSize: 68,
      lineHeight: 1.05,
      marginBottom: 44,
    }),
    box(
      { flexDirection: 'column' },
      ...props.rows.map((row, i) =>
        box(
          {
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 18,
            paddingBottom: 18,
            borderTopWidth: i === 0 ? 0 : 2,
            borderTopColor: '#00000014',
            borderTopStyle: 'solid',
          },
          text(row.label, { fontSize: 34, flexGrow: 1 }),
          text(row.linear, {
            fontSize: 32,
            color: props.brand.muted,
            textDecoration: 'line-through',
            marginRight: 24,
          }),
          text(row.actual, { fontSize: 36, color: props.brand.primary, fontWeight: 600 }),
        ),
      ),
    ),
    text(props.note, { fontSize: 30, color: props.brand.muted, marginTop: 36, lineHeight: 1.4 }),
  );
}

/** Keyword-forward, long half-life. 2:3 (v1 §5.1). */
export function pinterestTall(props: PinterestTallProps): SatoriElement {
  return frame(
    { ...props, aspectRatio: '2:3' },
    text(props.title, {
      fontFamily: props.brand.headingFont,
      fontSize: 72,
      lineHeight: 1.08,
      marginBottom: 24,
    }),
    text(props.subtitle, { fontSize: 34, color: props.brand.muted, marginBottom: 44, lineHeight: 1.35 }),
    box(
      { flexDirection: 'column' },
      ...props.bullets.slice(0, 4).map((bullet) =>
        box(
          { alignItems: 'flex-start', marginBottom: 20 },
          box({
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: props.brand.primary,
            marginTop: 16,
            marginRight: 18,
          }),
          text(bullet, { fontSize: 34, lineHeight: 1.35, flexGrow: 1 }),
        ),
      ),
    ),
  );
}

/**
 * Carousel slide. Every slide is built at the same aspect ratio, because
 * Instagram crops slides 2..n to match slide 1 (v2 A.3).
 */
export function carouselSlide(props: CarouselSlideProps): SatoriElement {
  return frame(
    props,
    box(
      { justifyContent: 'space-between', marginBottom: 32 },
      text(props.kicker, {
        fontSize: 26,
        letterSpacing: 3,
        textTransform: 'uppercase',
        color: props.brand.primary,
      }),
      text(`${props.index} / ${props.total}`, { fontSize: 26, color: props.brand.muted }),
    ),
    text(props.headline, {
      fontFamily: props.brand.headingFont,
      fontSize: 66,
      lineHeight: 1.08,
      marginBottom: 36,
    }),
    box(
      { flexDirection: 'column' },
      ...props.bodyLines.slice(0, props.screenshotDataUri ? 2 : 5).map((line) =>
        text(line, { fontSize: 36, lineHeight: 1.4, marginBottom: 18, color: props.brand.ink }),
      ),
    ),
    props.screenshotDataUri
      ? box(
          {
            flexDirection: 'column',
            marginTop: 24,
            borderRadius: 24,
            overflow: 'hidden',
            // A screenshot on a bare background reads as a bug report. The
            // border and inset give it the edge a device would.
            border: `2px solid ${props.brand.muted}`,
          },
          screenshot(props.screenshotDataUri),
        )
      : box({ height: 0 }),
    props.screenshotCaption
      ? text(props.screenshotCaption, {
          fontSize: 26,
          marginTop: 16,
          color: props.brand.muted,
        })
      : box({ height: 0 }),
  );
}

/**
 * An inlined screenshot, cropped to its top edge.
 *
 * `objectFit: 'cover'` with a fixed height keeps every slide the same shape,
 * which matters because Instagram crops slides 2..n to match slide 1.
 */
function screenshot(dataUri: string): SatoriElement {
  return {
    type: 'img',
    props: {
      src: dataUri,
      style: { width: '100%', height: 560, objectFit: 'cover', objectPosition: 'top' },
    },
  };
}

export const TEMPLATE_REGISTRY = {
  transformation_diff_1x1: (p: TransformationDiffProps) => transformationDiff({ ...p, aspectRatio: '1:1' }),
  transformation_diff_4x5: (p: TransformationDiffProps) => transformationDiff({ ...p, aspectRatio: '4:5' }),
  substitution_ratio: substitutionRatio,
  chef_note_quote: chefNoteQuote,
  scaling_math: scalingMath,
  pinterest_tall: pinterestTall,
  carousel_6: carouselSlide,
} as const;

export type TemplateId = keyof typeof TEMPLATE_REGISTRY;

/**
 * The props each template cannot render without.
 *
 * These templates draw section headings unconditionally and then draw the value
 * beneath them. A missing value therefore does not fail — it renders as empty
 * space under a heading that promises something, which is a worse artefact than
 * a hard error and one that passes every gate: the contrast is fine, the aspect
 * ratio is fine, and the claimed term is still on the card.
 *
 * Found by rendering the templates and looking at them. `substitution_ratio`
 * produced a card reading "WHAT GOES WRONG IF YOU IGNORE IT" above nothing at
 * all, because the caller passed `note` where the template wanted `failureMode`
 * and `text(undefined)` renders as empty rather than throwing.
 */
export const TEMPLATE_REQUIRED_PROPS: Record<TemplateId, readonly string[]> = {
  transformation_diff_1x1: ['headline', 'before', 'after', 'reason'],
  transformation_diff_4x5: ['headline', 'before', 'after', 'reason'],
  substitution_ratio: ['ingredient', 'substitute', 'ratio', 'failureMode'],
  chef_note_quote: ['quote'],
  scaling_math: ['fromServings', 'toServings', 'rows', 'note'],
  pinterest_tall: ['title', 'subtitle', 'bullets'],
  carousel_6: ['index', 'total', 'kicker', 'headline', 'bodyLines'],
};

export { h, box, text };
