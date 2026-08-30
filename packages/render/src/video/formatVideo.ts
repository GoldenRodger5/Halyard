/**
 * §304. Turning a filled format into a video.
 *
 * §280 mapped a filled format onto carousel slides, and that is where the whole
 * format family stopped. The video path never consulted the format at all: it
 * called `chooseVideoComposition(artifact, …)`, which picks from three
 * compositions all derived from a product artifact, so every Remotion render
 * ever made in production is a `TransformationDiff`.
 *
 * `quiz` declares `channels: ['short_video']` and nothing else. So the quiz
 * format — the catalogue entry, the writer, the question planner (§300), the
 * five treatments (§302) — **has never produced a single piece**. Every part
 * connected to the next one and the chain was not attached to anything.
 *
 * This is the carousel path's twin, deliberately: slot text in, composition and
 * props out. A format with no video builder returns null and the caller refuses
 * the piece loudly, exactly as `slidesForFormat` returning `[]` does. A quiz
 * that quietly becomes a transformation post is worse than no post — it is the
 * format system appearing to work while doing nothing, which is the failure
 * this whole section exists to make impossible.
 *
 * Plain data in, plain data out, and it imports nothing from `@halyard/core`.
 * Gotcha 10: this package is webpacked for the browser by Remotion.
 */
import type { SlotValue } from '../image/formatSlides.js';
import type { BeatRole, NarrativeBeat } from './narrative.js';
import {
  QUIZ_COUNTDOWN_SECONDS,
  QUIZ_QUESTION_SECONDS,
  asideGapFor,
  revealSecondsFor,
  spokenSeconds,
  titleSecondsFor,
} from './quiz.js';

export interface FormatVideo {
  /** A composition id registered in `video/root.tsx`. */
  compositionId: string;
  props: Record<string, unknown>;
  /**
   * §306. What is said, and when, in the piece's own timeline.
   *
   * A quiz had no voice, and the obvious fix — send the caption to
   * `writeVoScript` — is the wrong one: the caption is written for a feed and
   * the video is a quiz, so the narrator would be talking about something other
   * than what is on screen. That is worse than silence.
   *
   * So the read is assembled from the **same slots the video is built from**.
   * The words are already written and already gated (§282); turning them into a
   * read is mechanical, and mechanical is where this system does the work
   * itself rather than asking a model. It also makes a whole class of mistake
   * impossible: the voice cannot say "1928" while the screen fills "1728".
   */
  narration: NarrationLine[];
}

/** One thing said, at the second the composition puts it on screen. */
export interface NarrationLine {
  atSeconds: number;
  text: string;
}

function pick(slots: SlotValue[], key: string, index = 0): string | null {
  return slots.find((s) => s.key === key && s.index === index)?.text ?? null;
}

function all(slots: SlotValue[], key: string): SlotValue[] {
  return slots.filter((s) => s.key === key).sort((a, b) => a.index - b.index);
}

/**
 * An answer as the writer filled it: the answer, then a clause of why.
 *
 * The slot brief asks for both in one line, because a viewer needs the payoff
 * and the reason together. The composition needs them apart — the answer is
 * what fills the right option, and the clause is not an option, it is a remark.
 *
 * Split on the first sentence boundary, and when there is none the whole line
 * is the answer. Never guessing at a split that is not marked: a wrong split
 * puts half a sentence in an option and is worse than a long option.
 */
function splitAnswer(line: string): { answer: string; aside: string | null } {
  const match = line.match(/^(.+?[.!?])\s+(.+)$/);
  if (!match) return { answer: line.trim(), aside: null };
  return { answer: match[1]!.trim().replace(/[.]$/, ''), aside: match[2]!.trim() };
}

/**
 * Options for a question, when the writer produced them.
 *
 * The catalogue's `question` slot asks for a question and not for options, so
 * most quizzes arrive without any. Rather than inventing distractors here —
 * which would be a model's job done by a regex, and wrong in the way that puts
 * two right answers on screen — a question with no options is drawn by the
 * `spotlight` treatment, which shows no options and is honest about it.
 *
 * A writer that *does* supply options separates them with a pipe, and the
 * answer must be one of them or the question is dropped: `checkQuestion`
 * (§300) states that rule and this is where it is enforced at render time.
 */
