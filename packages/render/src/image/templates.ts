import { DURATION_BADGE, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from '@halyard/core';
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
  /**
   * §265. The type this card is set in, as plain data.
   *
   * The Creative Director already chooses a typography system per piece and
   * records it on the brief. Until now only the Remotion path read it, so the
   * image templates — nineteen of twenty-one renders in a production run — drew
   * every card in the same two fonts while `creative_briefs` recorded five
   * different systems. The variety existed and the output could not show it.
   *
   * Passed as a **resolved spec, not an id**, because this package must not
   * import `@halyard/core` for values it can be handed instead (gotcha 10: the
   * barrel reaches `node:crypto`, and anything Remotion webpacks that can see
   * it dies at render time with `UnhandledSchemeError`). `renderTypography()`
   * in core exists to hand a system across this boundary as plain data; this
   * is its consumer.
   *
   * Absent means the brand fonts, which is what every card did before.
   */
  typography?: RenderTypography;
}

/** One role's type spec. Mirrors `TypeRole` in `@halyard/core`, as plain data. */
export interface TypeRoleSpec {
  family: string;
  weight: number;
  tracking: number;
  scale: number;
  case: 'none' | 'upper';
}

/** The shape `renderTypography()` produces. */
export interface RenderTypography {
  id: string;
  display: TypeRoleSpec;
  heading: TypeRoleSpec;
  body: TypeRoleSpec;
  label: TypeRoleSpec;
}

/**
 * §265. The type spec a card draws with.
 *
 * Falls back to the brand fonts when none is supplied, so a caller that has not
 * been taught to pass one keeps exactly the behaviour it had.
 */
