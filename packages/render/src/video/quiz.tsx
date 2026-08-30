/**
 * §289. The quiz, as a video — question, countdown, reveal.
 *
 * A quiz rendered as a carousel is a list of questions with the answers on the
 * next card. That works, and it is not what makes the format land. The thing
 * that makes it land is **the pause**: a question, a beat where the viewer
 * commits to an answer, and then the reveal. A carousel cannot enforce a pause,
 * because the reader controls the swipe. A video can, because it controls time.
 *
 * That is the whole argument for this composition existing rather than reusing
 * the carousel: the format's mechanism is temporal, so the render has to be.
 *
 * ## The shape of one question
 *
 *   question appears  →  countdown 3, 2, 1  →  answer, with its source
 *   ├─ 0.4s in         ├─ 3s exactly         ├─ held long enough to read
 *
 * The countdown is the format. Three seconds is short enough to keep pace and
 * long enough to think, and it is a visible commitment device: a viewer who has
 * silently answered is invested in seeing whether they were right, which is the
 * open loop that carries them to the next question.
 *
 * ## Why the answer holds
 *
 * The reveal is the payoff and the most-screenshotted frame in the format, so it
 * is held rather than cut. The source line sits under it, small — quiet enough
 * not to compete, present enough to be checkable, because §282 fetched it and
 * a citation nobody can see is a citation that did no work.
 */
import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { BrandTokens } from '../brand.js';
import type { RenderTypography } from '../image/templates.js';
import {
  QUIZ_TEMPLATE_COMPONENTS,
  chooseQuizTemplate,
  quizPalette,
  useQuizProgress,
  type QuizPalette,
  type QuizTemplateId,
} from './quizTemplates.js';

export interface QuizQuestion {
  question: string;
  answer: string;
  /** Fetched and verified upstream (§282). Shown small under the answer. */
  source?: string | null;
  /**
   * §294. Multiple choice, when the question has clean options.
   *
   * A free-form question asks a viewer to *recall*; multiple choice asks them
   * to *choose*, which is a far lower bar and the reason the format works in a
   * feed — a viewer who has picked B is committed, and commitment is what makes
   * them stay for the reveal. Absent means free-form, which suits a question
   * whose answer is a number or a name.
   */
  options?: string[];
  /** Index into `options` of the right one. */
  correctIndex?: number;
  /**
   * §306. One more line, after the answer has landed.
   *
   * "1728" is the answer; "Beccari separated wheat into starch and a stretchy
   * residue" is the reason anyone remembers it. A quiz that only reveals the
   * answer gives a viewer nothing to repeat, and repeating it is the whole
   * reason a quiz gets shared.
   *
   * Arrives *after* the answer rather than with it, so the reveal is still a
   * single beat and the fact is a second one.
   */
  aside?: string | null;
}

export interface QuizVideoProps {
  brand: BrandTokens;
  /**
   * §294. A photograph behind the whole piece, as a data URI.
   *
   * The first version was type on cream and read as a PDF rather than a Reel:
   * the type filled about a sixth of the frame and the rest was empty. A feed
   * is a wall of photographs and video, and a flat card loses to all of it
   * before a word is read.
   *
   * Full-bleed with a heavy scrim, so the type stays legible over an image
   * nobody has checked the contrast of.
   */
  backgroundDataUri?: string;
  typography?: RenderTypography;
  title: string;
  questions: QuizQuestion[];
  /** How long a viewer gets to commit. Three seconds is the format. */
  countdownSeconds?: number;
  /**
   * §312. Removed as a prop: each reveal is now as long as its own content
   * needs. A single value for the whole piece could not hold both a one-word
   * answer and an answer plus the fact that follows it, and the piece was sized
   * by whichever the caller guessed.
   */
  audioSrc?: string;
  wordmark?: string;
}

export const QUIZ_TITLE_SECONDS = 1.8;
export const QUIZ_QUESTION_SECONDS = 1.6;
export const QUIZ_COUNTDOWN_SECONDS = 3;
export const QUIZ_REVEAL_SECONDS = 2.6;

