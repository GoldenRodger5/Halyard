/**
 * §323. A product's palette, read from the product's own stylesheet.
 *
 * Kinolog was attached as the second product and `brand_tokens` was `{}`, so
 * `resolveBrand` fell back to `DEFAULT_BRAND` — RecipeFix's warm cream, rust
 * and serif. Every Kinolog video would have come out looking like a RecipeFix
 * video, which is the exact failure the whole product-agnostic claim is about.
 * The system would have *worked*, and produced the wrong account.
 *
 * The palette is not a thing to be invented, asked for, or defaulted. It is
 * sitting in the product's own CSS: Kinolog declares `--color-bg: #141210`,
 * `--color-ink: #ede8e0`, `--color-amber: #e3b341` and a Bricolage Grotesque
 * display face. That is the brand, stated by the brand, in machine-readable
 * form.
 *
 * ## Why this is code and not an agent
 *
 * There is a `visual-brand` agent (§P1) that reads described screenshots, and
 * it is the right tool for "what does this design *feel* like". This is a
 * different question with an exact answer: *what colours does this site
 * declare*. Asking a model to read hex codes out of a stylesheet is asking it
 * to do arithmetic — it will usually be right, and "usually" is not a property
 * you want in a brand colour that will appear on every post.
 *
 * Nothing here knows what a recipe or a film is. It reads custom properties by
 * the names the whole industry uses for them, and reports which name matched,
 * so an operator can see why a colour was chosen and override it if the site's
 * naming is unusual.
 */

export interface ExtractedBrand {
  tokens: {
    primary?: string;
    background?: string;
    ink?: string;
    muted?: string;
    accent?: string;
    headingFont?: string;
    bodyFont?: string;
  };
  /** Where each token came from, so a wrong one can be traced and overridden. */
  sources: Record<string, string>;
  /** Names seen but not understood, so an unusual convention is visible. */
  unmatched: string[];
}

/**
 * The custom-property names each token answers to, best first.
 *
 * Ordered by specificity: `--color-bg` is a stronger signal than `--bg`, and
 * `--brand-primary` is stronger than `--primary`, which some systems use for a
 * button colour rather than a brand colour.
 */
const TOKEN_NAMES: Record<string, RegExp[]> = {
  background: [/^--(color-)?(bg|background|canvas|paper|page)$/i, /^--(color-)?surface$/i],
  ink: [/^--(color-)?(ink|foreground|fg|text|body-text)$/i, /^--(color-)?on-(bg|background)$/i],
  primary: [
    /^--(color-)?brand(-primary)?$/i,
    /^--(color-)?primary$/i,
    /^--(color-)?accent$/i,
  ],
  muted: [/^--(color-)?(muted|subtle|secondary-text|dim)$/i],
  accent: [/^--(color-)?(accent-2|secondary|highlight|success)$/i],
};

const HEX = /#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i;

/**
 * A colour with almost no hue: a ground, a rule, a shade of type.
 *
 * Excluded from the brand-colour search because a stylesheet is full of them
 * and they are always the most frequent thing in it — the whole grey scale
 * would outrank the one colour anybody would call the brand.
 */
function isNeutral(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return true;

  const saturation = (max - min) / max;
  /* Value, 0..1 — how bright the colour is at its strongest channel. */
  const value = max / 255;

  /*
   * §323. Saturation *and* brightness.
   *
   * Saturation alone let `#111827` through on RecipeFix — Tailwind's gray-900,
   * which is a very dark blue and technically 56% saturated because its
   * channels are 17/24/39. Three near-black values still differ enough in ratio
   * to look "colourful" to a saturation test, and it was picked as the brand
   * over the actual rust.
   *
   * A brand colour is one somebody would name. Near-black and near-white are
   * grounds and type whatever their hue, so the test is: is there enough of the
   * colour to see, and is it bright enough to be a colour rather than a shade?
   */
  if (value < 0.25 || value > 0.96) return true;
  return saturation < 0.25;
}

/** Expand `#abc` to `#aabbcc` and drop an alpha channel a palette cannot use. */
function normaliseHex(value: string): string | null {
  const match = value.match(HEX);
  if (!match) return null;
  let hex = match[1]!.toLowerCase();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  /*
   * An eight-digit hex carries alpha. A brand token is a solid colour — a
   * translucent one composited over an unknown ground is not a colour anybody
   * can check the contrast of, so the alpha is dropped rather than honoured.
   */
  if (hex.length === 8) hex = hex.slice(0, 6);
  return `#${hex}`;
}

/**
 * Read the declared custom properties out of a stylesheet.
 *
 * Deliberately not a CSS parser. Custom properties have a fixed shape and a
 * parser would bring a dependency, a bundle-size question and a class of
 * failure — a stylesheet that does not parse — in exchange for handling syntax
 * that does not appear in the thing being read.
 */
export function readCustomProperties(css: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
    const name = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    /* First declaration wins: later ones are usually theme overrides. */
    if (!found.has(name)) found.set(name, value);
  }
  return found;
}

/**
 * The two typefaces a site actually sets.
 *
 * The first family in a `font-family` list is the intended one; the rest are
 * fallbacks, and a "Fallback" suffix is what Next's font pipeline emits for the
 * locally-generated metric-matched face. Neither is the brand's typeface.
 */