export function typeFor(props: TemplateBase): RenderTypography {
  if (props.typography) return props.typography;
  return {
    id: 'brand_default',
    display: { family: props.brand.headingFont, weight: 400, tracking: -0.005, scale: 1, case: 'none' },
    heading: { family: props.brand.headingFont, weight: 400, tracking: -0.005, scale: 0.72, case: 'none' },
    body: { family: props.brand.bodyFont, weight: 400, tracking: 0, scale: 0.34, case: 'none' },
    label: { family: props.brand.bodyFont, weight: 600, tracking: 0.12, scale: 0.2, case: 'upper' },
  };
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
  const type = typeFor(props);
  /*
   * §266. Sized for the slide, and for the size it is actually read at.
   *
   * A carousel slide is 1080×1350 and is looked at around a third of that in
   * feed. The old headline was 66px — inside the 60–90px range but at the
   * bottom of it — and the result read as a small block of type marooned in a
   * tall canvas, which was the "empty top third" in the review. 78px is the
   * middle of the range and fills the measure without crowding.
   */
  const headlineSize = 78;
  return frame(
    props,
    box(
      { justifyContent: 'space-between', marginBottom: 32 },
      text(props.kicker, {
        fontFamily: type.label.family,
        fontWeight: type.label.weight,
        fontSize: 26,
        letterSpacing: type.label.tracking * 26 + 2,
        textTransform: type.label.case === 'upper' ? 'uppercase' : 'none',
        color: props.brand.primary,
      }),
      text(`${props.index} / ${props.total}`, {
        fontFamily: type.label.family,
        fontSize: 26,
        color: props.brand.muted,
      }),
    ),
    text(props.headline, {
      fontFamily: type.display.family,
      fontWeight: type.display.weight,
      fontSize: headlineSize,
      letterSpacing: type.display.tracking * headlineSize,
      textTransform: type.display.case === 'upper' ? 'uppercase' : 'none',
      lineHeight: 1.08,
      marginBottom: 36,
    }),
    box(
      { flexDirection: 'column' },
      ...props.bodyLines.slice(0, props.screenshotDataUri ? 2 : 5).map((line) =>
        text(line, {
          fontFamily: type.body.family,
          fontWeight: type.body.weight,
          fontSize: 36,
          letterSpacing: type.body.tracking * 36,
          lineHeight: 1.4,
          marginBottom: 18,
          color: props.brand.ink,
        }),
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


/**
 * A YouTube thumbnail. §224.
 *
 * Built against `MIN_CANVAS_TEXT_PX` rather than against the canvas, because
 * this is the one template in the package that is never seen at its own size.
 * A thumbnail is served at 1280x720 and drawn at roughly 360px wide, so type
 * that looks generous here is 28% of that where it is actually read.
 *
 * Deliberately not `frame()`. That helper centres content in a padded column,
 * which is right for a feed card and wrong here: a thumbnail has to keep its
 * bottom-right corner clear of the duration badge YouTube stamps over every
 * impression, and it wants its words hard against one edge rather than
 * floating in the middle.
 */
export interface ThumbnailProps extends TemplateBase {
  /** Short. `checkThumbnail` refuses more than six words, and means it. */
  overlayText: string;
  /** Canvas font size, already corrected for the feed by `thumbnailFontSize`. */
  fontSizePx: number;
  /** A real screenshot, inlined by the render handler. Never generated. */
  screenshotDataUri?: string;
}

export function youtubeThumbnail(props: ThumbnailProps): SatoriElement {
  /*
   * The real canvas, not `CANVAS['16:9']`. That entry is 1920x1080 — the same
   * ratio as a thumbnail and not the same picture, and the legible-size
   * arithmetic in `@halyard/core` is calibrated against 1280x720.
   */
  const canvas = { width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT };
  /*
   * The badge sits bottom-right on every impression. Reserving the space is
   * cheaper than discovering later that the last word of every thumbnail is
   * under an opaque black pill.
   */
  const badgeGuard = Math.ceil(canvas.height * DURATION_BADGE.heightFraction);

  return box(
    {
      width: canvas.width,
      height: canvas.height,
      flexDirection: 'column',
      justifyContent: 'flex-end',
      backgroundColor: props.brand.background,
      color: props.brand.ink,
      fontFamily: props.brand.bodyFont,
      position: 'relative',
    },
    props.screenshotDataUri
      ? {
          type: 'img',
          props: {
            src: props.screenshotDataUri,
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: canvas.width,
              height: canvas.height,
              objectFit: 'cover',
            },
          },
        }
      : box({ height: 0 }),
    /* A scrim, not a panel. Over a screenshot the words need contrast; behind
       them the product must still be visible or the picture is decoration. */
    props.screenshotDataUri
      ? box({
          position: 'absolute',
          top: 0,
          left: 0,
          width: canvas.width,
          height: canvas.height,
          backgroundColor: 'rgba(8,8,8,0.52)',
        })
      : box({ height: 0 }),
    box(
      {
        flexDirection: 'column',
        paddingLeft: 88,
        paddingRight: 88 + Math.ceil(canvas.width * DURATION_BADGE.widthFraction),
        paddingBottom: badgeGuard,
      },
      text(props.overlayText, {
        /*
         * The body face, not the heading face. `Instrument Serif` loads at
         * weight 400 only, so asking it for 700 falls back silently — which
         * is exactly what the first render did, and at feed size it read as a
         * thin line rather than a thumbnail. A thumbnail needs the weight
         * that actually exists.
         */
        fontFamily: props.brand.bodyFont,
        fontSize: props.fontSizePx,
        fontWeight: 600,
        lineHeight: 1.02,
        letterSpacing: -2,
        color: props.screenshotDataUri ? '#FFFFFF' : props.brand.ink,
      }),
    ),
  );
}

export const TEMPLATE_REGISTRY = {
  transformation_diff_1x1: (p: TransformationDiffProps) => transformationDiff({ ...p, aspectRatio: '1:1' }),
  transformation_diff_4x5: (p: TransformationDiffProps) => transformationDiff({ ...p, aspectRatio: '4:5' }),
  substitution_ratio: substitutionRatio,
  chef_note_quote: chefNoteQuote,
  scaling_math: scalingMath,
  pinterest_tall: pinterestTall,
  carousel_6: carouselSlide,
  youtube_thumbnail: youtubeThumbnail,
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
  youtube_thumbnail: ['overlayText', 'fontSizePx'],
};

export { h, box, text };
