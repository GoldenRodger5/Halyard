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
/**
 * §439. Exported under a test-only name so `lengthAgreement.test.ts` can hold
 * it against `@halyard/core`'s copy. The two must not drift, and they cannot be
 * one function — gotcha 10 explains why in that test's header.
 */
export function secondsToReadForTest(text: string): number {
  return secondsToRead(text);
}

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
/**
 * §417. A long line arrives in parts rather than sitting whole.
 *
 * `HALYARD_AGENTIC_SOCIAL_TEAM_SPEC` §11.4 asks for "short text moments" and
 * the "removal of dead air", and explicitly says to optimise for attention
 * "without blindly forcing a fixed cut rate". So this is not chasing the
 * pacing gate's number — it is the thing the number was measuring badly.
 *
 * A thirteen-word sentence held for five seconds is one long text moment. Said
 * aloud it is fine; read, it is finished in two seconds and then sits there.
 * Splitting it at a clause boundary gives the same audio two visual moments,
 * which is how short-form has always handled a sentence.
 *
 * Returns the parts, or a single-element array when the line is short enough or
 * has no honest place to break. Never splits mid-clause: a break that lands
 * between "temperatures just" and "above freezing" is worse than no break.
 */
export function splitLongLine(text: string, seconds: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  /*
   * Both conditions, because either alone is wrong. A long line that is spoken
   * quickly does not sit; a short line held a long time is a deliberate beat.
   */
  if (words.length < 10 || seconds < 3) return [text];

  /*
   * Clause boundaries — and a comma is only one when a clause follows it.
   *
   * The first version broke at any comma, and a comma is also what separates
   * two adjectives. Rendered and read: "it regulates yeast for a slow," /
   * "steady rise, while strengthening gluten" — the break landed inside the
   * noun phrase "a slow, steady rise", so the first card ended on a dangling
   * adjective and the second opened on one. §417 said "never breaks
   * mid-clause" and this is exactly mid-clause.
   *
   * A clause needs something to start it. Requiring the next word to be a
   * conjunction, a pronoun or a determiner is a small list and it is the honest
   * test: "steady" cannot begin a clause, "and that small amount" can. Anything
   * this rejects simply stays one card, which is the safe direction.
   */
  const STARTS_A_CLAUSE = new Set([
    'and', 'but', 'so', 'or', 'yet', 'because', 'which', 'while', 'then', 'though',
    'it', 'they', 'we', 'you', 'he', 'she', 'this', 'that', 'these', 'those',
    'there', 'here', 'the', 'a', 'an', 'its', 'their', 'your',
  ]);

  const breaks: number[] = [];
  const re = /[,;:]\s+|\s+(?:but|and then|so that|because|which|while)\s+/gi;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const at = m.index + (/^[,;:]/.test(m[0]) ? 1 : 0);
    /*
     * A semicolon or colon always ends a clause; only a comma is ambiguous.
     * The conjunction alternatives carry their own clause opener already.
     */
    if (m[0].startsWith(',')) {
      const next = text.slice(m.index + m[0].length).trim().split(/\s+/)[0] ?? '';
      const bare = next.toLowerCase().replace(/[^a-z']/g, '');
      if (!STARTS_A_CLAUSE.has(bare)) continue;
    }
    breaks.push(at);
  }
  if (breaks.length === 0) return [text];

  /* The one nearest the middle, so neither part is a fragment. */
  const middle = text.length / 2;
  const at = breaks.reduce((best, b) => (Math.abs(b - middle) < Math.abs(best - middle) ? b : best));

  const head = text.slice(0, at).trim();
  const tail = text.slice(at).trim().replace(/^(?:but|and then|so that|because|which|while)\s+/i, (w) => w);
  /* A part shorter than three words is a fragment, not a moment. */
  if (head.split(/\s+/).length < 3 || tail.split(/\s+/).length < 3) return [text];
  return [head, tail];
}

function narrativeFrom(
  lines: Array<{ role: BeatRole; text: string; kicker?: string | null; source?: string | null }>,
): FormatVideo | null {
  const usable = lines.filter((l) => l.text.trim().length > 0);
  if (usable.length === 0) return null;

  /*
   * §416. Which beat the piece exists for.
   *
   * `creative.no_payoff` fires when no beat is held — "a plan where every beat
   * carries equal weight lands on nothing" — and it is an error, so it failed
   * every format video. Nothing here ever set `emphasis`, so nothing was ever
   * held: the gate was correct and the builder had simply never answered it.
   *
   * The payoff if there is one, else the turn. That is the editorial answer as
   * well as the mechanical one — a history lands on why it still matters, and a
   * myth-buster lands on the correction, which is its `turn`.
   */
  const heldRole = usable.some((l) => l.role === 'payoff')
    ? 'payoff'
    : usable.some((l) => l.role === 'turn')
      ? 'turn'
      : null;
  let held = false;

  const beats: NarrativeBeat[] = [];
  const narration: NarrationLine[] = [];
  let at = 0;
  for (const line of usable) {
    const seconds = secondsToRead(line.text);
    /* Only the first, so a format with two payoffs still lands once. */
    const isHeld = !held && line.role === heldRole;
    if (isHeld) held = true;

    /*
     * §417. The parts share the line's time in proportion to their length, and
     * share one photograph: the picture holds while the sentence completes,
     * which is what makes the second part read as the same thought continuing
     * rather than a new one starting.
     */
    const parts = splitLongLine(line.text.trim(), seconds);
    const chars = parts.reduce((n, part) => n + part.length, 0);
    const group = beats.length;

    parts.forEach((part, i) => {
      beats.push({
        role: line.role,
        text: part,
        /* The kicker introduces the line, so it belongs to the first part. */
        kicker: i === 0 ? (line.kicker ?? null) : null,
        /* The citation closes it, so it belongs to the last. */
        source: i === parts.length - 1 ? (line.source ?? null) : null,
        seconds: Number(((seconds * part.length) / chars).toFixed(2)),
        emphasis: isHeld && i === parts.length - 1 ? 'hold' : line.role === 'hook' ? 'quick' : 'normal',
        photographGroup: group,
      });
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
  /**
   * §408. A choice, laid out as a choice.
   *
   * The question opens it, each option gets its own beat so the two are read in
   * sequence rather than scanned as a block, and the verdict is the payoff —
   * which is the only beat that does what the format promises. `Versus` and
   * `This one` are the kickers because the reader's job changes at each: first
   * weigh, then decide.
   */
  comparison(slots) {
    return narrativeFrom([
      { role: 'hook', text: pick(slots, 'question') ?? '' },
      { role: 'setup', text: pick(slots, 'option_a') ?? '', kicker: 'Option A' },
      { role: 'detail', text: pick(slots, 'option_b') ?? '', kicker: 'Versus' },
      { role: 'payoff', text: pick(slots, 'verdict') ?? '', kicker: 'This one' },
    ]);
  },

  /**
   * §408. An either/or, and deliberately no answer.
   *
   * A poll ends on the two sides rather than resolving, because the resolution
   * is the comment section — that is the whole mechanic, and a beat that
   * settled it would remove the reason to reply. So there is no `payoff` role
   * here, which is a real difference from `comparison` and not an omission.
   */
  poll(slots) {
    return narrativeFrom([
      { role: 'hook', text: pick(slots, 'question') ?? '' },
      { role: 'setup', text: pick(slots, 'option_a') ?? '', kicker: 'One' },
      { role: 'detail', text: pick(slots, 'option_b') ?? '', kicker: 'Or' },
    ]);
  },

  /**
   * §408. Two beats, and the second is the one that earns it.
   *
   * `moment` states what is happening and `aside` is the remark a person would
   * actually make about it. Kept to two: a behind-the-scenes note that runs
   * long stops being an aside and becomes an explanation, which is the register
   * this format exists to avoid.
   */
  behind(slots) {
    const aside = pick(slots, 'aside');
    return narrativeFrom([
      { role: 'hook', text: pick(slots, 'moment') ?? '' },
      ...(aside ? [{ role: 'payoff' as BeatRole, text: aside, kicker: 'Honestly' }] : []),
    ]);
  },

  myth_fact(slots) {
    const source = pick(slots, 'source');
    const partly = pick(slots, 'partly_true');
    return narrativeFrom([
      { role: 'hook', text: pick(slots, 'myth') ?? '', kicker: 'Myth' },
      ...(partly ? [{ role: 'setup' as BeatRole, text: partly, kicker: 'Partly true' }] : []),
      { role: 'turn', text: pick(slots, 'correction') ?? '', kicker: 'Actually', source },
    ]);
  },

  /**
   * §318. The product being used, with the words as a frame around it.
   *
   * `props.screenSrc` and `props.callouts` are filled by the worker from the
   * capture (§303) — this cannot know what was recorded, and inventing a
   * `screenSrc` here would produce a composition confidently referencing
   * footage that does not exist.
   *
   * The read is short by design. The recording is the claim; a narrator
   * explaining a demonstration that already speaks for itself is the thing
   * that makes a product video feel like an ad.
   */
  walkthrough(slots) {
    const title = pick(slots, 'title');
    if (!title) return null;

    const why = pick(slots, 'why');
    const close = pick(slots, 'close');

    const narration: NarrationLine[] = [{ atSeconds: 0.4, text: title }];
    if (why) narration.push({ atSeconds: 0.4 + spokenSeconds(title) + 0.4, text: why });

    return {
      compositionId: 'Walkthrough',
      props: { headline: title },
      /*
       * The close is placed by the worker, which is the only thing that knows
       * how long the footage runs — a sign-off at a guessed second lands in the
       * middle of the demonstration.
       */
      narration: close ? [...narration, { atSeconds: -1, text: close }] : narration,
    };
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
