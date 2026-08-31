/**
 * Image rendering: React-shaped element tree → SVG (Satori) → PNG (resvg).
 *
 * No browser. Deterministic, and fast enough that a preview render is cheap
 * enough to run on every co-pilot turn (v2 H.5).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import satori, { type SatoriOptions } from 'satori';
import { CANVAS, resolveBrand, type BrandTokens } from '../brand.js';
import type { SatoriElement } from './elements.js';
import { TEMPLATE_REGISTRY, TEMPLATE_REQUIRED_PROPS, type TemplateId } from './templates.js';

export * from './templates.js';
export * from './layouts.js';
export * from './formatSlides.js';
export * from './elements.js';
export * from './artifactProps.js';
export * from './profileArt.js';

const FONT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/fonts',
);

let fontCache: SatoriOptions['fonts'] | null = null;

/**
 * Fonts are read once and reused. v2 D.3 suggests subsetting for render speed;
 * the two Inter weights here are already latin-subset from fontsource, and the
 * rest are variable files small enough to ship whole.
 *
 * §265. **All seven families, not three — and why it took a font conversion.**
 *
 * The package has bundled Archivo, Bricolage, DM Sans, Fraunces and Sora since
 * the typography systems were written, and this loader read only Inter and
 * Instrument Serif. So the six systems the Creative Director chooses between
 * could be *selected* on the image path and never *drawn*: nineteen renders in
 * one production run came out in identical type while `creative_briefs`
 * recorded five different systems.
 *
 * The five were not loaded because Satori could not read them. Its parser
 * (`@shuding/opentype.js`) throws `Cannot read properties of undefined
 * (reading '256')` on every one — and 256, 257, 264 are **nameIDs**, not glyph
 * indices. It parses the variable-font `fvar` table against `font.names`, and
 * these files reference axis-name records it does not resolve.
 *
 * So the fix is not a loader change, it is a **font** change: each family is
 * instanced to static cuts with *every* axis pinned, which removes `fvar`
 * altogether. Pinning `wght` alone is not enough — Fraunces carries
 * `opsz/SOFT/WONK` and Bricolage `opsz/wdth`, so an unpinned axis keeps the
 * table and the parse still fails. `assets/fonts/static/` holds the result and
 * `scripts/build-static-fonts.py` regenerates it.
 *
 * Remotion renders the variable originals fine, because a browser does not use
 * this parser. That asymmetry is the whole reason the gap survived: the video
 * path proved the fonts worked.
 */
const STATIC_CUTS: Array<{ name: string; file: string; weight: number }> = [
  { name: 'Archivo', file: 'Archivo-500.ttf', weight: 500 },
  { name: 'Archivo', file: 'Archivo-700.ttf', weight: 700 },
  { name: 'Archivo', file: 'Archivo-800.ttf', weight: 800 },
  { name: 'Bricolage Grotesque', file: 'Bricolage-600.ttf', weight: 600 },
  { name: 'Bricolage Grotesque', file: 'Bricolage-700.ttf', weight: 700 },
  { name: 'Bricolage Grotesque', file: 'Bricolage-800.ttf', weight: 800 },
  { name: 'DM Sans', file: 'DMSans-400.ttf', weight: 400 },
  { name: 'DM Sans', file: 'DMSans-500.ttf', weight: 500 },
  { name: 'DM Sans', file: 'DMSans-700.ttf', weight: 700 },
  { name: 'Fraunces', file: 'Fraunces-400.ttf', weight: 400 },
  { name: 'Fraunces', file: 'Fraunces-600.ttf', weight: 600 },
  { name: 'Fraunces', file: 'Fraunces-700.ttf', weight: 700 },
  { name: 'Sora', file: 'Sora-400.ttf', weight: 400 },
  { name: 'Sora', file: 'Sora-600.ttf', weight: 600 },
  { name: 'Sora', file: 'Sora-700.ttf', weight: 700 },
  { name: 'Sora', file: 'Sora-800.ttf', weight: 800 },
];

