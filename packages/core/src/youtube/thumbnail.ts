/**
 * YouTube thumbnails, and the one fact that governs the design. §224.
 *
 * ## A thumbnail is not a small picture, it is a picture seen small
 *
 * YouTube serves a 1280×720 thumbnail and then draws it at roughly 360×202 in
 * a browse feed and about 246×138 in a sidebar. Everything about the design
 * follows from that: a headline set at a size that looks generous on the
 * 1280px canvas is 28% of that size where it is actually read. Four words at
 * 96px on the canvas is 27px in the feed — borderline. The same four words at
 * 40px is 11px, which is not a design choice, it is an absence.
 *
 * So the rules here are expressed as *rendered* sizes, and the canvas figures
 * are derived from them. That is the opposite of how the video templates work,
 * and deliberately: a video is watched at something near its own size and a
 * thumbnail never is.
 *
 * ## Why the limits are refusals rather than warnings
 *
 * `thumbnails.set` accepts anything that is a valid image under 2 MB. A
 * thumbnail with eleven words on it uploads exactly as successfully as a good
 * one, and the only feedback is a click-through rate weeks later that nobody
 * can attribute. Same shape as the chapter problem in §223: the API's success
 * is not evidence that the thing works.
 */

/** What YouTube serves. Smaller uploads are accepted and then upscaled badly. */
export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;

/** The hard API limit. Over this, `thumbnails.set` returns 400. */
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

/** Roughly how wide a thumbnail is drawn in a browse feed. */
export const FEED_RENDER_WIDTH = 360;

/**
 * The smallest a glyph may be *where it is read*, in CSS pixels.
 *
 * Below this a word is a shape rather than a word. 24px in the feed is the
 * point at which a short phrase stays legible on a phone at arm's length.
 */
export const MIN_FEED_TEXT_PX = 24;

/** The canvas size that produces `MIN_FEED_TEXT_PX` once the feed shrinks it. */
export const MIN_CANVAS_TEXT_PX = Math.ceil(
  MIN_FEED_TEXT_PX * (THUMBNAIL_WIDTH / FEED_RENDER_WIDTH),
);

/**
 * The most words a thumbnail can carry and still be read in a feed.
 *
 * Not a style preference. At the minimum legible size, more than this does not
 * fit across two lines within the safe area, so the seventh word is either
 * shrinking the other six below legibility or being clipped.
 */
export const MAX_THUMBNAIL_WORDS = 6;

/**
 * The bottom-right corner YouTube covers with the duration badge.
 *
 * Anything drawn there is not merely competing for attention — it is behind an
 * opaque black pill on every single impression.
 */
export const DURATION_BADGE = { widthFraction: 0.18, heightFraction: 0.12 };

export interface ThumbnailSpec {
  /** The words on the thumbnail. Short, because they are read at 360px wide. */
  overlayText: string;
  /** Canvas font size, already corrected for the feed. */
  fontSizePx: number;
  /** Where the text sits, avoiding the duration badge. */
  anchor: 'top-left' | 'left' | 'bottom-left';
}

export interface ThumbnailIssue {
  rule: string;
  severity: 'fail' | 'warn';
  detail: string;
}

/**
 * Size the text so it is legible where it is actually seen.
 *
 * Shorter text gets bigger type, because the constraint is the line fitting
 * across the safe width rather than a fixed scale. Never below
 * `MIN_CANVAS_TEXT_PX`: if the words do not fit at the legible size, the
 * answer is fewer words, and `checkThumbnail` says so rather than shrinking
 * them into illegibility.
 */
export function thumbnailFontSize(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words <= 2) return 190;
  if (words <= 4) return 150;
  return 120;
}

/**
 * Everything wrong with a thumbnail, before it is uploaded.
 *
 * Returns issues rather than throwing, so a caller can decide whether a `warn`
 * is worth blocking on. A `fail` is not a matter of taste — it is text that
 * will not be readable, or bytes the API will reject.
 */
