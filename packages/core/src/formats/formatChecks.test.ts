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