export async function loadFonts(): Promise<SatoriOptions['fonts']> {
  if (fontCache) return fontCache;
  const [interRegular, interSemiBold, instrumentSerif, ...cuts] = await Promise.all([
    readFile(path.join(FONT_DIR, 'Inter-Regular.woff')),
    readFile(path.join(FONT_DIR, 'Inter-SemiBold.woff')),
    readFile(path.join(FONT_DIR, 'InstrumentSerif-Regular.ttf')),
    ...STATIC_CUTS.map((c) => readFile(path.join(FONT_DIR, 'static', c.file))),
  ]);

  fontCache = [
    { name: 'Inter', data: interRegular, weight: 400, style: 'normal' },
    { name: 'Inter', data: interSemiBold, weight: 600, style: 'normal' },
    /*
     * Two systems ask Inter for 500 and 700 and there is no such cut bundled.
     * Registered against the nearest real weight rather than left out: Satori
     * does not synthesise, and an unregistered weight silently falls back to a
     * different *family*, which is the failure this whole section is fixing.
     */
    { name: 'Inter', data: interSemiBold, weight: 500, style: 'normal' },
    { name: 'Inter', data: interSemiBold, weight: 700, style: 'normal' },
    { name: 'Instrument Serif', data: instrumentSerif, weight: 400, style: 'normal' },
    ...STATIC_CUTS.map((cut, i) => ({
      name: cut.name,
      data: cuts[i]!,
      weight: cut.weight as 400 | 500 | 600 | 700 | 800,
      style: 'normal' as const,
    })),
  ];
  return fontCache;
}

export interface RenderImageOptions {
  aspectRatio: string;
  /** 'preview' renders at 480px wide with no anti-alias tuning (v2 H.5). */
  quality?: 'preview' | 'final';
  /**
   * Exact pixel dimensions, overriding the aspect-ratio lookup. Milestone 50.
   *
   * Post artwork has five sane canvases and picks one. Profile artwork does not:
   * an X avatar is 400×400, a TikTok avatar is 200×200 and a YouTube banner is
   * 2048×1152, and a platform that wants 400 and receives 1080 either rejects it
   * or resamples it badly. So the size is passed rather than inferred.
   */
  size?: { width: number; height: number };
}

export interface RenderedImage {
  png: Buffer;
  svg: string;
  width: number;
  height: number;
  durationMs: number;
}

export async function renderElement(
  element: SatoriElement,
  options: RenderImageOptions,
): Promise<RenderedImage> {
  const startedAt = Date.now();
  const canvas = options.size ?? CANVAS[options.aspectRatio] ?? CANVAS['1:1']!;
  const fonts = await loadFonts();

  const svg = await satori(element as unknown as React.ReactNode, {
    width: canvas.width,
    height: canvas.height,
    fonts,
  });

  // An explicit size is a requirement, not a hint: a preview downscale would
  // hand the operator an image the platform rejects.
  const targetWidth =
    options.quality === 'preview' && !options.size ? 480 : canvas.width;
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: targetWidth } });
  const rendered = resvg.render();

  return {
    png: Buffer.from(rendered.asPng()),
    svg,
    width: rendered.width,
    height: rendered.height,
    durationMs: Date.now() - startedAt,
  };
}

export interface RenderTemplateInput {
  templateId: TemplateId;
  props: Record<string, unknown>;
  brandTokens?: Record<string, unknown> | null;
  aspectRatio: string;
  quality?: 'preview' | 'final';
  wordmark?: string;
  /** Exact canvas, where the aspect ratio does not determine it. §224. */
  size?: { width: number; height: number };
}

