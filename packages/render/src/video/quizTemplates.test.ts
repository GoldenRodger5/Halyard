/**
 * §302. The selector must never hand a template a question it cannot draw.
 *
 * Variety is the point, but variety is the *second* rule. A `versus` template
 * given three options draws two of them, and one of the two it drops could be
 * the right answer — a video that shows the wrong answer as correct.
 */
import { describe, it, expect } from 'vitest';
import { contrastRatio } from './captionStyle.js';
import {
  QUIZ_TEMPLATES,
  QUIZ_TEMPLATE_INFO,
  chooseQuizTemplate,
  quizPalette,
  type QuizTemplateId,
} from './quizTemplates.js';

describe('chooseQuizTemplate', () => {
  it('never picks a template that cannot draw the option count', () => {
    for (let count = 0; count <= 6; count += 1) {
      const { template } = chooseQuizTemplate({ optionCount: count });
      const [min, max] = QUIZ_TEMPLATE_INFO[template].options;
      const covers = count >= min && count <= max;
      /*
       * Either the treatment's range covers the count, or it fell to spotlight
       * — which draws no options and is therefore honest for any count it was
       * not built for. One option and six options both land there: a choice of
       * one is not a choice, and six will not fit a phone.
       */
      expect(covers || template === 'spotlight').toBe(true);
    }
  });

  it('reserves the versus panels for true or false', () => {
    expect(chooseQuizTemplate({ optionCount: 2, isTrueFalse: false }).template).not.toBe('versus');
    expect(chooseQuizTemplate({ optionCount: 2, isTrueFalse: true }).template).toBe('versus');
  });

  it('draws a question with no options on its own', () => {
    expect(chooseQuizTemplate({ optionCount: 0 }).template).toBe('spotlight');
  });

  it('cycles rather than repeating across a run of questions', () => {
    /* Five three-option questions: the treatment should change, not repeat. */
    const used: QuizTemplateId[] = [];
    for (let i = 0; i < 4; i += 1) {
      const { template } = chooseQuizTemplate({ optionCount: 3, recent: used });
      used.unshift(template);
    }
    /* Every template that fits three options gets used before any repeats. */
    const fitting = QUIZ_TEMPLATES.filter((id) => {
      const [min, max] = QUIZ_TEMPLATE_INFO[id].options;
      return 3 >= min && 3 <= max && id !== 'versus';
    });
    expect(new Set(used.slice(0, fitting.length)).size).toBe(fitting.length);
  });

  it('is deterministic — the same history gives the same template', () => {
    const a = chooseQuizTemplate({ optionCount: 4, recent: ['stack'] });
    const b = chooseQuizTemplate({ optionCount: 4, recent: ['stack'] });
    expect(a.template).toBe(b.template);
    expect(a.template).not.toBe('stack');
  });

  it('explains itself', () => {
    expect(chooseQuizTemplate({ optionCount: 3 }).reason.length).toBeGreaterThan(20);
  });
});

describe('quizPalette', () => {
  /* RecipeFix: warm cream ground, dark ink, rust primary. */
  const recipefix = {
    background: '#FAF7F0',
    ink: '#1F1B16',
    primary: '#B5502A',
    muted: '#8A8178',
  } as never;

  /* A dark-ground product, to prove nothing here is configured per brand. */
  const dark = {
    background: '#101014',
    ink: '#F2F2F5',
    primary: '#2F5DDB',
    muted: '#8A8A96',
  } as never;

  it('picks type that contrasts with the brand ground, on either kind of brand', () => {
    expect(contrastRatio(quizPalette(recipefix, false).fg, '#FAF7F0')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(quizPalette(dark, false).fg, '#101014')).toBeGreaterThanOrEqual(4.5);
  });

  it('goes white over a photograph regardless of the brand', () => {
    expect(quizPalette(recipefix, true).fg).toBe('#FFFFFF');
    expect(quizPalette(dark, true).fg).toBe('#FFFFFF');
  });

  it('lifts an accent that would fail against the scrim', () => {
    const over = quizPalette(recipefix, true);
    expect(contrastRatio(over.accent, '#1a1512')).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves an accent alone when it already passes', () => {
    /* Rust on cream clears 4.5:1, so the brand keeps its own colour. */
    const onBrand = quizPalette(recipefix, false);
    expect(onBrand.accent).toBe('#B5502A');
  });

  it('gives options a real plate over a photograph', () => {
    /* A wash is not a container over an image nobody has looked at. */
    expect(quizPalette(recipefix, true).surface).toContain('rgba(0,0,0');
    expect(quizPalette(recipefix, false).surface).not.toContain('rgba(0,0,0,0.46)');
  });
});
