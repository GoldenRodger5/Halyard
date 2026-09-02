/**
 * §439. How long a piece is, decided rather than discovered.
 *
 * ## What this replaces
 *
 * `PostFormat.targetSeconds` declared a duration and nothing read it. That was
 * the visible half. The invisible half is worse: length was never *chosen* at
 * all. It is arithmetic over what the writer happened to write —
 *
 *     seconds(line) = max(2.0, words / 2.6 + 0.55)
 *
 * summed over every line — so a piece is as long as its word count makes it,
 * and the word count is bounded by each slot's `maxWords`, which was set by
 * editorial taste in the same object, four lines from a `targetSeconds` also
 * set by editorial taste. The two were never reconciled with the arithmetic
 * between them.
 *
 * For `quiz` the numbers do not merely disagree, they are unreachable: 180
 * maximum words over 12 lines implies **76 seconds** against a declared 30. No
 * amount of writing to the ceiling produces the declared target, because the
 * ceiling *is* the problem.
 *
 * ## The model
 *
 * Three ideas, in the order they matter.
 *
 * **1. The platform owns the band, not the format.** How long a piece should be
 * is a distribution question and distribution belongs to the platform. TikTok
 * ranks on completion — under 30s completes at ~72%, 30-60s at ~54% — so length
 * costs more there than anywhere. YouTube Shorts is half search, so a viewer
 * arriving from a query has already decided to watch and tolerates twice as
 * much. Same idea, same product, two different pieces.
 *
 * **2. The format owns its pace.** A myth correction is a concession and a
 * rebuttal and lands harder short. A history is a story with a turn and needs
 * room. That is a property of the *shape*, so it modifies the band rather than
 * replacing it.
 *
 * **3. The budget flows backwards, as words.** This is the part that makes it
 * real instead of a second inert number. Invert the arithmetic and a duration
 * becomes a word count; distribute that across the slots in proportion to their
 * declared ceilings and the editorial intent of the ratios survives the
 * scaling. The writer is then told how long each line has, before writing.
 *
 * And where the budget will not fit, the **structure** flexes and not just the
 * wording — see `lengthBudgetFor`, which is where that decision lives.
 *
 * ## Where the numbers come from
 *
 * Measured platform behaviour as of 2026-09, recorded with the date because
 * §438 is the standing lesson about constants that describe somebody else's
 * product. `docs/DIRECTION_SPEC.md` Part 1 carries the citations.
 */
import type { ChannelId } from '../channels/channels.js';
import type { PostFormat } from '../formats/catalog.js';

/**
 * What a piece should run on one platform, in one channel.
 *
 * `ceilingSeconds` is a **distribution** ceiling, not a legal one. Every
 * platform here accepts far more than this; past the ceiling the piece is
 * accepted and not distributed, which is worse than refused because it looks
 * like it worked. The legal bounds live in `VIDEO_BOUNDS` and are three to ten
 * times these numbers.
 */
export interface LengthBand {
  /** Below this the piece reads as unfinished rather than as tight. */
  floorSeconds: number;
  /** What a piece is built to. */
  targetSeconds: number;
  /** Past this, completion falls off a cliff. */
  ceilingSeconds: number;
  /** Why these three numbers, for the operator and the decision record. */
  because: string;
}

/**
 * The date the bands below were last checked against the platforms.
 *
 * §438: `VIDEO_BOUNDS` carried a Reels cap of 90 seconds and a Shorts cap of 60
 * for something over a year after both platforms moved to three minutes, and
 * the test suite defended it. A constant that describes a third party's
 * behaviour is a measurement, and a measurement without a date is a guess.
 */
export const BANDS_VERIFIED_ON = '2026-09-01';

/**
 * Per platform, per channel. Absent means "no band is known", which callers
 * must report as unmeasured rather than treating as unbounded — gotcha 6.
 */