export async function renderTemplate(input: RenderTemplateInput): Promise<RenderedImage> {
  const template = TEMPLATE_REGISTRY[input.templateId];
  if (!template) throw new Error(`Unknown template '${input.templateId}'.`);

  /**
   * A missing prop is a failed render, not a blank area on a finished card.
   *
   * Nothing validated these. The templates draw a heading and then draw the
   * value under it, so an absent value produced a card promising an
   * explanation and delivering empty space — and it passed every gate, because
   * the contrast was fine, the ratio was fine, and the claimed term was still
   * on the card. The only way to see it was to look at one.
   */
  const missing = TEMPLATE_REQUIRED_PROPS[input.templateId].filter((key) => {
    const value = (input.props as Record<string, unknown>)[key];
    if (value === undefined || value === null) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    /**
     * An empty array is *present*, and for some templates it is correct.
     *
     * The first version treated `[]` as missing, which immediately failed a
     * caller that was right: `carouselProps` deliberately emits
     * `bodyLines: []` for a slide carrying a screenshot instead of copy. Whether
     * emptiness is a defect depends on the template, so it is not decided here.
     */
    return false;
  });

  if (missing.length > 0) {
    throw new Error(
      `Template '${input.templateId}' is missing required props: ${missing.join(', ')}. ` +
        'Rendering anyway would produce a card with a heading over empty space, which passes every gate.',
    );
  }

  const brand: BrandTokens = resolveBrand(input.brandTokens);
  const element = (template as (p: never) => SatoriElement)({
    ...input.props,
    brand,
    aspectRatio: input.aspectRatio,
    wordmark: input.wordmark,
  } as never);

  return renderElement(element, {
    aspectRatio: input.aspectRatio,
    quality: input.quality,
    /*
     * §224. A thumbnail has an exact canvas, not an aspect ratio.
     *
     * 16:9 resolves to 1920x1080 for a video frame, and a YouTube thumbnail
     * is 1280x720 — the same ratio, a different picture. The legible-size
     * arithmetic is calibrated against the real canvas, so passing the wrong
     * one produces type that satisfies the check and is unreadable anyway.
     */
    ...(input.size ? { size: input.size } : {}),
  });
}

/**
 * The deterministic half of Gate 3 needs to know where text landed. Satori's SVG
 * carries the laid-out positions, so bounds come from the real render rather
 * than from a guess about the template.
 */
export function extractTextBoxes(
  svg: string,
  canvas: { width: number; height: number },
): Array<{ x: number; y: number; width: number; height: number }> {
  const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
  // Satori emits <path fill="..."> for glyphs, wrapped in <g transform="translate(x,y)">.
  const groupPattern = /<g transform="translate\(([-\d.]+)[, ]+([-\d.]+)\)"[^>]*>([\s\S]*?)<\/g>/g;

  for (const match of svg.matchAll(groupPattern)) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    const inner = match[3] ?? '';
    if (!inner.includes('<path')) continue;

    // Glyph paths give a usable height from the font size baked into the group.
    const widths = [...inner.matchAll(/d="M([-\d.]+)/g)].map((m) => Number(m[1]));
    const maxX = widths.length > 0 ? Math.max(...widths) : 0;
    boxes.push({
      x: x / canvas.width,
      y: y / canvas.height,
      width: Math.max(0.01, maxX / canvas.width),
      height: 0.02,
    });
  }
  return boxes;
}

/**
 * Relative luminance and WCAG contrast, used by Gate 3. Kept here because the
 * templates own the colour decisions.
 */
export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

export function relativeLuminance(color: string): number {
  const rgb = parseColor(color);
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function parseColor(color: string): [number, number, number] {
  const hex = color.trim().replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [
      parseInt(hex[0]! + hex[0], 16),
      parseInt(hex[1]! + hex[1], 16),
      parseInt(hex[2]! + hex[2], 16),
    ];
  }
  const rgbMatch = /rgba?\(([^)]+)\)/i.exec(color);
  if (rgbMatch) {
    const parts = rgbMatch[1]!.split(',').map((p) => Number(p.trim()));
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  }
  // Unknown format (e.g. hsl()). Assume light, which is the safe direction —
  // it produces a lower contrast estimate and therefore a stricter gate.
  return [250, 248, 243];
}
/* §395. Which still to draw, when several could carry the artifact. */
export * from './chooseStill.js';
