/**
 * §300. What kind of question this is, and how hard.
 *
 * The first production quiz asked *"What year was gluten first identified?"* as
 * a free-form question. It is a good question and a bad free-form one: almost
 * nobody can produce "1728" from memory, so a viewer's honest reaction is "no
 * idea" — and a viewer who cannot play does not stay for the answer.
 *
 * The same fact as multiple choice is a *good* question, because 1728 against
 * 1928 and 1608 is a real decision a person can make. Nothing about the fact
 * changed; the **asking** changed.
 *
 * So the kind of question is a decision, and it follows from one property of
 * the answer: **can an ordinary person produce it, or only recognise it?**
 *
 * - A year, a name, a number → recognisable, not producible → multiple choice
 * - A yes/no with a common misconception → true or false
 * - A thing people do every week → producible → free form
 *
 * ## Difficulty is a curve, not a label
 *
 * A quiz that opens hard loses the people who would have stayed. Five questions
 * run easy → hard so the first is a win and the last is worth bragging about,
 * which is also the shape that produces comments: nobody comments "I got 5/5"
 * unless the fifth was hard.
 */

/** How a question is put to the viewer. */
export const QUESTION_KINDS = ['multiple_choice', 'true_false', 'free_form'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** How hard, on a scale a viewer feels rather than a scale we measure. */
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** What kind of thing the answer is. This is what decides the question kind. */
export const ANSWER_SHAPES = [
  'year',
  'number',
  'name',
  'yes_no',
  'term',
  'technique',
] as const;
export type AnswerShape = (typeof ANSWER_SHAPES)[number];

/**
 * Whether an ordinary person could *produce* this answer, or only recognise it.
 *
 * The whole decision turns on this. A year is recognisable and not producible;
 * a technique someone uses every week is both.
 */
const PRODUCIBLE: Record<AnswerShape, boolean> = {
  year: false,
  number: false,
  name: false,
  yes_no: true,
  term: true,
  technique: true,
};

export interface QuestionPlan {
  kind: QuestionKind;
  difficulty: Difficulty;
  /** Why this kind, in a line an operator can disagree with. */
  reason: string;
  /** How many options to write. Zero for free form. */
  optionCount: number;
}

/**
 * Choose how to ask, from what the answer is.
 *
 * `yes_no` becomes true/false rather than a two-option multiple choice, because
 * "True or False" is a recognised game and "A or B" with two options reads as a
 * multiple choice that ran out of ideas.
 */
export function planQuestion(input: {
  answerShape: AnswerShape;
  difficulty: Difficulty;
  /** Set when the fact is a common misconception — those play best as true/false. */
  isMisconception?: boolean;
}): QuestionPlan {
  if (input.isMisconception || input.answerShape === 'yes_no') {
    return {
      kind: 'true_false',
      difficulty: input.difficulty,
      reason:
        'A belief people already hold, so the game is whether they are right — which is true or false, not a list.',
      optionCount: 2,
    };
  }

  if (!PRODUCIBLE[input.answerShape]) {
    return {
      kind: 'multiple_choice',
      /*
       * Three options, not four. A fourth is nearly always obviously wrong,
       * and an obviously wrong option makes the question feel easier than it
       * is rather than harder.
       */
      optionCount: 3,
      difficulty: input.difficulty,
      reason: `A ${input.answerShape} is something people recognise rather than recall, so asking it open would get "no idea" from almost everyone.`,
    };
  }

  return {
    kind: 'free_form',
    optionCount: 0,
    difficulty: input.difficulty,
    reason: `A ${input.answerShape} is something the audience actually does, so they can answer it out loud and be right.`,
  };
}

/**
 * The difficulty of each question in a quiz, in order.
 *
 * Easy first, hard last, and never two hard questions in a row before the end.
 * A quiz that opens hard loses the people who would have stayed, and one that
 * ends easy gives nobody a reason to say how they did.
 */
export function difficultyCurve(count: number): Difficulty[] {
  if (count <= 1) return ['easy'];
  if (count === 2) return ['easy', 'hard'];
  const out: Difficulty[] = ['easy'];
  const middle = count - 2;
  for (let i = 0; i < middle; i += 1) {
    /* Ramp through medium, tipping to hard only in the last third. */
    out.push(i >= Math.ceil(middle / 2) ? 'hard' : 'medium');
  }
  out.push('hard');
  return out;
}

export interface AnswerCheck {
  ok: boolean;
  problems: string[];
}

/**
 * Check a written question against the plan it was written for.
 *
 * Deterministic, and it checks the things that make a quiz *playable* rather
 * than the things that make it true — the citation gate (§282) handles truth.
 * A multiple choice with the answer missing from its own options is the failure
 * that would embarrass an account, and it is exactly the kind a model makes.
 */
export function checkQuestion(input: {
  plan: QuestionPlan;
  question: string;
  answer: string;
  options?: string[];
  correctIndex?: number;
}): AnswerCheck {
  const problems: string[] = [];
  const { plan } = input;

  if (input.question.trim().length < 8) problems.push('The question is too short to be a question.');
  if (input.answer.trim().length < 1) problems.push('There is no answer.');

  if (plan.kind === 'free_form') {
    if (input.options && input.options.length > 0) {
      problems.push('A free-form question was given options, which turns it into a different game.');
    }
    return { ok: problems.length === 0, problems };
  }

  const options = input.options ?? [];
  if (options.length !== plan.optionCount) {
    problems.push(`Expected ${plan.optionCount} options and got ${options.length}.`);
  }

  if (new Set(options.map((o) => o.trim().toLowerCase())).size !== options.length) {
    problems.push('Two options are the same, so one of them cannot be wrong.');
  }

  const index = input.correctIndex;
  if (index === undefined || index < 0 || index >= options.length) {
    problems.push('The correct option is not one of the options.');
  } else {
    /*
     * The answer text must actually appear in the option it points at.
     * Otherwise the card says one thing and the reveal says another, which is
     * the mistake a viewer screenshots.
     */
    const chosen = options[index]!.trim().toLowerCase();
    const answer = input.answer.trim().toLowerCase();
    const overlaps = chosen.includes(answer) || answer.includes(chosen);
    if (!overlaps) {
      problems.push('The correct option does not match the answer that is revealed.');
    }
  }

  if (plan.kind === 'true_false') {
    const normalised = options.map((o) => o.trim().toLowerCase());
    if (!(normalised.includes('true') && normalised.includes('false'))) {
      problems.push('A true-or-false question needs exactly "True" and "False".');
    }
  }

  return { ok: problems.length === 0, problems };
}
