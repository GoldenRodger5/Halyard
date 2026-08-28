/**
 * YouTube chapters. §223.
 *
 * ## Why this is code and not a prompt
 *
 * Chapters are not a feature you enable. They are timestamps in the
 * description text, and YouTube turns them on only when the whole list
 * satisfies a set of rules it does not tell you about and does not complain
 * about breaking. Get one of them wrong — a first timestamp that is not
 * `0:00`, two chapters nine seconds apart, only two entries — and YouTube
 * renders the description as plain text. No error, no warning, no difference
 * in the API response. The upload succeeds and the chapters simply are not
 * there.
 *
 * That is the failure mode this codebase keeps finding: a green result that
 * means nothing happened. So the rules live here, deterministically, and a
 * chapter list that cannot satisfy them is refused with a reason rather than
 * emitted and hoped for.
 *
 * ## The rules, as YouTube documents them
 *
 * - The first timestamp must be `0:00`.
 * - There must be at least three.
 * - Each chapter must run at least ten seconds.
 * - They must be in ascending order.
 * - Each is its own line, `timestamp` then a space then the title.
 */

/** YouTube requires the first chapter to start at the very beginning. */
export const FIRST_CHAPTER_SECONDS = 0;

/** Fewer than this and YouTube ignores the list entirely. */
export const MIN_CHAPTERS = 3;

/** A chapter shorter than this makes YouTube ignore the list entirely. */
export const MIN_CHAPTER_SECONDS = 10;

/** Long enough to be worth chaptering at all. Below this YouTube shows none. */
export const MIN_VIDEO_SECONDS_FOR_CHAPTERS = 60;

export interface Chapter {
  /** Seconds from the start of the video. */
  startSeconds: number;
  title: string;
}

export interface ChapterResult {
  /** The lines to put in the description, or empty when none are valid. */
  lines: string[];
  /** Why there are none. Null when there are. */
  refusedReason: string | null;
  /** What was dropped on the way, so a thin list is explainable. */
  notes: string[];
}

/**
 * Format one timestamp the way YouTube parses it.
 *
 * Under an hour it must be `m:ss` or `mm:ss`; at an hour and beyond it must
 * be `h:mm:ss`. Padding the minutes on a sub-hour stamp is accepted, but
 * padding the *hours* is not, so the two cases are written separately rather
 * than one padded template.
 */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

/**
 * Turn a beat plan into chapters, or refuse.
 *
 * Beats are the natural chapter boundaries — they are already the points at
 * which the piece changes what it is doing — but there are usually more beats
 * than a viewer wants chapters, and short ones violate the ten-second rule. So
 * adjacent beats are merged forward until each chapter clears the minimum,
 * which keeps the boundaries real rather than inventing new ones.
 */
export function chaptersFromBeats(
  beats: Array<{ title: string; startSeconds: number }>,
  videoSeconds: number,
): ChapterResult {
  const notes: string[] = [];

  if (videoSeconds < MIN_VIDEO_SECONDS_FOR_CHAPTERS) {
    return {
      lines: [],
      refusedReason: `A ${Math.round(videoSeconds)}s video is shorter than the ${MIN_VIDEO_SECONDS_FOR_CHAPTERS}s YouTube needs before it shows chapters at all.`,
      notes,
    };
  }

  const sorted = [...beats].sort((a, b) => a.startSeconds - b.startSeconds);
  const merged: Chapter[] = [];
  for (const beat of sorted) {
    const title = beat.title.trim();
    if (!title) {
      notes.push(`Beat at ${formatTimestamp(beat.startSeconds)} has no title; merged into the previous chapter.`);
      continue;
    }
    const previous = merged[merged.length - 1];
    /*
     * Merge forward rather than stretching backward. A chapter that starts
     * where the previous one is still running is the one thing YouTube treats
     * as malformed rather than merely ignoring, so the earlier boundary wins
     * and the later beat is folded into it.
     */
    if (previous && beat.startSeconds - previous.startSeconds < MIN_CHAPTER_SECONDS) {
      notes.push(
        `"${title}" starts ${Math.round(beat.startSeconds - previous.startSeconds)}s after "${previous.title}", under the ${MIN_CHAPTER_SECONDS}s minimum; merged.`,
      );
      continue;
    }
    merged.push({ startSeconds: Math.floor(beat.startSeconds), title });
  }

  /* The last chapter has to clear the minimum against the end of the video,
     not against a following chapter that does not exist. */
  const last = merged[merged.length - 1];
  if (last && videoSeconds - last.startSeconds < MIN_CHAPTER_SECONDS) {
    notes.push(
      `"${last.title}" is within ${MIN_CHAPTER_SECONDS}s of the end; dropped.`,
    );
    merged.pop();
  }

  if (merged.length === 0) {
    return { lines: [], refusedReason: 'No beat carried a usable title.', notes };
  }

  if (merged[0]!.startSeconds !== FIRST_CHAPTER_SECONDS) {
    /*
     * Not an error to fix silently by shifting the first stamp to zero: that
     * would mislabel whatever plays before it. The plan is wrong, and saying
     * so is more useful than a chapter list that points at the wrong seconds.
     */
    return {
      lines: [],
      refusedReason: `The first chapter starts at ${formatTimestamp(merged[0]!.startSeconds)}; YouTube requires 0:00.`,
      notes,
    };
  }

  if (merged.length < MIN_CHAPTERS) {
    return {
      lines: [],
      refusedReason: `Only ${merged.length} chapter${merged.length === 1 ? '' : 's'} survived the ${MIN_CHAPTER_SECONDS}s minimum; YouTube needs ${MIN_CHAPTERS}.`,
      notes,
    };
  }

  return {
    lines: merged.map((c) => `${formatTimestamp(c.startSeconds)} ${c.title}`),
    refusedReason: null,
    notes,
  };
}

/**
 * Read chapters back out of a description.
 *
 * The inverse, so a published video can be checked against what was intended
 * rather than assumed correct. `null` means unparseable, which is different
 * from an empty list — gotcha 9's distinction, applied to a description.
 */
export function parseChapters(description: string): Chapter[] {
  const out: Chapter[] = [];
  for (const line of description.split('\n')) {
    const match = /^\s*(\d{1,2}:)?(\d{1,2}):(\d{2})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const [, h, m, s, title] = match;
    const startSeconds =
      (h ? Number(h.slice(0, -1)) * 3600 : 0) + Number(m) * 60 + Number(s);
    out.push({ startSeconds, title: title! });
  }
  return out;
}