export function readFonts(css: string): { headingFont?: string; bodyFont?: string } {
  const families: string[] = [];
  for (const match of css.matchAll(/font-family:\s*([^;}]+)/gi)) {
    const first = match[1]!.split(',')[0]!.trim().replace(/^["']|["']$/g, '');
    if (!first || /fallback|system-ui|sans-serif|serif|monospace|inherit|var\(/i.test(first)) {
      continue;
    }
    if (!families.includes(first)) families.push(first);
  }
  if (families.length === 0) return {};
  /*
   * A site that sets two faces is almost always display-then-body, and the
   * display face is the distinctive one — it is declared first because it is
   * the one somebody chose. With only one face, it does both jobs.
   */
  return families.length === 1
    ? { headingFont: families[0], bodyFont: families[0] }
    : { headingFont: families[0], bodyFont: families[1] };
}

export function extractBrandFromSite(input: { css: string; html?: string }): ExtractedBrand {
  const properties = readCustomProperties(input.css);
  const tokens: ExtractedBrand['tokens'] = {};
  const sources: Record<string, string> = {};
  const used = new Set<string>();

  for (const [token, patterns] of Object.entries(TOKEN_NAMES)) {
    for (const pattern of patterns) {
      const hit = [...properties.entries()].find(
        ([name, value]) => pattern.test(name) && normaliseHex(value),
      );
      if (!hit) continue;
      const colour = normaliseHex(hit[1]);
      if (!colour) continue;
      /* One property cannot fill two roles; the more specific token wins. */
      if (used.has(hit[0])) continue;
      tokens[token as keyof ExtractedBrand['tokens']] = colour;
      sources[token] = hit[0];
      used.add(hit[0]);
      break;
    }
  }

  /**
   * §323. When nothing is named by role, take the most-used non-neutral colour.
   *
   * Kinolog calls its brand colour `--color-amber`, not `--color-primary`, and
   * naming a colour by its hue rather than its job is completely normal. The
   * role-name table found its background, ink, muted and both faces and then had
   * no primary at all — which would have left the accent, the rules and the
   * fills falling back to another product's rust.
   *
   * Frequency is the signal, and it is a good one: a brand colour is the one a
   * stylesheet reaches for over and over. `#e3b341` appears 33 times in
   * Kinolog's CSS, more than any other colour in it. Neutrals are excluded —
   * they are the ground and the type, already claimed — and so are colours
   * named for a *meaning* rather than a brand, because a danger red is used
   * often and is never the brand.
   *
   * Reported with its count, so "why is the accent amber" has a number behind
   * it rather than a preference.
   */
  if (!tokens.primary) {
    const semantic = /danger|error|warning|success|info|destructive|alert/i;
    const claimed = new Set(
      [tokens.background, tokens.ink, tokens.muted, tokens.accent].filter(Boolean) as string[],
    );

    const counts = new Map<string, number>();
    /*
     * Eight-digit hexes count toward their six-digit colour. Kinolog writes its
     * amber as `#e3b34166` in every gradient and overlay, and matching only a
     * bare six digits scored those as nothing — so the colour used 33 times
     * lost to a darker variant used 19 times, and the brand came out dimmer
     * than the brand. A colour used with transparency is still that colour.
     */
    for (const match of input.css.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6})(?![0-9a-f])/gi)) {
      const hex = `#${match[1]!.slice(0, 6).toLowerCase()}`;
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }

    /* Names that declare a semantic colour, so its hex can be excluded. */
    const semanticHexes = new Set(
      [...properties.entries()]
        .filter(([name]) => semantic.test(name))
        .map(([, value]) => normaliseHex(value))
        .filter((c): c is string => c !== null),
    );

    const candidate = [...counts.entries()]
      .filter(([hex]) => !claimed.has(hex) && !semanticHexes.has(hex))
      .filter(([hex]) => !isNeutral(hex))
      .sort((a, b) => b[1] - a[1])[0];

    if (candidate) {
      tokens.primary = candidate[0];
      sources.primary = `most-used non-neutral colour (${candidate[1]} occurrences)`;
    }
  }

  /*
   * `<meta name="theme-color">` is the background when the stylesheet did not
   * name one: it is what the browser chrome is told to paint, which is the
   * page's own ground by definition.
   */
  if (!tokens.background && input.html) {
    const meta = input.html.match(
      /<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i,
    );
    const colour = meta ? normaliseHex(meta[1]!) : null;
    if (colour) {
      tokens.background = colour;
      sources.background = 'meta[name=theme-color]';
    }
  }

  const fonts = readFonts(input.css);
  if (fonts.headingFont) {
    tokens.headingFont = fonts.headingFont;
    sources.headingFont = 'font-family';
  }
  if (fonts.bodyFont) {
    tokens.bodyFont = fonts.bodyFont;
    sources.bodyFont = 'font-family';
  }

  const unmatched = [...properties.keys()].filter(
    (name) => /colou?r|bg|ink|brand|accent/i.test(name) && !used.has(name),
  );

  return { tokens, sources, unmatched: unmatched.slice(0, 20) };
}