export const LENGTH_BANDS: Record<string, Partial<Record<ChannelId, LengthBand>>> = {
  tiktok: {
    short_video: {
      floorSeconds: 12,
      targetSeconds: 32,
      ceilingSeconds: 55,
      because:
        'Completion is the primary ranking signal and the bar is now ~70%. Under 30s averages 72% completion, 30-60s averages 54%, so the cost of length is steepest here. 32 sits inside the 24-38s band that performs; 55 is where the curve breaks.',
    },
  },
  instagram: {
    short_video: {
      floorSeconds: 10,
      targetSeconds: 26,
      ceilingSeconds: 45,
      because:
        'Reels reward saves and shares over raw watch time, and the sweet spot is 15-30s — tighter than TikTok because the feed is mixed rather than full-screen-by-default. Past three minutes Instagram stops recommending to non-followers, but the useful ceiling is far below that.',
    },
    story: {
      floorSeconds: 5,
      targetSeconds: 9,
      ceilingSeconds: 15,
      because: 'A story card is read, not watched, and the next tap is always one thumb away.',
    },
  },
  youtube: {
    short_video: {
      floorSeconds: 22,
      targetSeconds: 48,
      ceilingSeconds: 90,
      because:
        'The longest band of the three. Shorts is half search, so a viewer arriving from a query has already decided to watch, and the engagement sweet spot is 30-60s. Our pieces run 19s here, which is half the length that performs.',
    },
  },
  x: {
    short_video: {
      floorSeconds: 8,
      targetSeconds: 22,
      ceilingSeconds: 45,
      because: 'In-feed, autoplayed muted, alongside text. The lowest patience of the set.',
    },
  },
  threads: {
    short_video: {
      floorSeconds: 8,
      targetSeconds: 22,
      ceilingSeconds: 45,
      because: 'As X: the video is an attachment to a post rather than the post.',
    },
  },
};

/**
 * How much room a format's shape needs, as a multiplier on the platform band.
 *
 * Not a duration. A format cannot know how long it should be, because that
 * depends on where it lands — which is the mistake `targetSeconds` made.
 */
export const PACES = ['terse', 'standard', 'unhurried'] as const;
export type Pace = (typeof PACES)[number];

export const PACE_FACTORS: Record<Pace, number> = {
  /* A correction lands harder the less of it there is. */
  terse: 0.8,
  standard: 1,
  /* A story with a turn needs the room to turn in. */
  unhurried: 1.25,
};

/**
 * The band for one piece: platform, channel and the format's pace together.
 *
 * The pace scales the target but only *narrows* toward the floor and ceiling —
 * an unhurried format on TikTok gets a longer target and the same hard ceiling,
 * because the ceiling is the platform's fact and not the format's preference.
 */
export function bandFor(
  platform: string,
  channel: ChannelId,
  pace: Pace = 'standard',
): LengthBand | null {
  const base = LENGTH_BANDS[platform]?.[channel];
  if (!base) return null;
  const scaled = base.targetSeconds * PACE_FACTORS[pace];
  return {
    ...base,
    targetSeconds: Number(
      Math.min(base.ceilingSeconds, Math.max(base.floorSeconds, scaled)).toFixed(1),
    ),
  };
}

/*
 * ── The arithmetic ─────────────────────────────────────────────────────────
 *
 * Restated from `@halyard/render`'s `quiz.tsx` and `formatVideo.ts` rather than
 * imported, because gotcha 10: that bundle is webpacked for the browser by
 * Remotion and a Node-only import anywhere it can reach fails at render time
 * with `UnhandledSchemeError`, having typechecked and passed every test.
 *
 * A duplicated constant is exactly the failure gotcha 1 describes, so it is
 * guarded the same way `handlerCoverage.test.ts` guards `JOB_KINDS`: a test in
 * the render package asserts the two implementations agree, across a corpus
 * wide enough to catch a changed constant. See `lengthAgreement.test.ts`.
 */

/** Words per second of synthesised speech, measured. */
export const WORDS_PER_SECOND = 2.6;

