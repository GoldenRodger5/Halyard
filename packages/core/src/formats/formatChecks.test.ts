/**
 * §342. The rules only a specific format can enforce.
 *
 * Every case is one the screenplay actually produced when it bypassed the
 * format writer (§340).
 */
import { describe, it, expect } from 'vitest';
import { POST_FORMAT_CATALOG } from './catalog.js';
import { checkFormatSpecific } from './write.js';

const slot = (key: string, index: number, text: string) => ({
  key,
  index,
  text,
  citation: null,
});

describe('quiz', () => {
  const quiz = POST_FORMAT_CATALOG.quiz;

  it('refuses a question with no answer', () => {
    /* A quiz without a reveal is a list of prompts. */
    const problems = checkFormatSpecific(quiz, {
      slots: [slot('question', 0, 'What year was gluten identified?')],
    } as never);
    expect(problems.map((p) => p.rule)).toContain('quiz.no_answer');
  });

  it('refuses the opinion the screenplay invented', () => {
    /*
     * "Was it the story, the mood, the people, or the night?" — written by a
     * screenplay that skipped the format writer. It reads like a question and
     * has no answer, so the reveal has nothing to reveal.
     */
    const problems = checkFormatSpecific(quiz, {
      slots: [
        slot('question', 0, 'Was it the story, the mood, the people, or the night?'),
        slot('answer', 0, 'It depends.'),
      ],
    } as never);
    expect(problems.map((p) => p.rule)).toContain('quiz.opinion_not_fact');
  });

  it('refuses a prompt dressed as a question', () => {
    const problems = checkFormatSpecific(quiz, {
      slots: [
        slot('question', 0, 'Name the last film you truly loved.'),
        slot('answer', 0, 'Whatever it was.'),
      ],
    } as never);
    expect(problems.map((p) => p.rule)).toContain('quiz.not_a_question');
  });

  it('accepts a real question with a real answer', () => {
    const problems = checkFormatSpecific(quiz, {
      slots: [
        slot('question', 0, 'What year was gluten first identified?'),
        slot('answer', 0, '1728, by Jacopo Beccari.'),
      ],
    } as never);
    expect(problems).toEqual([]);
  });

  it('refuses a quiz with no questions at all', () => {
    const problems = checkFormatSpecific(quiz, { slots: [slot('title', 0, 'A quiz')] } as never);
    expect(problems.map((p) => p.rule)).toContain('quiz.no_questions');
  });
});

describe('myth_fact', () => {
  it('refuses a myth that is never corrected, because that spreads it', () => {
    const problems = checkFormatSpecific(POST_FORMAT_CATALOG.myth_fact, {
      slots: [slot('myth', 0, 'Oats always contain gluten.')],
    } as never);
    expect(problems.map((p) => p.rule)).toContain('myth_fact.uncorrected');
  });
});

describe('formats with no special rules', () => {
  it('adds nothing rather than failing', () => {
    expect(
      checkFormatSpecific(POST_FORMAT_CATALOG.history, { slots: [] } as never),
    ).toEqual([]);
  });
});

describe('§348. a slot is a fragment, not a post', () => {
  it('does not judge a slot by rules that describe a whole post', async () => {
    /*
     * Three separate attempts of a real Kinolog quiz were refused by three
     * post-shaped rules — an opening-line ceiling on an *answer*, a question
     * density on a format made of questions, a citation on a title that
     * asserts nothing. Each correct about a caption; none applicable here.
     */
    const { isPostShaped } = await import('../qc/slopFilter.js');
    expect(isPostShaped('structure.opening_line')).toBe(true);
    expect(isPostShaped('structure.question_density')).toBe(true);
  });

  it('still judges a slot by the language rules', async () => {
    /* An em dash is an em dash wherever it appears. */
    const { isPostShaped } = await import('../qc/slopFilter.js');
    expect(isPostShaped('punctuation.em_dash')).toBe(false);
    expect(isPostShaped('punctuation.curly_quotes')).toBe(false);
    expect(isPostShaped('structure.sentence_too_long')).toBe(false);
  });
});

/**
 * §376. §300's playability checks, now actually running.
 *
 * `planQuestion`, `checkQuestion` and `difficultyCurve` were written, tested
 * and called by nothing outside their own test file, so the rule that catches
 * the failure which would genuinely embarrass an account — the revealed answer
 * not being among the options the viewer was shown — was enforced nowhere.
 */
describe('a quiz that cannot be played', () => {
  const quizFormat = POST_FORMAT_CATALOG.quiz;
  const withOptions = (question: string, answer: string, options: string) =>
    ({
      slots: [
        slot('title', 0, 'How well do you know gluten?'),
        slot('question', 0, question),
        slot('options', 0, options),
        slot('answer', 0, answer),
      ],
    }) as never;

  it('refuses a question whose answer is not one of its options', () => {
    /*
     * The one that matters. The card offers three years, the reveal names a
     * fourth, and a viewer screenshots it. Until now this was noticed only at
     * render time, where the options were silently dropped and the writer was
     * never told — so the same mistake came back on the next piece.
     */
    const problems = checkFormatSpecific(
      quizFormat,
      withOptions('What year was gluten first identified?', '1728', '1901 | 1834 | 1955'),
    );
    expect(problems.some((p) => p.rule === 'quiz.unplayable')).toBe(true);
    expect(problems.find((p) => p.rule === 'quiz.unplayable')!.message).toContain('correct option');
  });

  it('refuses two options that are the same, so one of them cannot be wrong', () => {
    const problems = checkFormatSpecific(
      quizFormat,
      withOptions('What year was gluten first identified?', '1728', '1728 | 1901 | 1901'),
    );
    expect(problems.some((p) => p.message.includes('Two options are the same'))).toBe(true);
  });

  it('accepts a question whose answer is among its options', () => {
    const problems = checkFormatSpecific(
      quizFormat,
      withOptions('What year was gluten first identified?', '1728', '1728 | 1901 | 1834'),
    );
    expect(problems.filter((p) => p.rule === 'quiz.unplayable')).toEqual([]);
  });

  it('accepts a true-or-false question', () => {
    const problems = checkFormatSpecific(
      quizFormat,
      withOptions('Do oats always contain gluten?', 'False', 'True | False'),
    );
    expect(problems.filter((p) => p.rule === 'quiz.unplayable')).toEqual([]);
  });

  it('leaves a question with no options alone', () => {
    /*
     * Most quizzes arrive without any: the catalogue's slot asks for a question
     * and not for a list, and a question with no options is legitimately drawn
     * as a spotlight. Demanding them here would refuse every quiz this system
     * currently writes.
     */
    const problems = checkFormatSpecific(quizFormat, {
      slots: [
        slot('title', 0, 'How well do you know gluten?'),
        slot('question', 0, 'What year was gluten first identified?'),
        slot('answer', 0, '1728, by Jacopo Beccari.'),
      ],
    } as never);
    expect(problems.filter((p) => p.rule === 'quiz.unplayable')).toEqual([]);
  });

  it('leaves a single option alone rather than calling it a broken list', () => {
    const problems = checkFormatSpecific(
      quizFormat,
      withOptions('What year was gluten first identified?', '1728', '1728'),
    );
    expect(problems.filter((p) => p.rule === 'quiz.unplayable')).toEqual([]);
  });
});
