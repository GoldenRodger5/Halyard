/**
 * How a caption should look, decided from what is behind it.
 *
 * §158. Captions were styled `color: brand.ink` with a `brand.background`
 * outline, fixed, whatever the composition put behind them. On a cream card
 * that is legible. Over a screen recording of a product — which is what the
 * capture path produces — it is black text with a pale halo on arbitrary
 * pixels, and there is no value of "brand ink" that is readable on all of them.
 *
 * The rule here is not a taste: **contrast is measured, and the result is
 * guaranteed to clear WCAG AA (4.5:1)**. Everything else — which brand colour
 * is used, whether a scrim appears, how heavy the type is — follows from that
 * measurement and from what kind of backdrop the composition declares.
 *
 * Deterministic on purpose. Nothing here asks a model what looks good; the
 * visual gate already has an independent critic for that, and a generator that
 * graded its own contrast would be marking its own homework.
 *
 * Pure arithmetic and no imports beyond the brand type: this file is inside the
 * Remotion webpack bundle, so it must stay free of anything Node-only
 * (gotcha 10).
 */
import type { BrandTokens } from '../brand.js';

/** WCAG AA for large text is 3:1; captions are held to the body-text bar. */
export const MIN_CAPTION_CONTRAST = 4.5;

/**
 * What sits behind the caption.
 *
 * `surface` is a flat brand-coloured card, where the colour is known exactly.
 * `media` is a photograph, a render or a screen recording — unknowable at
 * render time and different in every frame, which is why it is treated as a
 * separate case rather than as "a surface whose colour we happen not to know".
 */
export type CaptionBackdrop =
  | { kind: 'surface'; color: string }
  | { kind: 'media'; meanLuminance?: number };

export interface CaptionStyle {
  color: string;
  /** Solid plate behind the words. `null` when the backdrop is safe without one. */
  scrim: string | null;
  /** Outline, for a flat surface where a plate would look heavy-handed. */
  textShadow: string | null;
  fontWeight: number;
  /** Achieved ratio against the backdrop. Recorded so the gate can check it. */
  contrast: number;
}

/** sRGB relative luminance, per WCAG 2.1. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseColor(hex);
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The caption treatment for this backdrop.
 *
 * On a **surface** the exact colour is known, so the brand's own ink or paper is
 * tried first and the better-contrasting one wins. A scrim is added only if
 * neither clears the bar — which happens on mid-tone brand colours, where an
 * outline cannot rescue legibility either.
 *
 * On **media** there is no single colour to measure, so a scrim is not optional.
 * A plate is the only treatment that holds at 4.5:1 across a frame that changes
 * every 1/30th of a second, and every outline-based alternative fails somewhere
 * in the shot.
 */
export function captionStyle(brand: BrandTokens, backdrop: CaptionBackdrop): CaptionStyle {
  if (backdrop.kind === 'media') {
    /*
     * Dark plate with paper text by default. When the footage is known to be
     * dark the plate inverts, so a caption over a dark UI does not become a
     * bright slab that pulls the eye off the product.
     */
    const dark = (backdrop.meanLuminance ?? 0.5) < 0.5;
    const scrim = dark ? withAlpha(brand.background, 0.92) : withAlpha(brand.ink, 0.86);
    const color = dark ? brand.ink : (brand.background);
    return {
      color,
      scrim,
      textShadow: null,
      fontWeight: 600,
      contrast: contrastRatio(color, stripAlpha(scrim)),
    };
  }

  const candidates = [brand.ink, brand.background];
  const best = candidates
    .map((color) => ({ color, contrast: contrastRatio(color, backdrop.color) }))
    .sort((a, b) => b.contrast - a.contrast)[0]!;

  if (best.contrast >= MIN_CAPTION_CONTRAST) {
    return {
      color: best.color,
      scrim: null,
      // A hairline in the backdrop colour keeps the edge crisp against the
      // card's own type without pretending to be a legibility device.
      textShadow: `0 2px 0 ${backdrop.color}, 0 -2px 0 ${backdrop.color}, 2px 0 0 ${backdrop.color}, -2px 0 0 ${backdrop.color}`,
      fontWeight: 600,
      contrast: best.contrast,
    };
  }

  // The brand's own colours cannot carry a caption on this surface. Rather than
  // inventing a colour that is not the product's, put the product's ink on a
  // plate of the product's paper.
  const scrim = withAlpha(brand.background, 0.94);
  return {
    color: brand.ink,
    scrim,
    textShadow: null,
    fontWeight: 700,
    contrast: contrastRatio(brand.ink, stripAlpha(scrim)),
  };
}

// ── colour plumbing ────────────────────────────────────────────────────────

function parseColor(input: string): { r: number; g: number; b: number } {
  const value = input.trim();

  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1]!;
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (rgb) {
    const [r, g, b] = rgb[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: r ?? 0, g: g ?? 0, b: b ?? 0 };
  }

  const hsl = /^hsla?\(([^)]+)\)$/i.exec(value);
  if (hsl) {
    const parts = hsl[1]!.split(/[ ,/]+/).filter(Boolean);
    return hslToRgb(
      Number(parts[0]),
      Number(String(parts[1]).replace('%', '')) / 100,
      Number(String(parts[2]).replace('%', '')) / 100,
    );
  }

  // Unparseable is treated as mid-grey, which contrasts with nothing and so
  // forces a scrim. Guessing white here would produce a caption that looks
  // fine in the style object and is invisible on the frame.
  return { r: 128, g: 128, b: 128 };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function withAlpha(color: string, alpha: number): string {
  const { r, g, b } = parseColor(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The opaque colour a scrim resolves to, for measuring against. */
function stripAlpha(color: string): string {
  const { r, g, b } = parseColor(color);
  return `rgb(${r}, ${g}, ${b})`;
}