/**
 * How long a line takes to say.
 *
 * The floor carries headroom because synthesis is not deterministic: the same
 * four digits measured 1.49s on one run and 1.85s on the next, and an overrun
 * is two voices at once.
 */
export function spokenSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.max(2.0, Number((words / WORDS_PER_SECOND + 0.55).toFixed(2)));
}

/** How long a beat holds: the line said, plus a breath after it. */
export function readSeconds(text: string): number {
  return Math.max(2.2, Number((spokenSeconds(text) + 0.5).toFixed(2)));
}

/**
 * What a set of lines will render to, before rendering it.
 *
 * The same sum `narrativeFrom` performs, so a piece can be measured while it is
 * still text — which is the whole point, because a render costs minutes and
 * this costs nothing.
 */
export function predictSeconds(lines: string[]): number {
  return Number(
    lines
      .filter((line) => line.trim().length > 0)
      .reduce((total, line) => total + readSeconds(line), 0)
      .toFixed(2),
  );
}

/**
 * Words that fit in a duration, across a given number of lines.
 *
 * `predictSeconds` inverted. Each line costs `words/2.6 + 1.05` seconds, so
 * `lineCount` lines cost `1.05·n` before a single word is written — which is
 * why cutting a line buys more than shortening every line.
 */
export function budgetWords(seconds: number, lineCount: number): number {
  if (lineCount <= 0) return 0;
  const overhead = lineCount * (0.55 + 0.5);
  return Math.max(0, Math.round((seconds - overhead) * WORDS_PER_SECOND));
}

/*
 * ── The budget ─────────────────────────────────────────────────────────────
 */

/** What one slot gets, on this platform, for this piece. */
export interface SlotBudget {
  key: string;
  /** How many of this slot the piece has. May be below the format's maximum. */
  repeats: number;
  /** The word ceiling for this piece, at or below the format's own. */
  maxWords: number;
}

export interface FormatBudget {
  band: LengthBand;
  slots: SlotBudget[];
  /** What the piece will run if every slot is written to its budget. */
  predictedSeconds: number;
  /**
   * Repeating slots reduced to fit, and by how much.
   *
   * Surfaced rather than applied silently: an operator who can see "quiz cut to
   * three questions, the budget was 32s and five would run 53" understands the
   * piece. One that is quietly shorter does not earn that.
   */
  reduced: Array<{ key: string; from: number; to: number }>;
  /**
   * True when even the minimum structure overruns the ceiling.
   *
   * Not an error here — this function does arithmetic, it does not decide
   * policy. The caller decides whether to refuse the pairing or accept a long
   * piece, and `docs/DIRECTION_SPEC.md` Part 1 says refuse.
   */
  overruns: boolean;
  /**
   * True when the budgeted structure lands at or under the target.
   *
   * Distinct from `overruns`, and the more common signal. A format whose word
   * floors cost more than the target affords still fits under the ceiling — an
   * Instagram quiz costs 32 seconds against a 26-second target and a 45-second
   * ceiling. That is worth telling an operator and is not worth refusing: the
   * ceiling is where distribution breaks, the target is where it is best.
   */
  meetsTarget: boolean;
}

/**
 * The floor below which a slot stops being the thing it is.
 *
 * 30% rather than something more generous, and the reason is the whole model:
 * if the floor binds at every structure, cutting a question buys a *shorter
 * piece* instead of *longer questions*, and the piece gets thinner rather than
 * sharper. The floor exists to stop a four-word quiz answer, not to protect the
 * ceilings — which is what `maxWords` is already for.
 */
export function minWordsFor(slot: { maxWords: number; minWords?: number }): number {
  if (typeof slot.minWords === 'number') return slot.minWords;
  return Math.max(3, Math.round(slot.maxWords * 0.3));
}