function optionsFor(
  raw: string | null,
  answer: string,
): { options: string[]; correctIndex: number } | null {
  if (!raw) return null;
  const options = raw
    .split('|')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  if (options.length < 2) return null;

  const normalised = answer.trim().toLowerCase();
  const correctIndex = options.findIndex((o) => {
    const option = o.trim().toLowerCase();
    return option === normalised || option.includes(normalised) || normalised.includes(option);
  });
  /*
   * The answer is not among its own options. Dropping the options is right and
   * dropping the question is not: the question and answer are still true, and
   * only the choice was mis-written.
   */
  if (correctIndex === -1) return null;
  return { options, correctIndex };
}


/**
 * §308. How long a line needs to be read aloud.
 *
 * Speech runs about 2.6 words a second at the pace short-form is read at, plus
 * a beat to land. Derived rather than fixed, because a fixed beat length makes
 * a four-word hook drag and cuts a twenty-word setup off mid-sentence — and the
 * narration is placed on this same clock, so a wrong estimate here is a voice
 * out of step with the picture rather than merely an odd rhythm.
 *
 * Floored at 2.2s: below that a beat reads as a flicker however few words it
 * has, and a viewer who cannot finish reading a line has not received it.
 */
function secondsToRead(text: string): number {
  /* §312. The same speech model the quiz uses, plus a moment to land. */
  return Math.max(2.2, Number((spokenSeconds(text) + 0.5).toFixed(2)));
}

/**
 * Beats and the read, from one list of lines.
 *
 * Built together so they cannot disagree. The narration timestamps are the
 * running sum of the beat durations — the same numbers the composition lays out
 * with — so a line is spoken exactly while its own beat is on screen.
 */
function narrativeFrom(
  lines: Array<{ role: BeatRole; text: string; kicker?: string | null; source?: string | null }>,
): FormatVideo | null {
  const usable = lines.filter((l) => l.text.trim().length > 0);
  if (usable.length === 0) return null;

  const beats: NarrativeBeat[] = [];
  const narration: NarrationLine[] = [];
  let at = 0;
  for (const line of usable) {
    const seconds = secondsToRead(line.text);
    beats.push({
      role: line.role,
      text: line.text.trim(),
      kicker: line.kicker ?? null,
      source: line.source ?? null,
      seconds,
    });
    /*
     * A short lead-in so the line is on screen before it is spoken. A narrator
     * who starts on the same frame the type appears reads as a caption being
     * dictated; a beat behind reads as someone talking over a picture.
     */
    narration.push({ atSeconds: Number((at + 0.25).toFixed(2)), text: line.text.trim() });
    at += seconds;
  }

  return { compositionId: 'Narrative', props: { beats }, narration };
}

