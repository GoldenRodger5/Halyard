/**
 * §300. How to ask, and how hard.
 *
 * The first production quiz asked "What year was gluten first identified?" as a
 * free-form question. Good question, bad free-form one: almost nobody produces
 * "1728" from memory, so the honest reaction is "no idea" — and a viewer who
 * cannot play does not stay for the answer.
 */
import { describe, expect, it } from 'vitest';
import {
  ANSWER_SHAPES,
  QUESTION_KINDS,
  checkQuestion,
  difficultyCurve,
  planQuestion,
  type QuestionPlan,
} from './quiz.js';

describe('choosing how to ask', () => {
  it('makes a year multiple choice, because nobody recalls a year', () => {
    /* The exact failure that prompted this. */
    const plan = planQuestion({ answerShape: 'year', difficulty: 'medium' });
    expect(plan.kind).toBe('multiple_choice');
    expect(plan.reason).toContain('recognise');
  });

  it('makes a name or a number multiple choice for the same reason', () => {
    for (const shape of ['name', 'number'] as const) {
      expect(planQuestion({ answerShape: shape, difficulty: 'easy' }).kind, shape).toBe(
        'multiple_choice',
      );
    }
  });

  it('leaves open the things people actually do', () => {
    for (const shape of ['technique', 'term'] as const) {
      expect(planQuestion({ answerShape: shape, difficulty: 'easy' }).kind, shape).toBe('free_form');
    }
  });

  it('turns a misconception into true or false, not a two-option list', () => {
    /*
     * "True or False" is a game people recognise. "A or B" with two options
     * reads as a multiple choice that ran out of ideas.
     */
    const plan = planQuestion({ answerShape: 'term', difficulty: 'easy', isMisconception: true });
    expect(plan.kind).toBe('true_false');
    expect(plan.optionCount).toBe(2);
  });

  it('asks for three options, not four', () => {
    /* A fourth option is nearly always obviously wrong, which makes the
       question feel easier rather than harder. */
    expect(planQuestion({ answerShape: 'year', difficulty: 'hard' }).optionCount).toBe(3);
  });

  it('gives every answer shape a plan', () => {
    for (const shape of ANSWER_SHAPES) {
      const plan = planQuestion({ answerShape: shape, difficulty: 'medium' });
      expect(QUESTION_KINDS, shape).toContain(plan.kind);
      expect(plan.reason.length, shape).toBeGreaterThan(20);
    }
  });
});

describe('the difficulty curve', () => {
  it('opens easy and ends hard', () => {
    /*
     * A quiz that opens hard loses the people who would have stayed, and one
     * that ends easy gives nobody a reason to say how they did.
     */
    const curve = difficultyCurve(5);
    expect(curve[0]).toBe('easy');
    expect(curve[curve.length - 1]).toBe('hard');
    expect(curve).toHaveLength(5);
  });

  it('never gets easier as it goes', () => {
    const rank = { easy: 0, medium: 1, hard: 2 };
    for (const n of [3, 4, 5, 6, 7]) {
      const curve = difficultyCurve(n);
      for (let i = 1; i < curve.length; i += 1) {
        expect(rank[curve[i]!], `n=${n} at ${i}`).toBeGreaterThanOrEqual(rank[curve[i - 1]!]);
      }
    }
  });

  it('still works for a one or two question quiz', () => {
    expect(difficultyCurve(1)).toEqual(['easy']);
    expect(difficultyCurve(2)).toEqual(['easy', 'hard']);
  });
});

describe('checking a written question', () => {
  const mc: QuestionPlan = planQuestion({ answerShape: 'year', difficulty: 'medium' });

  it('accepts a well-formed multiple choice', () => {
    const r = checkQuestion({
      plan: mc,
      question: 'What year was gluten first identified?',
      answer: '1728',
      options: ['1608', '1728', '1928'],
      correctIndex: 1,
    });
    expect(r.ok).toBe(true);
  });

  it('catches an answer that is not among its own options', () => {
    /* The mistake a model makes, and the one a viewer screenshots. */
    const r = checkQuestion({
      plan: mc,
      question: 'What year was gluten first identified?',
      answer: '1728',
      options: ['1608', '1811', '1928'],
      correctIndex: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain('does not match');
  });

  it('catches a correct index that points nowhere', () => {
    const r = checkQuestion({ plan: mc, question: 'A real question?', answer: 'x', options: ['a', 'b', 'c'], correctIndex: 7 });
    expect(r.ok).toBe(false);
  });

  it('catches two identical options, because one of them cannot be wrong', () => {
    const r = checkQuestion({
      plan: mc,
      question: 'What year was gluten first identified?',
      answer: '1728',
      options: ['1728', '1728', '1928'],
      correctIndex: 0,
    });
    expect(r.problems.join(' ')).toContain('the same');
  });

  it('requires true and false on a true-or-false question', () => {
    const tf = planQuestion({ answerShape: 'yes_no', difficulty: 'easy' });
    const r = checkQuestion({
      plan: tf,
      question: 'Oats always contain gluten.',
      answer: 'False',
      options: ['Yes', 'No'],
      correctIndex: 1,
    });
    expect(r.problems.join(' ')).toContain('True');
  });

  it('refuses options on a free-form question', () => {
    /* Giving a free-form question options turns it into a different game. */
    const ff = planQuestion({ answerShape: 'technique', difficulty: 'easy' });
    const r = checkQuestion({
      plan: ff,
      question: 'What do you add to gluten-free dough to keep it together?',
      answer: 'Xanthan gum',
      options: ['a', 'b'],
    });
    expect(r.ok).toBe(false);
  });
});