/** One question's total screen time, so the caller can size the composition. */
export function secondsPerQuestion(
  countdown = QUIZ_COUNTDOWN_SECONDS,
  reveal = QUIZ_REVEAL_SECONDS,
): number {
  return QUIZ_QUESTION_SECONDS + countdown + reveal;
}

/**
 * §312. How long *this* question's reveal needs to hold.
 *
 * A flat 2.6s was right when the reveal was one word. §306 added the aside —
 * the fact that makes an answer worth repeating — and a fact takes about four
 * seconds to say. The narration is placed on this clock, so the aside for
 * question one was still being spoken 1.9s into question two: two voices'
 * worth of words over a card that had already changed.
 *
 * Derived from what the reveal actually contains, the same way §308 derives a
 * narrative beat. Speech runs about 2.6 words a second at this pace, plus a
 * moment to land before the next question starts.
 *
 * The floor is the old constant, so a bare answer is paced exactly as before
 * and nothing that already worked changes length.
 */
/**
 * §312. How long a line takes to say aloud.
 *
 * One model, shared by everything that sizes a beat, so the picture and the
 * read cannot disagree about how long a sentence is.
 *
 * **The floor is the part that matters.** Words-per-second alone said "1728"
 * would take 0.4s; ElevenLabs says "seventeen twenty-eight" in 1.49s, and the
 * aside placed 0.9s later began while the answer was still being spoken. Any
 * short line — a year, a name, "True" — is slower per word than a sentence,
 * because the pace is set by syllables and by the pause a reader leaves after
 * a fragment. Measured against real synthesis rather than assumed.
 */
export function spokenSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.max(1.55, Number((words / 2.6 + 0.55).toFixed(2)));
}

export function titleSecondsFor(title: string): number {
  /*
   * §312. The opening card holds for as long as its own line takes to say.
   * `QUIZ_TITLE_SECONDS` was 1.8s and "How well do you know gluten?" takes
   * about 2.5s, so the title was still being spoken over the first question.
   * The constant is the floor, so a two-word title is paced as before.
   */
  return Math.max(QUIZ_TITLE_SECONDS, Number((spokenSeconds(title) + 0.35).toFixed(2)));
}

export function revealSecondsFor(item: { answer: string; aside?: string | null }): number {
  /*
   * The answer, then the gap before the aside, then the aside, then a moment
   * to land. Summed as separate lines rather than as one long one, because two
   * short lines are slower than one line of the same total length — which is
   * exactly the floor `spokenSeconds` exists to model.
   */
  const answer = spokenSeconds(item.answer);
  const aside = item.aside ? ASIDE_GAP_SECONDS + spokenSeconds(item.aside) : 0;
  return Math.max(QUIZ_REVEAL_SECONDS, Number((answer + aside + 0.6).toFixed(2)));
}

/**
 * §312. The gap between the answer and the fact that follows it.
 *
 * Long enough that the answer has finished — a short answer still takes about
 * 1.5s — and short enough that the two read as one thought rather than two.
 */
export const ASIDE_GAP_SECONDS = 1.7;

/**
 * Total runtime for a quiz.
 *
 * Exported because the render row's `durationInFrames` is decided before the
 * component runs, and a composition whose length does not match its content
 * either clips the last answer or ends on dead air — both of which look like a
 * bug rather than an edit.
 */
export function quizDurationSeconds(
  questionCount: number,
  countdown = QUIZ_COUNTDOWN_SECONDS,
  reveal = QUIZ_REVEAL_SECONDS,
): number {
  return QUIZ_TITLE_SECONDS + questionCount * secondsPerQuestion(countdown, reveal);
}

/**
 * §312. The runtime of a specific quiz, where each reveal is as long as it needs.
 *
 * `quizDurationSeconds` multiplies one length by a count, which is only right
 * when every question holds for the same time. Once a reveal carries a fact
 * they do not, and a composition sized by the average ends mid-sentence on the
 * long ones.
 */
export function quizDurationFor(
  questions: Array<{ answer: string; aside?: string | null }>,
  countdown = QUIZ_COUNTDOWN_SECONDS,
  title = '',
): number {
  return questions.reduce(
    (total, q) => total + QUIZ_QUESTION_SECONDS + countdown + revealSecondsFor(q),
    titleSecondsFor(title),
  );
}

