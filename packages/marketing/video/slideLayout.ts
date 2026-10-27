/**
 * Geometry for the still formats (swipe carousels, photo-mode slideshows,
 * single images), shared by the Remotion components and the Node side that
 * crops photos and checks the safe area. Plain data: no React, no Node.
 *
 * Every photo box here is the box the image is DRAWN in. The Node side crops
 * the licensed master to exactly that aspect before rendering, so `objectFit:
 * cover` never has to guess and nothing is squashed.
 */

export type Canvas = 'feed' | 'tall';
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CANVAS: Record<Canvas, { width: number; height: number }> = {
  feed: { width: 1080, height: 1350 },
  tall: { width: 1080, height: 1920 },
};

/**
 * Where text may land. Instagram 4:5: ≥ 60 px from every edge (the profile
 * grid shows the centre 3:4, so the cover keeps its headline in the middle
 * band too). TikTok photo mode 9:16: the same box as the videos (right column
 * holds the buttons, the bottom the caption, the top the tabs).
 */
export const TEXT_SAFE: Record<Canvas, { x0: number; y0: number; x1: number; y1: number }> = {
  feed: { x0: 60, y0: 60, x1: 1020, y1: 1290 },
  tall: { x0: 120, y0: 270, x1: 900, y1: 1250 },
};

/** Layout boxes per canvas. `card` photos have a 10 px white border inside the box. */
export const QUIZ = {
  feed: {
    banner: { x: 64, y: 72, w: 952, h: 92 },
    coverHead: { x: 70, y: 196, w: 940, h: 330 },
    coverPhoto: { x: 120, y: 560, w: 840, h: 540 },
    coverFoot: { x: 64, y: 1150, w: 952, h: 120 },
    question: { x: 70, y: 196, w: 940, h: 250 },
    options: { x: 64, y: 476, w: 952, h: 240 },
    qPhoto: { x: 150, y: 760, w: 780, h: 400 },
    qFoot: { x: 64, y: 1196, w: 952, h: 76 },
    answers: { x: 64, y: 196, w: 952, h: 1060 },
  },
  tall: {
    banner: { x: 120, y: 284, w: 780, h: 84 },
    coverHead: { x: 124, y: 396, w: 772, h: 360 },
    coverFoot: { x: 120, y: 776, w: 780, h: 110 },
    coverPhoto: { x: 110, y: 920, w: 860, h: 640 },
    question: { x: 124, y: 392, w: 772, h: 240 },
    options: { x: 120, y: 652, w: 780, h: 236 },
    qFoot: { x: 120, y: 908, w: 780, h: 72 },
    qPhoto: { x: 130, y: 1010, w: 820, h: 560 },
    answers: { x: 120, y: 392, w: 780, h: 850 },
  },
} as const;

export const SWAP = {
  feed: {
    coverPhoto: { x: 0, y: 0, w: 1080, h: 760 },
    pad: { x: 72, y: 70, w: 936, h: 1210 },
    shotW: 900,
  },
  tall: {
    coverPhoto: { x: 0, y: 0, w: 1080, h: 820 },
    pad: { x: 134, y: 292, w: 752, h: 946 },
    shotW: 680,
  },
} as const;

export const FACT = {
  photo: { x: 0, y: 0, w: 1080, h: 640 },
  card: { x: 64, y: 540, w: 952, h: 746 },
} as const;

/** Average advance per character, in em, measured loosely for each face at 600 weight. */
export const CHAR_EM = { inter: 0.54, lilita: 0.5, serif: 0.43 } as const;

/** Lines a string wraps to at `size` px in a column `width` wide (word-aware, conservative). */
export function wrapLines(text: string, size: number, width: number, em: number): number {
  const perLine = Math.max(1, Math.floor(width / (size * em)));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/)) {
    const n = word.length;
    if (used === 0) used = n;
    else if (used + 1 + n <= perLine) used += 1 + n;
    else {
      lines++;
      used = n;
    }
  }
  return lines;
}

/** Largest size in [min, max] whose wrapped height fits; `min` when nothing fits (QA then catches it). */
export function fitSize(text: string, width: number, height: number, max: number, min: number, em: number, lineHeight = 1.15): number {
  for (let s = max; s > min; s -= 2) if (wrapLines(text, s, width, em) * s * lineHeight <= height) return s;
  return min;
}