/**
 * Fit a format to a band.
 *
 * ## Why the structure flexes and not only the wording
 *
 * A 32-second TikTok quiz with five questions has twelve lines, which costs
 * 12.6 seconds of per-line overhead before a word is written, leaving 66 words
 * across a structure whose ceilings total 180 — a scale of 0.37, so five-word
 * questions and seven-word answers. That is not a quiz, it is a word game.
 *
 * Cut to three questions and the same 32 seconds buys 72 words across a
 * structure totalling 116: a scale of 0.62, nine-word questions, eleven-word
 * answers. **Shorter and sharper rather than shorter and truncated.**
 *
 * So the search is over structures, not over wordings: take the largest repeat
 * count whose scaled slots all clear their own floors. On YouTube Shorts the
 * same quiz keeps five questions, because 48 seconds affords them.
 */
export function lengthBudgetFor(format: PostFormat, band: LengthBand): FormatBudget {
  const maxima = format.slots.map((slot) => ({
    key: slot.key,
    max: slot.repeats ?? 1,
    min: Math.min(slot.repeats ?? 1, slot.repeatsMin ?? slot.repeats ?? 1),
    maxWords: slot.maxWords,
    minWords: minWordsFor(slot),
  }));

  /*
   * Reduce the repeating slots together rather than one at a time: a format
   * with questions and answers must drop them in step, or the fourth question
   * loses its reveal. Formats express that by giving both slots the same
   * `repeats` and `repeatsMin`, which is already how the catalogue reads.
   */
  const maxSteps = Math.max(0, ...maxima.map((s) => s.max - s.min));

  let best: { step: number; slots: SlotBudget[]; seconds: number } | null = null;

  for (let step = 0; step <= maxSteps; step += 1) {
    const counts = maxima.map((s) => ({ ...s, repeats: Math.max(s.min, s.max - step) }));
    const lineCount = counts.reduce((n, s) => n + s.repeats, 0);
    const words = budgetWords(band.targetSeconds, lineCount);
    const weight = counts.reduce((n, s) => n + s.repeats * s.maxWords, 0);
    if (weight === 0) break;

    const scale = Math.min(1, words / weight);
    const slots: SlotBudget[] = counts.map((s) => ({
      key: s.key,
      repeats: s.repeats,
      maxWords: Math.max(s.minWords, Math.min(s.maxWords, Math.round(s.maxWords * scale))),
    }));

    /*
     * What it actually costs once the floors are applied. A slot held up by its
     * floor costs more than the scale suggested, so this is measured rather
     * than assumed — the arithmetic that decides whether to cut another
     * question must be the arithmetic the renderer will perform.
     */
    const seconds = Number(
      slots
        .reduce((total, s) => total + s.repeats * (s.maxWords / WORDS_PER_SECOND + 1.05), 0)
        .toFixed(2),
    );

    best = { step, slots, seconds };
    /*
     * Built to the *target*, not merely under the ceiling. Stopping at the
     * ceiling keeps the largest structure that is technically legal, which for
     * a TikTok quiz is five questions at 47 seconds against a 32-second target
     * — inside the bound and well outside the band that performs. The ceiling
     * is where distribution breaks; the target is what the piece is for.
     */
    if (seconds <= band.targetSeconds) break;
  }

  /* A format with no slots at all. Nothing to budget; say so honestly. */
  if (!best) {
    return {
      band,
      slots: [],
      predictedSeconds: 0,
      reduced: [],
      overruns: false,
      meetsTarget: true,
    };
  }

  const reduced = maxima
    .map((s) => {
      const got = best.slots.find((b) => b.key === s.key);
      return got && got.repeats < s.max ? { key: s.key, from: s.max, to: got.repeats } : null;
    })
    .filter((r): r is { key: string; from: number; to: number } => r !== null);

  return {
    band,
    slots: best.slots,
    predictedSeconds: best.seconds,
    reduced,
    overruns: best.seconds > band.ceilingSeconds,
    meetsTarget: best.seconds <= band.targetSeconds,
  };
}