const face = (t: RenderTypography | undefined, role: 'display' | 'body' | 'label') =>
  t
    ? { fontFamily: t[role].family, fontWeight: t[role].weight, letterSpacing: `${t[role].tracking}em` }
    : {};

/**
 * The countdown ring and numeral.
 *
 * A ring rather than a bare number because a shrinking arc is readable at a
 * glance and in peripheral vision — a viewer reading the question does not have
 * to look away to know how long is left, which is the point of showing it at all.
 */
const Countdown: React.FC<{
  seconds: number;
  /**
   * When the countdown starts, in seconds from the beat's own start.
   *
   * `useCurrentFrame` inside a `Sequence` counts from the *sequence*, not from
   * this component, so measuring elapsed time directly ran the count during the
   * question as well. The first render burned 3-2-1 while the question was
   * still being read and then held an empty ring through the pause — a dead
   * beat at exactly the moment the format is meant to be tightest.
   */
  startsAtSeconds: number;
  brand: BrandTokens;
  type?: RenderTypography;
}> = ({ seconds, startsAtSeconds, brand, type }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elapsed = Math.max(0, frame / fps - startsAtSeconds);
  const remaining = Math.max(0, seconds - elapsed);
  const shown = Math.ceil(remaining);
  const progress = Math.min(1, elapsed / seconds);

  const R = 80;
  const circumference = 2 * Math.PI * R;

  /* A small pulse as each numeral changes, so the count is felt as well as read. */
  const sinceTick = (elapsed % 1) / 1;
  const pulse = interpolate(sinceTick, [0, 0.18, 1], [1.12, 1, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260 }}>
      <svg width={200} height={200} viewBox="0 0 200 200">
        <circle cx={100} cy={100} r={R} fill="none" /* `muted` at low opacity, because BrandTokens has no line colour. */
          stroke={brand.muted}
          strokeOpacity={0.25} strokeWidth={8} />
        <circle
          cx={100}
          cy={100}
          r={R}
          fill="none"
          stroke={brand.primary}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * progress}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          fontSize: 128,
          color: 'inherit',
          transform: `scale(${pulse})`,
          ...face(type, 'display'),
        }}
      >
        {/*
          Clamped to 1 rather than blanked. The ring is only on screen while the
          countdown is running, so a blank numeral is a frame that reads as
          broken rather than as "time is up".
        */}
        {Math.max(1, shown)}
      </span>
    </div>
  );
};