export function checkThumbnail(input: {
  overlayText: string;
  fontSizePx: number;
  width: number;
  height: number;
  byteLength: number;
}): ThumbnailIssue[] {
  const issues: ThumbnailIssue[] = [];
  const words = input.overlayText.trim().split(/\s+/).filter(Boolean);

  if (input.byteLength > THUMBNAIL_MAX_BYTES) {
    issues.push({
      rule: 'thumbnail.too_large',
      severity: 'fail',
      detail: `${(input.byteLength / 1024 / 1024).toFixed(2)} MB exceeds YouTube's 2 MB limit; thumbnails.set returns 400.`,
    });
  }

  if (input.width !== THUMBNAIL_WIDTH || input.height !== THUMBNAIL_HEIGHT) {
    issues.push({
      rule: 'thumbnail.wrong_size',
      severity: input.width / input.height === 16 / 9 ? 'warn' : 'fail',
      detail: `${input.width}x${input.height} is not ${THUMBNAIL_WIDTH}x${THUMBNAIL_HEIGHT}.`,
    });
  }

  if (words.length === 0) {
    issues.push({
      rule: 'thumbnail.no_text',
      severity: 'warn',
      detail: 'No overlay text. A thumbnail carrying only an image relies entirely on the title.',
    });
  }

  if (words.length > MAX_THUMBNAIL_WORDS) {
    issues.push({
      rule: 'thumbnail.too_many_words',
      severity: 'fail',
      detail:
        `${words.length} words. At the size a feed renders a thumbnail, more than ` +
        `${MAX_THUMBNAIL_WORDS} cannot be read — and it is read at about ${FEED_RENDER_WIDTH}px wide, not ${THUMBNAIL_WIDTH}.`,
    });
  }

  if (words.length > 0 && input.fontSizePx < MIN_CANVAS_TEXT_PX) {
    const rendered = Math.round(input.fontSizePx * (FEED_RENDER_WIDTH / THUMBNAIL_WIDTH));
    issues.push({
      rule: 'thumbnail.text_too_small',
      severity: 'fail',
      detail:
        `${input.fontSizePx}px on the canvas renders at about ${rendered}px in a feed, under the ` +
        `${MIN_FEED_TEXT_PX}px a short phrase needs to stay readable.`,
    });
  }

  return issues;
}

/** True when nothing found is a hard failure. */
export function thumbnailPasses(issues: ThumbnailIssue[]): boolean {
  return !issues.some((i) => i.severity === 'fail');
}

/**
 * The words on the thumbnail, from what the concept already said. §224.
 *
 * ## Why this is not a truncation
 *
 * The obvious implementation is to cut the hook at six words. It produces
 * things like "Why gluten-free bread fails every" — a sentence stopped
 * mid-thought, which reads as a bug rather than as a headline. A thumbnail
 * line has to be a complete thought, so the only safe transformations are
 * ones that end on a boundary the writer already put there.
 *
 * So: take the hook if it already fits; otherwise take its first clause if
 * *that* fits; otherwise refuse. Refusing is honest and rare — it means the
 * concept never expressed itself briefly, which is a thing worth knowing
 * about the concept.
 *
 * A refusal is not a failure to render. It is the signal that this line needs
 * a person or a writer, and `checkThumbnail` is what decides either way.
 */
export function thumbnailTextFrom(
  concept: { hook?: string | null; title?: string | null },
): { text: string; source: 'hook' | 'hook_clause' | 'title'; } | { text: null; reason: string } {
  const candidates: Array<[string, 'hook' | 'hook_clause' | 'title']> = [];

  const hook = (concept.hook ?? '').trim().replace(/\s+/g, ' ');
  if (hook) {
    candidates.push([hook, 'hook']);
    /* A clause boundary the writer chose, not a cut at an arbitrary word. */
    const clause = hook.split(/\s*[,;:—–]\s*|\s+[-]\s+/)[0]?.trim();
    if (clause && clause !== hook) candidates.push([clause, 'hook_clause']);
  }

  const title = (concept.title ?? '').trim().replace(/\s+/g, ' ');
  if (title) candidates.push([title, 'title']);

  for (const [text, source] of candidates) {
    const stripped = text.replace(/[.!?]+$/, '');
    if (stripped.split(/\s+/).filter(Boolean).length <= MAX_THUMBNAIL_WORDS) {
      return { text: stripped, source };
    }
  }

  return {
    text: null,
    reason:
      candidates.length === 0
        ? 'The concept carries neither a hook nor a title.'
        : `Nothing the concept says fits in ${MAX_THUMBNAIL_WORDS} words without cutting a sentence in half. ` +
          `Shortest candidate: "${candidates.reduce((a, b) => (a[0].length <= b[0].length ? a : b))[0]}".`,
  };
}
