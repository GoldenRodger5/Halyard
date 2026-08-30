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

export interface FormatVideo {
  /** A composition id registered in `video/root.tsx`. */
  compositionId: string;
  props: Record<string, unknown>;
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
           * The citation the writer fetched and read (§282), shown small under
           * the reveal. Null rather than absent, so a question with no source
           * is visibly unsourced rather than quietly indistinguishable.
           */
          source: question.citation ?? answerSlot.citation ?? aside ?? null,
          ...(choice ? { options: choice.options, correctIndex: choice.correctIndex } : {}),
        };
      })
      .filter((q): q is NonNullable<typeof q> => q !== null);

    if (items.length === 0) return null;

    return {
      compositionId: 'Quiz',
      props: {
        title: pick(slots, 'title') ?? 'How well do you know this?',
        questions: items,
      },
    };
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