/** Question, then countdown, then answer. One unit. */
const QuestionBeat: React.FC<{
  item: QuizQuestion;
  index: number;
  total: number;
  brand: BrandTokens;
  type?: RenderTypography;
  countdownSeconds: number;
  revealSeconds: number;
  /** §302. Which of the five treatments draws this one. */
  template: QuizTemplateId;
  palette: QuizPalette;
}> = ({ item, index, total, brand, type, countdownSeconds, revealSeconds, template, palette }) => {
  const countdownStart = QUIZ_QUESTION_SECONDS;
  const revealStart = countdownStart + countdownSeconds;
  const { rise, reveal, revealed } = useQuizProgress(revealStart);
  const Template = QUIZ_TEMPLATE_COMPONENTS[template];

  return (
    <AbsoluteFill
      style={{
        /* Transparent when a photograph is behind the whole piece. */
        backgroundColor: 'transparent',
        /*
         * §302. Asymmetric, and it has to be. Rendering the first version
         * showed the whole question sitting in the middle 40% of a 9:16 frame
         * with dead space above and below it — which on a phone reads as timid
         * next to a feed of edge-to-edge video. Type at the top, a fixed slot
         * for the timer at the bottom, and the question fills what is left.
         */
        padding: '150px 68px 60px',
        flexDirection: 'column',
        justifyContent: 'flex-start',
      }}
    >
      {/*
        §302. The question, its options and their reveal state, drawn by
        whichever treatment was chosen for this question. Before this, options
        were carried on `QuizQuestion` and never rendered at all — every
        multiple choice reached the viewer as a free-form question.
      */}
      {/* The question takes every pixel the timer slot does not need. */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minHeight: 0,
        }}
      >
      <Template
        question={item.question}
        options={item.options ?? []}
        correctIndex={item.correctIndex}
        revealed={revealed}
        brand={brand}
        type={type}
        rise={rise}
        reveal={reveal}
        index={index}
        total={total}
        palette={palette}
      />
      </div>

      {/*
        The countdown occupies the space the answer will fill, so the reveal
        replaces it in place rather than pushing the question up the frame. A
        layout that jumps at the moment of payoff undercuts the payoff.

        §302. Pinned to a slot of fixed height at the foot of the frame, so the
        timer lands in the same place whichever treatment is above it. It used
        to sit directly under the options, which put it at a different height in
        every template and made a four-question quiz look unsteady.
      */}
      <div
        style={{
          minHeight: 240,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
      {!revealed ? (
        <Countdown
          seconds={countdownSeconds}
          startsAtSeconds={countdownStart}
          brand={brand}
          type={type}
        />
      ) : (
        <Reveal
          item={item}
          brand={brand}
          type={type}
          revealSeconds={revealSeconds}
          /*
           * §302. When the treatment has options, it has already filled the
           * right one — restating the answer in display type underneath is the
           * same information twice and pushes the options off frame at the
           * exact moment the viewer is checking whether they were right.
           */
          answerAlreadyShown={(item.options?.length ?? 0) > 0}
          palette={palette}
        />
      )}
      </div>
    </AbsoluteFill>
  );
};

const Reveal: React.FC<{
  item: QuizQuestion;
  brand: BrandTokens;
  type?: RenderTypography;
  revealSeconds: number;
  /** §302. The chosen template already filled the right option. */
  answerAlreadyShown?: boolean;
  palette: QuizPalette;
}> = ({ item, brand, type, answerAlreadyShown, palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /*
   * The answer arrives on a spring rather than a fade. A fade reads as a
   * transition; a spring reads as an arrival, which is what a reveal is.
   */
  const enter = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120 },
    durationInFrames: Math.round(fps * 0.5),
  });

  /*
   * With options on screen the reveal is the fill, not a second headline. All
   * that is left to add is the citation, small and under it.
   */
  if (answerAlreadyShown) {
    return (
      <div
        style={{
          minHeight: 120,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 12,
          marginTop: 20,
        }}
      >
        {item.aside ? (
          <span
            style={{
              fontSize: 38,
              lineHeight: 1.2,
              color: palette.fg,
              /* A beat behind the fill, so it reads as a second thought. */
              opacity: Math.min(1, Math.max(0, enter * 1.6 - 0.6)),
              ...face(type, 'body'),
            }}
          >
            {item.aside}
          </span>
        ) : null}
        {item.source ? (
          <span
            style={{
              fontSize: 24,
              color: palette.dimmed,
              opacity: Math.min(1, enter * 1.2),
              ...face(type, 'body'),
            }}
          >
            {item.source}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 260, justifyContent: 'center' }}>
      <div
        style={{
          height: 4,
          width: `${Math.min(100, enter * 100)}%`,
          backgroundColor: brand.primary,
          marginBottom: 28,
        }}
      />
      <span
        style={{
          fontSize: 86,
          lineHeight: 1.06,
          color: palette.fg,
          opacity: Math.min(1, enter * 1.4),
          transform: `translateY(${(1 - enter) * 18}px)`,
          ...face(type, 'display'),
        }}
      >
        {item.answer}
      </span>
      {item.aside ? (
        <span
          style={{
            fontSize: 36,
            marginTop: 20,
            lineHeight: 1.2,
            color: palette.fg,
            opacity: Math.min(1, Math.max(0, enter * 1.6 - 0.6)),
            ...face(type, 'body'),
          }}
        >
          {item.aside}
        </span>
      ) : null}
      {item.source ? (
        <span
          style={{
            fontSize: 24,
            marginTop: 14,
            color: palette.dimmed,
            opacity: Math.min(1, Math.max(0, enter * 1.2 - 0.3)),
            ...face(type, 'body'),
          }}
        >
          {item.source}
        </span>
      ) : null}
    </div>
  );
};

