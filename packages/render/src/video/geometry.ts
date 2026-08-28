/**
 * Frame geometry: what changes when the canvas is not a phone. §222.
 *
 * ## Why this exists
 *
 * Every composition in this package was 1080×1920, and the layout constants
 * that went with it — a 12% safe area top and bottom, a caption band starting
 * at 72% — were correct for that one canvas and silently wrong for any other.
 * They encode two facts about a *phone*: TikTok and Reels draw their own UI
 * over the top and bottom of the frame, and a portrait frame has vertical room
 * to spare. Neither is true of a YouTube player.
 *
 * Rendering the same layout at 1920×1080 does not fail. It produces a frame
 * that is technically correct and reads as a portrait video someone stretched:
 * 40% of the height given to safe areas that guard against chrome that is not
 * there, and a line of body copy running the full 1776px — roughly 28 words
 * across — which is about twice a comfortable measure.
 *
 * So geometry is resolved from the frame rather than assumed, once, here.
 *
 * ## No Node imports
 *
 * Gotcha 10. This is reached from `treatments.tsx`, which Remotion webpacks
 * for the browser. Anything Node-only here builds, typechecks, passes every
 * test and then fails at render time with `UnhandledSchemeError`.
 */

/**
 * The suffix that marks a landscape composition id.
 *
 * Here rather than in `root.tsx` deliberately. The worker resolves a
 * composition id on the Node side and Remotion registers it on the browser
 * side, and the two must agree — but `root.tsx` imports Remotion and React,
 * so a Node caller reaching for the suffix there would drag the whole render
 * bundle into the worker. Gotcha 10, pointing the other way.
 */
export const LANDSCAPE_SUFFIX = 'Wide';

export type FrameAspect = '9:16' | '16:9' | '1:1' | '4:5';

export interface FrameGeometry {
  aspect: FrameAspect;
  /** Percentage of height kept clear at the top. */
  safeTopPercent: number;
  /** Percentage of height kept clear at the bottom when there are no captions. */
  safeBottomPercent: number;
  /** Where the caption band begins, as a percentage of height. */
  captionBandTopPercent: number;
  /**
   * How wide the content column may be, as a percentage of frame width.
   *
   * The single most important landscape control. Text set across a full
   * 1920px frame is unreadable regardless of how well everything else is
   * tuned, and no amount of padding fixes it — the column has to be capped.
   */
  contentMaxWidthPercent: number;
  /**
   * Multiplier on type size.
   *
   * Type is sized against the height everywhere else in this package, and a
   * landscape frame has 56% of the height of a portrait one at the same
   * width. Without this correction every card renders barely more than half
   * the size it should.
   *
   * Settled by rendering frames and looking at them rather than by arithmetic:
   * the first value derived from the height ratio was 1.6, which produced a
   * title card rather than a hook.
   */
  typeScale: number;
  /**
   * Whether the role's own vertical anchor still applies.
   *
   * In portrait, most roles anchor to the bottom of the band: it puts the
   * words near the thumb and directly above the captions, which is the right
   * call on a phone. On a landscape frame the same rule strands a third of
   * the picture empty above the content — so landscape overrides it and
   * centres, and `anchorFor` keeps deciding everywhere else.
   */
  anchorOverride?: 'center';
}

/**
 * Which canvas this is.
 *
 * Ratio rather than exact dimensions: a render at 1280×720 is as much 16:9 as
 * one at 1920×1080, and a composition asked for an odd size should still land
 * on the nearest sane geometry rather than falling through to portrait.
 */
export function aspectOf(frame: { width: number; height: number }): FrameAspect {
  const ratio = frame.width / frame.height;
  if (ratio >= 1.4) return '16:9';
  if (ratio >= 0.92) return '1:1';
  if (ratio >= 0.72) return '4:5';
  return '9:16';
}

const GEOMETRY: Record<FrameAspect, Omit<FrameGeometry, 'aspect'>> = {
  /*
   * The original numbers, unchanged. Every existing render must land exactly
   * where it landed before this file existed.
   */
  '9:16': {
    safeTopPercent: 12,
    safeBottomPercent: 12,
    captionBandTopPercent: 72,
    contentMaxWidthPercent: 100,
    typeScale: 1,
  },
  /*
   * Landscape. The safe areas shrink because a YouTube player draws nothing
   * over the frame but a progress bar along the very bottom edge, and vertical
   * room is the scarce resource rather than the plentiful one. The caption
   * band sits lower for the same reason.
   */
  '16:9': {
    safeTopPercent: 7,
    safeBottomPercent: 9,
    captionBandTopPercent: 79,
    contentMaxWidthPercent: 62,
    typeScale: 1.25,
    anchorOverride: 'center',
  },
  '1:1': {
    safeTopPercent: 10,
    safeBottomPercent: 10,
    captionBandTopPercent: 74,
    contentMaxWidthPercent: 88,
    typeScale: 1.15,
  },
  '4:5': {
    safeTopPercent: 11,
    safeBottomPercent: 11,
    captionBandTopPercent: 73,
    contentMaxWidthPercent: 96,
    typeScale: 1.05,
  },
};

export function geometryFor(frame: { width: number; height: number }): FrameGeometry {
  const aspect = aspectOf(frame);
  return { aspect, ...GEOMETRY[aspect] };
}
