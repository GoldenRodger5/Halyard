/**
 * Brand tokens and layout constants shared by every template.
 *
 * Values come from products.brand_tokens at render time; these are the fallbacks
 * and the shape. Terracotta #C4714A on warm cream, Instrument Serif headings,
 * Inter body (build pack §2 step 1, v1 §5.1).
 */

export interface BrandTokens {
  primary: string;
  background: string;
  ink: string;
  muted: string;
  accent: string;
  headingFont: string;
  bodyFont: string;
}

export const DEFAULT_BRAND: BrandTokens = {
  primary: '#C4714A',
  background: '#FAF8F3',
  ink: '#2A2320',
  muted: '#7A6E66',
  accent: '#5C7A5E',
  headingFont: 'Instrument Serif',
  bodyFont: 'Inter',
};

export function resolveBrand(tokens: Record<string, unknown> | null | undefined): BrandTokens {
  if (!tokens) return DEFAULT_BRAND;
  const pick = (key: string, fallback: string): string => {
    const value = tokens[key];
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  };
  return {
    primary: pick('primary', DEFAULT_BRAND.primary),
    background: pick('background', DEFAULT_BRAND.background),
    ink: pick('ink', DEFAULT_BRAND.ink),
    muted: pick('muted', DEFAULT_BRAND.muted),
    accent: pick('accent', DEFAULT_BRAND.accent),
    headingFont: pick('heading_font', DEFAULT_BRAND.headingFont),
    bodyFont: pick('body_font', DEFAULT_BRAND.bodyFont),
  };
}

export const CANVAS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '2:3': { width: 1000, height: 1500 },
};

/**
 * v2 F.3 — no text within 12% of top or bottom on 9:16, because platform UI
 * overlays it. Applied as padding rather than left to the template author.
 */
export const SAFE_AREA_FRACTION = 0.12;

export function paddingFor(aspectRatio: string, height: number): { top: number; bottom: number } {
  if (aspectRatio === '9:16') {
    const safe = Math.ceil(height * SAFE_AREA_FRACTION) + 24;
    return { top: safe, bottom: safe };
  }
  return { top: 72, bottom: 72 };
}