export const QuizVideo: React.FC<QuizVideoProps> = ({
  brand,
  typography,
  title,
  questions,
  countdownSeconds = QUIZ_COUNTDOWN_SECONDS,
  audioSrc,
  wordmark,
  backgroundDataUri,
}) => {
  const { fps } = useVideoConfig();

  /*
   * §302. A treatment per question, chosen once for the whole piece so it is
   * stable across a re-render, and chosen with the running history so five
   * questions cycle through the treatments that fit rather than repeating one.
   */
  /*
   * §302. Type and surface colours, measured from the brand once. Over a
   * photograph it is white; on the brand ground it is whichever of ink and
   * white actually contrasts with it — which is how a dark-ground product gets
   * legible type without anybody configuring one.
   */
  const palette = React.useMemo(
    () => quizPalette(brand, Boolean(backgroundDataUri)),
    [brand, backgroundDataUri],
  );

  const templates = React.useMemo(() => {
    const used: QuizTemplateId[] = [];
    return questions.map((q) => {
      const options = q.options ?? [];
      const isTrueFalse =
        options.length === 2 &&
        options.every((o) => ['true', 'false'].includes(o.trim().toLowerCase()));
      const { template } = chooseQuizTemplate({
        optionCount: options.length,
        isTrueFalse,
        recent: used,
      });
      used.unshift(template);
      return template;
    });
  }, [questions]);

  const titleFrames = Math.round(titleSecondsFor(title) * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: brand.background, color: backgroundDataUri ? '#FFFFFF' : brand.ink }}>
      {audioSrc ? <Audio src={audioSrc} /> : null}

      {/* §294. Same full-bleed treatment the shared Stage uses. */}
      {backgroundDataUri ? (
        <>
          <img
            src={backgroundDataUri}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <AbsoluteFill
            style={{
              backgroundImage:
                'linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.86) 100%)',
            }}
          />
        </>
      ) : null}

      {/*
        The title card is the hook and holds from frame 0 — §274's rule. An
        opening that animates in spends the only window that decides whether
        anyone sees the first question.
      */}
      <Sequence durationInFrames={titleFrames}>
        <AbsoluteFill
          style={{
            padding: '160px 84px',
            flexDirection: 'column',
            justifyContent: 'center',
            /*
             * §301/§302. The same resolved type colour the questions use. The
             * title card was `brand.ink` unconditionally, which is dark type on
             * the dark end of a scrim — the contrast problem the operator
             * flagged, and it was in the first two seconds of every quiz.
             */
            color: palette.fg,
          }}
        >
          <span
            style={{
              fontSize: 30,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: brand.primary,
              marginBottom: 24,
              ...face(typography, 'label'),
            }}
          >
            {questions.length} questions
          </span>
          <span style={{ fontSize: 124, lineHeight: 0.98, ...face(typography, 'display') }}>
            {title}
          </span>
        </AbsoluteFill>
      </Sequence>

      {questions.map((item, i) => {
        /*
         * §312. Each question is as long as its own reveal needs, so a beat
         * begins where the previous one ended rather than on a fixed grid.
         */
        const reveal = revealSecondsFor(item);
        const from =
          titleFrames +
          Math.round(
            fps *
              questions
                .slice(0, i)
                .reduce(
                  (t, q) => t + QUIZ_QUESTION_SECONDS + countdownSeconds + revealSecondsFor(q),
                  0,
                ),
          );
        const durationInFrames = Math.round(
          fps * (QUIZ_QUESTION_SECONDS + countdownSeconds + reveal),
        );
        return (
        <Sequence
          key={`${item.question}-${i}`}
          from={from}
          durationInFrames={durationInFrames}
        >
          <QuestionBeat
            item={item}
            index={i}
            total={questions.length}
            brand={brand}
            type={typography}
            countdownSeconds={countdownSeconds}
            template={templates[i]!}
            palette={palette}
            revealSeconds={reveal}
          />
        </Sequence>
        );
      })}

      {wordmark ? (
        <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 64, pointerEvents: 'none' }}>
          <span
            style={{
              fontSize: 26,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              /* §301. Same reason: `brand.muted` disappears into a scrim. */
              color: palette.dimmed,
            }}
          >
            {wordmark}
          </span>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
