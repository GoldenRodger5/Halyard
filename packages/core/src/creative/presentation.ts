/**
 * How loud a frame should be, by where it is going. §211.
 *
 * Halyard's video has one visual register: editorial. Serif headings, warm
 * near-white ground, generous margins, type filling about 62% of its band. It
 * is a considered look — §160 through §169 built it deliberately and it is
 * genuinely good on a Pinterest tile or a considered brand feed.
 *
 * It is the wrong register for a short-form feed, and measurably so. A rendered
 * frame is ~40% empty ground, the heading sits around 66px on a 1080-wide
 * canvas, and nothing moves after the entrance. Retention research is
 * consistent that a text-dominant opening with no motion loses the viewer
 * inside two seconds — the window in which the platform decides whether to
 * distribute at all.
 *
 * ## Why a mode rather than a redesign
 *
 * Because the editorial register is not a mistake. Replacing it would trade one
 * fixed answer for another, and Pinterest would inherit a treatment designed
 * for a feed it does not have. The platform already knows what it wants; this
 * makes that a lookup rather than an argument.
 *
 * Nothing here is product-specific and nothing here can be. It reads a platform
 * id and returns numbers.
 */

/**
 * `editorial` — the existing register. Restraint, hierarchy, air.
 * `punch` — short-form. Large, heavy, high contrast, filling the frame, moving.
 */
export type PresentationMode = 'editorial' | 'punch';

export interface PresentationSpec {
  mode: PresentationMode;
  /**
   * Multiplier on the base type scale.
   *
   * Applied to the existing ratios rather than replacing them, so the
   * hierarchy §162 established between before, after and reason survives — a
   * bigger frame, not a different one.
   */
  typeScale: number;
  /** Share of the band the content aims to occupy. */
  fill: number;
  /** Horizontal gutter, in pixels at 1080 wide. */
  padding: number;
  /** `600` reads as body copy at distance; short-form headings need weight. */
  fontWeight: number;
  /** Whether headings use the brand's heading face or its body face. */
  useHeadingFont: boolean;
  /** Seconds of entrance movement on each beat. Zero means a cut. */
  entranceSeconds: number;
  /**
   * Slow scale applied across a media beat — a push, in the documentary sense.
   *
   * 1 is off. A still image with no push is a static frame however good the
   * photograph is, and a static frame is what the retention rules penalise.
   */
  mediaPush: number;
  /** Words on a single beat before it stops being read and starts being skipped. */
  maxWordsPerBeat: number;
}

export const EDITORIAL: PresentationSpec = {
  mode: 'editorial',
  typeScale: 1,
  fill: 0.62,
  padding: 72,
  fontWeight: 400,
  useHeadingFont: true,
  entranceSeconds: 0.3,
  mediaPush: 1,
  maxWordsPerBeat: 24,
};

/**
 * The short-form register.
 *
 * Every number here is a correction to something measured in the rendered
 * files: type roughly doubled, fill raised so the frame is not 40% empty,
 * padding tightened, weight increased, and a continuous push so the picture is
 * never still. The word ceiling is two thirds of editorial's, because the
 * measured cards carried 35, 29 and 23 words and none of that is read on a
 * phone.
 */
export const PUNCH: PresentationSpec = {
  mode: 'punch',
  typeScale: 1.85,
  fill: 0.86,
  padding: 56,
  fontWeight: 700,
  /* Body face: the brand's serif is a display face at this size and loses
   * legibility over media, which is where short-form text sits. */
  useHeadingFont: false,
  entranceSeconds: 0.18,
  mediaPush: 1.08,
  maxWordsPerBeat: 14,
};

/**
 * Which register a platform wants.
 *
 * Short-form feeds are punch; the two surfaces people arrive at deliberately —
 * a Pinterest tile someone is browsing, a long-form YouTube frame someone
 * chose — keep the editorial register, because attention is not being competed
 * for in the same way.
 *
 * Deliberately a lookup and not a heuristic. When performance says otherwise
 * for a specific account, §204 is the mechanism that should change it, and a
 * clever inference here would hide that.
 */
export function presentationFor(platform: string, formatSubtype?: string | null): PresentationSpec {
  if (platform === 'pinterest') return EDITORIAL;
  if (platform === 'youtube' && formatSubtype === 'long_form') return EDITORIAL;
  return PUNCH;
}

/**
 * The trimmed form of a line, for a given register.
 *
 * Returns the words that fit rather than an ellipsis: a beat that has been cut
 * mid-sentence reads as a bug, and the planner's job was to choose a line short
 * enough in the first place. This is the last defence, and `creativeQC` reports
 * the overflow as a defect so it gets fixed upstream rather than silently
 * truncated forever.
 */
export function fitWords(text: string, spec: PresentationSpec): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= spec.maxWordsPerBeat) return text.trim();
  return words.slice(0, spec.maxWordsPerBeat).join(' ');
}
