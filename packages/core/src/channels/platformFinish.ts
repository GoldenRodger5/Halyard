/**
 * §352. One production, several finishes.
 *
 * A short video posted to TikTok, Reels and Shorts is **one production** — the
 * screenplay, the voice, the music and the render are the same piece — and
 * `publish.ts` currently sends the identical file to all three.
 * `HALYARD_CREATIVE_GAP_AUDIT.md` §6 named this:
 *
 * > Media is not platform-native. `publish.ts` currently reuses the same
 * > `render_ids` across destinations. TikTok, Reels and Shorts therefore
 * > receive the same file rather than distinct edits.
 *
 * The answer is not three pipelines. It is a **finish** — the last step, where
 * one produced piece is trimmed to the platform it is going to. That keeps the
 * expensive work shared and the cheap differences real.
 *
 * ## What actually differs, and what does not
 *
 * The temptation is to differentiate everything. Almost nothing genuinely
 * differs: the story, the pacing, the palette, the voice and the music are
 * properties of the *piece*. What differs is a small, knowable set — how long
 * the opening has to earn attention, how much caption the platform shows before
 * truncating, where a link may go, and whether the platform's own UI covers
 * part of the frame.
 *
 * Everything here is a number a platform imposes, not a preference. A finish
 * that changed the writing would be making a different piece and calling it a
 * variant.
 */

export interface PlatformFinish {
  platform: string;
  /**
   * Seconds the opening has to earn the watch.
   *
   * The single most consequential number in short video, and it genuinely
   * differs: TikTok's feed decides fastest because it is a pure recommendation
   * surface with no social obligation to keep watching; Shorts gives slightly
   * longer because it inherits YouTube's session behaviour.
   */
  openingSeconds: number;
  /** Characters shown before the platform truncates and adds a "more". */
  captionVisibleChars: number;
  /** Where an outbound link may go, from the adapter's own constraint. */
  linkStrategy: string;
  /**
   * Fraction of the frame the platform's own UI covers at the bottom.
   *
   * Not the same as a safe area: this is where the *platform* draws its caption,
   * its buttons and its handle, which is why a piece can pass a safe-area check
   * and still have its last line sitting under a follow button.
   */
  bottomChromeFraction: number;
  /** Why this finish differs, for an operator reading a diff of two variants. */
  because: string;
}

/**
 * The finishes, from the platforms' own published behaviour.
 *
 * Numbers rather than adjectives, so a piece can be checked against them. Where
 * a number is a range in practice, the tighter end is used: a piece that holds
 * on the strictest surface holds everywhere, and the reverse is not true.
 */
export const PLATFORM_FINISHES: Record<string, PlatformFinish> = {
  tiktok: {
    platform: 'tiktok',
    openingSeconds: 0.5,
    captionVisibleChars: 100,
    linkStrategy: 'bio_only',
    bottomChromeFraction: 0.22,
    because:
      'A pure recommendation feed with no social obligation to keep watching, so the opening has the least time and the UI covers the most frame.',
  },
  instagram: {
    platform: 'instagram',
    openingSeconds: 1,
    captionVisibleChars: 125,
    linkStrategy: 'bio_only',
    bottomChromeFraction: 0.2,
    because:
      'A Reel arrives partly through following, so a viewer gives it slightly longer than a cold recommendation.',
  },
  youtube: {
    platform: 'youtube',
    openingSeconds: 1.5,
    /* A Short shows a title rather than a caption, and it is short. */
    captionVisibleChars: 100,
    linkStrategy: 'description',
    bottomChromeFraction: 0.18,
    because:
      'Shorts inherits YouTube session behaviour, so a viewer is more willing to wait — and the link may go in the description rather than a bio.',
  },
  x: {
    platform: 'x',
    openingSeconds: 1,
    captionVisibleChars: 280,
    linkStrategy: 'first_reply',
    bottomChromeFraction: 0.1,
    because:
      'The whole post is visible, so the caption is the piece; the link goes in the first reply because a body link costs ~13x and is demoted.',
  },
  threads: {
    platform: 'threads',
    openingSeconds: 1,
    captionVisibleChars: 500,
    linkStrategy: 'in_body',
    bottomChromeFraction: 0.1,
    because: 'A link may sit in the body, which no other feed platform here allows.',
  },
  pinterest: {
    platform: 'pinterest',
    /* Nobody scrolls past a Pin in half a second; it is a search surface. */
    openingSeconds: 2,
    captionVisibleChars: 500,
    linkStrategy: 'pin_destination',
    bottomChromeFraction: 0.12,
    because: 'A search surface with a long half-life, where the destination link is the point.',
  },
};

export interface FinishProblem {
  rule: string;
  detail: string;
}

/**
 * §352. Would this piece survive on this platform as it is?
 *
 * Checked per destination rather than once, because a piece that is fine on
 * Shorts can be too slow to open on TikTok — and the current pipeline would
 * publish it to both without noticing.
 */
export function checkFinish(
  piece: {
    /** When the first legible frame lands, in seconds. */
    openingLandsAtSeconds?: number;
    caption?: string;
    /** Whether the caption carries a link in its body. */
    captionHasLink?: boolean;
    /** Lowest fraction of the frame any text occupies, 0..1 from the top. */
    lowestTextFraction?: number;
  },
  finish: PlatformFinish,
): FinishProblem[] {
  const problems: FinishProblem[] = [];

  if (
    piece.openingLandsAtSeconds !== undefined &&
    piece.openingLandsAtSeconds > finish.openingSeconds
  ) {
    problems.push({
      rule: 'finish.slow_opening',
      detail:
        `The opening lands at ${piece.openingLandsAtSeconds}s and ${finish.platform} decides in ` +
        `${finish.openingSeconds}s. ${finish.because}`,
    });
  }

  if (piece.caption && piece.caption.length > finish.captionVisibleChars) {
    /*
     * Not an error: a longer caption is normal and is truncated with a "more".
     * It is a problem only if the *point* is past the cut, which no
     * deterministic check can know — so this reports where the cut falls and
     * leaves the judgement to the operator or the critic.
     */
    problems.push({
      rule: 'finish.caption_truncated',
      detail:
        `${finish.platform} shows about ${finish.captionVisibleChars} characters and this is ` +
        `${piece.caption.length}. It is cut after: "${piece.caption.slice(0, finish.captionVisibleChars).slice(-40)}…"`,
    });
  }

  if (piece.captionHasLink && finish.linkStrategy !== 'in_body') {
    problems.push({
      rule: 'finish.link_misplaced',
      detail:
        `The caption carries a link and ${finish.platform} wants it ${finish.linkStrategy.replace('_', ' ')}. ` +
        finish.because,
    });
  }

  if (
    piece.lowestTextFraction !== undefined &&
    piece.lowestTextFraction > 1 - finish.bottomChromeFraction
  ) {
    problems.push({
      rule: 'finish.under_platform_ui',
      detail:
        `Text sits at ${Math.round(piece.lowestTextFraction * 100)}% down the frame and ` +
        `${finish.platform} draws its own UI over the bottom ${Math.round(finish.bottomChromeFraction * 100)}%.`,
    });
  }

  return problems;
}

export function finishFor(platform: string): PlatformFinish | null {
  return PLATFORM_FINISHES[platform] ?? null;
}
