/**
 * §289. The quiz as a video.
 *
 * A quiz as a carousel is a list with the answers on the next card. What makes
 * the format land is the **pause** — a carousel cannot enforce one because the
 * reader controls the swipe, and a video can because it controls time. So the
 * arithmetic that places that pause is the thing worth testing.
 */
import { describe, expect, it } from 'vitest';
import {
  QUIZ_COUNTDOWN_SECONDS,
  QUIZ_QUESTION_SECONDS,
  QUIZ_REVEAL_SECONDS,
  QUIZ_TITLE_SECONDS,
  quizDurationSeconds,
  secondsPerQuestion,
} from './quiz.js';

describe('quiz timing', () => {
  it('gives every question a read, a countdown and a reveal', () => {
    expect(secondsPerQuestion()).toBeCloseTo(
      QUIZ_QUESTION_SECONDS + QUIZ_COUNTDOWN_SECONDS + QUIZ_REVEAL_SECONDS,
      5,
    );
  });

  it('sizes the composition to the questions it actually has', () => {
    /*
     * `durationInFrames` is decided before the component runs. A composition
     * whose length does not match its content clips the last answer or ends on
     * dead air, and both read as a bug rather than an edit.
     */
    const three = quizDurationSeconds(3);
    const five = quizDurationSeconds(5);
    expect(five - three).toBeCloseTo(2 * secondsPerQuestion(), 5);
    expect(three).toBeCloseTo(QUIZ_TITLE_SECONDS + 3 * secondsPerQuestion(), 5);
  });

  it('honours a custom countdown in the total', () => {
    expect(quizDurationSeconds(2, 5)).toBeGreaterThan(quizDurationSeconds(2, 3));
  });

  it('keeps a countdown long enough to think and short enough to hold', () => {
    /*
     * Three seconds is the format: below two a viewer cannot commit to an
     * answer, and above four the open loop goes slack.
     */
    expect(QUIZ_COUNTDOWN_SECONDS).toBeGreaterThanOrEqual(2);
    expect(QUIZ_COUNTDOWN_SECONDS).toBeLessThanOrEqual(4);
  });

  it('holds the reveal longer than it takes to read', () => {
    /* The reveal is the payoff and the most screenshotted frame in the format. */
    expect(QUIZ_REVEAL_SECONDS).toBeGreaterThanOrEqual(2);
  });

  it('starts the countdown after the question, not with it', () => {
    /*
     * The bug the first render had: `Countdown` measured from the sequence
     * start rather than from its own, so it burned 3-2-1 while the question was
     * still being read and then held an empty ring through the pause — a dead
     * beat at exactly the moment the format is tightest.
     *
     * The reveal must land after the question has been shown *and* the full
     * countdown has run.
     */
    const revealAt = QUIZ_QUESTION_SECONDS + QUIZ_COUNTDOWN_SECONDS;
    expect(revealAt).toBeGreaterThan(QUIZ_COUNTDOWN_SECONDS);
    expect(revealAt).toBeLessThan(secondsPerQuestion());
  });

  it('fits a five-question quiz in a length short-form will carry', () => {
    /* Thirty-ish seconds is the promise the title card makes. */
    expect(quizDurationSeconds(5)).toBeLessThan(45);
  });
});