const BUILDERS: Record<string, (slots: SlotValue[]) => FormatVideo | null> = {
  quiz(slots) {
    const questions = all(slots, 'question');
    const answers = all(slots, 'answer');
    if (questions.length === 0) return null;

    const items = questions
      .map((question) => {
        const answerSlot = answers.find((a) => a.index === question.index);
        if (!answerSlot) return null;
        const { answer, aside } = splitAnswer(answerSlot.text);
        const choice = optionsFor(pick(slots, 'options', question.index), answer);
        return {
          question: question.text,
          answer,
          /*
           * §306. The citation and the extra fact are different things and were
           * briefly the same field. The answer slot asks for "the answer, then
           * one clause of why it is interesting", and that clause was being put
           * into `source` — so a genuinely interesting fact rendered as
           * "Source: Beccari separated it from wheat flour", which is not a
           * citation and reads as a mistake.
           *
           * `source` is the citation the writer fetched and read (§282).
           * `aside` is the payoff after the payoff: the answer lands, then one
           * more line that makes it worth having watched.
           */
          source: question.citation ?? answerSlot.citation ?? null,
          aside,
          ...(choice ? { options: choice.options, correctIndex: choice.correctIndex } : {}),
        };
      })
      .filter((q): q is NonNullable<typeof q> => q !== null);

    if (items.length === 0) return null;

    const title = pick(slots, 'title') ?? 'How well do you know this?';

    /*
     * §306. The read, on the composition's own clock.
     *
     * Each question occupies `QUIZ_QUESTION_SECONDS` of reading time, then the
     * countdown, then the reveal. The question is spoken as it appears; the
     * answer is spoken *as the reveal lands*, not before, because a narrator
     * who answers during the countdown has removed the only thing the viewer
     * was doing. The aside follows a beat later, which is the same rhythm the
     * screen uses.
     *
     * Derived from the same constants the composition lays out with, so the two
     * cannot drift — a voice track written against a guessed timeline is a
     * voice track that goes out of sync the first time a beat changes.
     */
    const narration: NarrationLine[] = [{ atSeconds: 0.2, text: title }];
    /*
     * §312. The running clock, not a fixed grid. Each reveal is as long as its
     * own content needs, so a beat begins where the previous one ended — and
     * the read is placed on exactly the numbers the composition lays out with.
     * A grid here is what put question one's aside 1.9 seconds into question
     * two: the words were still being spoken over a card that had changed.
     */
    let beat = titleSecondsFor(title);
    items.forEach((item) => {
      narration.push({ atSeconds: Number((beat + 0.15).toFixed(2)), text: item.question });
      const revealAt = beat + QUIZ_QUESTION_SECONDS + QUIZ_COUNTDOWN_SECONDS;
      narration.push({ atSeconds: Number((revealAt + 0.1).toFixed(2)), text: item.answer });
      const reveal = revealSecondsFor(item);
      if (item.aside) {
        /*
         * After the answer has landed. `revealSecondsFor` sized this beat to
         * fit both, so there is room rather than a hope that there is.
         */
        narration.push({
          atSeconds: Number((revealAt + 0.1 + asideGapFor(item.answer)).toFixed(2)),
          text: item.aside,
        });
      }
      beat = revealAt + reveal;
    });

    const close = pick(slots, 'close');
    if (close) {
      /* Over the tail of the last reveal, which is where a sign-off belongs. */
      narration.push({ atSeconds: Number((beat - 0.9).toFixed(2)), text: close });
    }

    return {
      compositionId: 'Quiz',
      props: { title, questions: items },
      narration,
    };
  },


  /**
   * A story with a turn. The turn is the beat the whole piece exists for, so it
   * gets a treatment that lands and the beats around it stay out of its way.
   */
  history(slots) {
    const source = pick(slots, 'source');
    return narrativeFrom([
      { role: 'hook', text: pick(slots, 'hook') ?? '' },
      { role: 'setup', text: pick(slots, 'setup') ?? '' },
      { role: 'turn', text: pick(slots, 'turn') ?? '', kicker: 'And then' },
      { role: 'payoff', text: pick(slots, 'why_it_matters') ?? '', source },
    ]);
  },

  /**
   * A numbered list. The number *is* the kicker, which is why `label_lead`
   * exists — a tip whose number is set small throws away the thing a viewer
   * uses to keep their place.
   */
  tips(slots) {
    const tips = all(slots, 'tip');
    return narrativeFrom([
      { role: 'hook', text: pick(slots, 'title') ?? '' },
      ...tips.map((tip, i) => ({
        role: 'detail' as BeatRole,
        text: tip.text,
        kicker: String(i + 1),
      })),
      { role: 'close', text: pick(slots, 'close') ?? '' },
    ]);
  },

  /**
   * The correction is the payoff and the myth is the setup, and stating the
   * myth without immediately labelling it as one is how a myth post spreads the
   * myth. So the kicker does the work: "Myth" before the claim, every time.
   */
  myth_fact(slots) {
    const source = pick(slots, 'source');
    const partly = pick(slots, 'partly_true');
    return narrativeFrom([
      { role: 'hook', text: pick(slots, 'myth') ?? '', kicker: 'Myth' },
      ...(partly ? [{ role: 'setup' as BeatRole, text: partly, kicker: 'Partly true' }] : []),
      { role: 'turn', text: pick(slots, 'correction') ?? '', kicker: 'Actually', source },
    ]);
  },

  /** Where a thing came from, what changed, where it is now. */
  origin(slots) {
    const source = pick(slots, 'source');
    return narrativeFrom([
      { role: 'hook', text: pick(slots, 'hook') ?? '' },
      { role: 'setup', text: pick(slots, 'before') ?? '', kicker: 'Before' },
      { role: 'turn', text: pick(slots, 'change') ?? '', kicker: 'What changed' },
      { role: 'payoff', text: pick(slots, 'now') ?? '', kicker: 'Now', source },
    ]);
  },
};

/**
 * The composition and props for a filled format, or null when it has none.
 *
 * Null is a refusal, not a fallback. The caller must not substitute the
 * artifact-driven path: that is how a quiz becomes a transformation post and
 * nobody finds out.
 */
export function videoForFormat(formatId: string, slots: SlotValue[]): FormatVideo | null {
  const build = BUILDERS[formatId];
  if (!build) return null;
  return build(slots);
}

/** Which formats have a video composition. Asserted against the catalogue. */
export const VIDEO_FORMATS = Object.keys(BUILDERS);
