/**
 * Profile artwork. Milestone 50.
 *
 * An avatar and a header, rendered from brand tokens at each platform's exact
 * required size. Not post artwork: every one of these is cropped to a circle by
 * the platform, shown at a fraction of its upload size, and sits next to the
 * account name forever.
 *
 * Three consequences drive the design:
 *
 *  - **The circle crop is not optional.** A square design loses its corners on
 *    every platform, so nothing meaningful goes near them and the mark is
 *    centred inside an inscribed circle.
 *  - **200px is the real constraint, not 800.** TikTok's avatar is 200×200 and
 *    renders at about 50px in a feed. Anything with more than two characters in
 *    it is a smudge there, so the avatar is a monogram, never a wordmark.
 *  - **The banner's safe area is most of the banner.** YouTube uploads 2048×1152
 *    and shows roughly 1235×338 on a phone. Text outside that band is not a
 *    design choice, it is invisible.
 */
import { resolveBrand, type BrandTokens } from '../brand.js';
import { box, text, type SatoriElement } from './elements.js';

export interface AvatarProps {
  /** Usually one or two characters. More than three is unreadable at 50px. */
  monogram: string;
  brand: BrandTokens;
  size: number;
}

export interface BannerProps {
  wordmark: string;
  tagline?: string | null;
  brand: BrandTokens;
  width: number;
  height: number;
  /** Fraction of the height at top and bottom that platform chrome may cover. */
  safeAreaFraction?: number;
}

/**
 * The mark: a monogram on the brand's primary colour.
 *
 * Sized as a fraction of the canvas rather than in fixed points, so the 200px
 * TikTok avatar and the 800px YouTube one are the same image at two scales
 * instead of two different-looking accounts.
 */
export function avatar(props: AvatarProps): SatoriElement {
  const monogram = props.monogram.slice(0, 3).toUpperCase();
  // One character can be much larger than three before it touches the circle.
  const fraction = monogram.length === 1 ? 0.5 : monogram.length === 2 ? 0.36 : 0.26;

  return box(
    {
      width: props.size,
      height: props.size,
      backgroundColor: props.brand.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text(monogram, {
      fontFamily: props.brand.headingFont,
      fontSize: Math.round(props.size * fraction),
      color: props.brand.background,
      letterSpacing: monogram.length > 1 ? Math.round(props.size * 0.01) : 0,
      lineHeight: 1,
    }),
  );
}

/**
 * The header: wordmark and tagline, centred inside the safe band.
 *
 * Centred rather than left-aligned because the safe area is centred, and because
 * X puts the avatar over the lower left of its header. A left-aligned wordmark
 * is the one arrangement guaranteed to be covered on at least one platform.
 */
export function banner(props: BannerProps): SatoriElement {
  const safe = props.safeAreaFraction ?? 0.15;
  const inset = Math.round(props.height * safe);
  const wordmarkSize = Math.round(props.height * 0.16);

  return box(
    {
      width: props.width,
      height: props.height,
      backgroundColor: props.brand.background,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: inset,
      paddingBottom: inset,
    },
    box(
      { flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
      text(props.wordmark, {
        fontFamily: props.brand.headingFont,
        fontSize: wordmarkSize,
        color: props.brand.ink,
        lineHeight: 1.1,
      }),
      props.tagline
        ? text(props.tagline, {
            fontFamily: props.brand.bodyFont,
            fontSize: Math.round(wordmarkSize * 0.34),
            color: props.brand.muted,
            marginTop: Math.round(wordmarkSize * 0.28),
            lineHeight: 1.3,
          })
        : box({ height: 0 }),
      box({
        width: Math.round(props.width * 0.08),
        height: Math.max(3, Math.round(props.height * 0.008)),
        backgroundColor: props.brand.primary,
        marginTop: Math.round(wordmarkSize * 0.36),
      }),
    ),
  );
}

/**
 * A monogram from a product name.
 *
 * "RecipeFix" is one word in camel case, so the capitals are the initials — "RF"
 * — while "Halyard Studio" gets "HS" from its words. A single lowercase word
 * falls back to its first letter rather than producing something unreadable.
 */
export function monogramFor(productName: string): string {
  const words = productName.trim().split(/[\s\-_]+/).filter(Boolean);
  if (words.length === 0) return '?';

  if (words.length === 1) {
    const capitals = words[0]!.match(/[A-Z]/g);
    if (capitals && capitals.length >= 2) return capitals.slice(0, 2).join('');
    return words[0]!.slice(0, 1).toUpperCase();
  }
  return words
    .slice(0, 2)
    .map((word) => word[0]!)
    .join('')
    .toUpperCase();
}

export interface ProfileArtInput {
  productName: string;
  tagline?: string | null;
  brandTokens?: Record<string, unknown> | null;
  monogram?: string;
}

export function avatarElement(input: ProfileArtInput, size: number): SatoriElement {
  return avatar({
    monogram: input.monogram ?? monogramFor(input.productName),
    brand: resolveBrand(input.brandTokens),
    size,
  });
}

export function bannerElement(
  input: ProfileArtInput,
  width: number,
  height: number,
  safeAreaFraction?: number,
): SatoriElement {
  return banner({
    wordmark: input.productName,
    tagline: input.tagline ?? null,
    brand: resolveBrand(input.brandTokens),
    width,
    height,
    safeAreaFraction,
  });
}
