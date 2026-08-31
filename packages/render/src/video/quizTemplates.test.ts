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
  chooseQuizTreatments,
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

  it('sets small type white on a plate over a photograph, not in brand colour', () => {
    /*
     * §315. There is no brand tint that is safe on an unknown photograph. A
     * 30px label sits wherever the layout puts it, which may be the brightest
     * patch in the frame — rust measuring 4.5:1 against the average measures
     * 1.8:1 against a sunlit crust, which is how a label that passed its test
     * came out invisible on screen.
     */
    const over = quizPalette(recipefix, true);
    expect(over.accent).toBe('#FFFFFF');
    expect(over.plate).toBeTruthy();
    /* The brand still reads: the rule and the fills are the primary itself. */
    expect(over.rule).toBe('#B5502A');
  });

  it('keeps white legible on the plate over even a white photograph', () => {
    /*
     * The worst case, which is the only one worth designing for: a plate that
     * only works over dark pictures is a plate that fails unpredictably.
     */
    const over = quizPalette(recipefix, true);
    const alpha = Number(/rgba\(0,0,0,([0-9.]+)\)/.exec(over.plate!)![1]);
    /* The plate composited over pure white, as a grey of that brightness. */
    const value = Math.round(255 * (1 - alpha));
    const hex = value.toString(16).padStart(2, '0');
    expect(contrastRatio('#FFFFFF', `#${hex}${hex}${hex}`)).toBeGreaterThanOrEqual(4.5);
  });

  it('never rescues an accent by moving it toward the ground it sits on', () => {
    /*
     * §308. The first version lifted toward white unconditionally. On a light
     * brand that is the wrong direction — it made the eyebrow and the rail rule
     * invisible on cream, which shipped because it was only ever looked at over
     * a photograph. Checked on both kinds of brand.
     */
    for (const brand of [recipefix, dark]) {
      const p = quizPalette(brand, false);
      const ground = (brand as unknown as { background: string }).background;
      expect(
        contrastRatio(p.accent, ground),
        `accent ${p.accent} is illegible on ${ground}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('leaves an accent alone when it already passes', () => {
    /* Rust on cream clears 4.5:1, so the brand keeps its own colour. */
    const onBrand = quizPalette(recipefix, false);
    /* Case-insensitive: the step-0 pass normalises the hex. */
    expect(onBrand.accent.toUpperCase()).toBe('#B5502A');
  });

  it('gives options a real plate over a photograph', () => {
    /* A wash is not a container over an image nobody has looked at. */
    expect(quizPalette(recipefix, true).surface).toContain('rgba(0,0,0');
    expect(quizPalette(recipefix, false).surface).not.toContain('rgba(0,0,0,0.46)');
  });
});

/**
 * §394. The guarantee the whole variety spec exists to make.
 *
 * An account posts three times a week — 150 videos a year. What stops them all
 * looking alike is that a treatment is not reused until every treatment that
 * *can* carry the piece has been.
 */
describe('two pieces briefed the same way do not look the same', () => {
  const fourWay = [{ options: ['a', 'b', 'c', 'd'] }];

  it('does not repeat a treatment on the next piece', () => {
    /*
     * The defect this file was extended for: `used` was seeded empty on every
     * render, so question one always drew the same treatment and two quizzes
     * generated back to back were identical.
     */
    const first = chooseQuizTreatments({ questions: fourWay });
    const second = chooseQuizTreatments({ questions: fourWay, recent: first.treatments });
    expect(second.treatments[0]).not.toBe(first.treatments[0]);
  });

  it('exhausts every treatment that fits before reusing one', () => {
    const fits = QUIZ_TEMPLATES.filter((id) => {
      const [min, max] = QUIZ_TEMPLATE_INFO[id].options;
      return 4 >= min && 4 <= max;
    });

    /* Generate one piece at a time, carrying history forward as production does. */
    const history: QuizTemplateId[] = [];
    const seen: QuizTemplateId[] = [];
    for (let i = 0; i < fits.length; i += 1) {
      const { treatments } = chooseQuizTreatments({ questions: fourWay, recent: history });
      seen.push(treatments[0]!);
      history.unshift(treatments[0]!);
    }

    expect(new Set(seen).size, 'a treatment was reused before the pool ran out').toBe(fits.length);
  });

  it('is a pure function of its inputs, so a re-render is identical', () => {
    /*
     * Approving a video approves nothing if re-rendering it produces a
     * different one. Every variation here has to be a function of the piece,
     * never of the clock.
     */
    const a = chooseQuizTreatments({ questions: fourWay, recent: ['stack'] });
    const b = chooseQuizTreatments({ questions: fourWay, recent: ['stack'] });
    expect(a.treatments).toEqual(b.treatments);
  });

  it('still refuses a treatment that cannot draw the question', () => {
    /* Variety never costs correctness: an option off screen is worse than a repeat. */
    const history: QuizTemplateId[] = [];
    for (let i = 0; i < 12; i += 1) {
      const { treatments } = chooseQuizTreatments({
        questions: [{ options: ['yes', 'no'] }],
        recent: history,
      });
      const [min, max] = QUIZ_TEMPLATE_INFO[treatments[0]!].options;
      expect(2 >= min && 2 <= max, `${treatments[0]} cannot draw 2 options`).toBe(true);
      history.unshift(treatments[0]!);
    }
  });

  it('gives a reason for every treatment it picks', () => {
    const { treatments, reasons } = chooseQuizTreatments({
      questions: [fourWay[0]!, fourWay[0]!, fourWay[0]!],
    });
    expect(reasons).toHaveLength(treatments.length);
    for (const reason of reasons) expect(reason.length).toBeGreaterThan(20);
  });
});
