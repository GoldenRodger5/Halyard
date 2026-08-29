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
  /** How long the answer holds. Long enough to read and screenshot. */
  revealSeconds?: number;
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
}> = ({ item, index, total, brand, type, countdownSeconds, revealSeconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;

  const countdownStart = QUIZ_QUESTION_SECONDS;
  const revealStart = countdownStart + countdownSeconds;
  const revealed = seconds >= revealStart;

  /* The question rises once and stays; nothing re-animates on the reveal. */
  const rise = spring({ frame, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.4) });

  return (
    <AbsoluteFill
      style={{
        /* Transparent when a photograph is behind the whole piece. */
        backgroundColor: 'transparent',
        padding: '120px 72px',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontSize: 34,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: brand.primary,
          marginBottom: 24,
          ...face(type, 'label'),
        }}
      >
        Question {index + 1} of {total}
      </span>

      <span
        style={{
          fontSize: 104,
          lineHeight: 1.02,
          opacity: rise,
          transform: `translateY(${(1 - rise) * 24}px)`,
          ...face(type, 'display'),
        }}
      >
        {item.question}
      </span>

      {/*
        The countdown occupies the space the answer will fill, so the reveal
        replaces it in place rather than pushing the question up the frame. A
        layout that jumps at the moment of payoff undercuts the payoff.
      */}
      {!revealed ? (
        <Countdown
          seconds={countdownSeconds}
          startsAtSeconds={countdownStart}
          brand={brand}
          type={type}
        />
      ) : (
        <Reveal item={item} brand={brand} type={type} revealSeconds={revealSeconds} />
      )}
    </AbsoluteFill>
  );
};

const Reveal: React.FC<{
  item: QuizQuestion;
  brand: BrandTokens;
  type?: RenderTypography;
  revealSeconds: number;
}> = ({ item, brand, type }) => {
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
          opacity: Math.min(1, enter * 1.4),
          transform: `translateY(${(1 - enter) * 18}px)`,
          ...face(type, 'display'),
        }}
      >
        {item.answer}
      </span>
      {item.source ? (
        <span
          style={{
            fontSize: 26,
            marginTop: 22,
            color: brand.muted,
            opacity: Math.min(1, Math.max(0, enter * 1.2 - 0.3)),
            ...face(type, 'body'),
          }}
        >
          Source: {item.source}
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
  revealSeconds = QUIZ_REVEAL_SECONDS,
  audioSrc,
  wordmark,
  backgroundDataUri,
}) => {
  const { fps } = useVideoConfig();
  const titleFrames = Math.round(QUIZ_TITLE_SECONDS * fps);
  const beatFrames = Math.round(secondsPerQuestion(countdownSeconds, revealSeconds) * fps);

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
            color: brand.ink,
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

      {questions.map((item, i) => (
        <Sequence
          key={`${item.question}-${i}`}
          from={titleFrames + i * beatFrames}
          durationInFrames={beatFrames}
        >
          <QuestionBeat
            item={item}
            index={i}
            total={questions.length}
            brand={brand}
            type={typography}
            countdownSeconds={countdownSeconds}
            revealSeconds={revealSeconds}
          />
        </Sequence>
      ))}

      {wordmark ? (
        <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 64, pointerEvents: 'none' }}>
          <span
            style={{
              fontSize: 26,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: brand.muted,
            }}
          >
            {wordmark}
          </span>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
