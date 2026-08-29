/**
 * §280. Formats become slides.
 *
 * The check that matters most is the quiz: a question and its answer must be
 * separate cards. A reader who can see the answer under the question has not
 * been asked anything, and the pause is the entire format.
 */
import { describe, expect, it } from 'vitest';
import { RENDERABLE_FORMATS, slidesForFormat, type SlotValue } from './formatSlides.js';
import { CAROUSEL_LAYOUTS } from './layouts.js';

const slot = (key: string, index: number, text: string, citation?: string): SlotValue => ({
  key,
  index,
  text,
  citation: citation ?? null,
});

describe('a format becomes slides', () => {
  it('puts every quiz answer on a different card from its question', () => {
    const slots = [
      slot('title', 0, 'Five in thirty seconds'),
      slot('question', 0, 'When was gluten identified?'),
      slot('answer', 0, 'In 1728, by Jacopo Beccari.', 'Beccari, 1728'),
      slot('question', 1, 'Are oats gluten free?'),
      slot('answer', 1, 'Yes, unless they are cross-contaminated.', 'Coeliac UK, 2024'),
    ];
    const slides = slidesForFormat('quiz', slots);

    const qIndex = slides.findIndex((s) => s.headline.includes('When was gluten'));
    /* The answer lives in the body, because that is the slot `lead_emphasis`
       actually promotes — see the inversion test below. */
    const aIndex = slides.findIndex((s) => s.bodyLines.join(' ').includes('1728'));
    expect(qIndex).toBeGreaterThanOrEqual(0);
    expect(aIndex).toBe(qIndex + 1);
    /* And nothing on the question card gives it away. */
    expect(slides[qIndex]!.bodyLines).toHaveLength(0);
  });

  it('keeps the question loud and the answer quieter, which is the format', () => {
    const slides = slidesForFormat('quiz', [
      slot('question', 0, 'When was gluten identified?'),
      slot('answer', 0, 'In 1728.', 'Beccari, 1728'),
    ]);
    expect(slides[0]!.layout).toBe('statement');
    expect(slides[1]!.layout).not.toBe('statement');
  });

  it('shows the citation on the card that makes the claim', () => {
    /* A source a reader has to go looking for is one they will not check. */
    const slides = slidesForFormat('quiz', [
      slot('question', 0, 'When?'),
      slot('answer', 0, 'In 1728.', 'Beccari, 1728'),
    ]);
    expect(slides[1]!.bodyLines.join(' ')).toContain('Beccari, 1728');
  });

  it('numbers the deck so a reader knows where they are', () => {
    const slides = slidesForFormat('tips', [
      slot('title', 0, 'Gluten-free bread that rises'),
      slot('tip', 0, 'Hydrate the flour before mixing.'),
      slot('tip', 1, 'Proof it warmer than you think.'),
    ]);
    expect(slides.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(new Set(slides.map((s) => s.total))).toEqual(new Set([3]));
  });

  it('names the cost on a transformation, because that is the differentiator', () => {
    const slides = slidesForFormat('transformation', [
      slot('hook', 0, 'Your bars fall apart.'),
      slot('change', 0, 'Maple syrup for honey, one for one.'),
      slot('cost', 0, 'A softer bar. Chill it longer.'),
    ]);
    expect(
      slides.some((s) => `${s.headline} ${s.bodyLines.join(' ')}`.includes('softer bar')),
    ).toBe(true);
  });

  it('only ever emits layouts that exist', () => {
    const every = [
      ...slidesForFormat('quiz', [slot('question', 0, 'Q?'), slot('answer', 0, 'A.', 'X, 1999')]),
      ...slidesForFormat('history', [slot('hook', 0, 'H'), slot('setup', 0, 'S'), slot('turn', 0, 'T'), slot('why_it_matters', 0, 'W'), slot('source', 0, 'X, 1999')]),
      ...slidesForFormat('tips', [slot('tip', 0, 'T')]),
      ...slidesForFormat('recipe', [slot('title', 0, 'R'), slot('ingredient', 0, 'I'), slot('step', 0, 'S')]),
      ...slidesForFormat('myth_fact', [slot('myth', 0, 'M'), slot('partly_true', 0, 'P'), slot('correction', 0, 'C')]),
      ...slidesForFormat('comparison', [slot('question', 0, 'Q'), slot('option_a', 0, 'A'), slot('option_b', 0, 'B'), slot('verdict', 0, 'V')]),
      ...slidesForFormat('origin', [slot('hook', 0, 'H'), slot('before', 0, 'B'), slot('change', 0, 'C'), slot('now', 0, 'N')]),
    ];
    expect(every.length).toBeGreaterThan(10);
    for (const slide of every) expect(CAROUSEL_LAYOUTS, slide.kicker).toContain(slide.layout);
  });

  it('puts the point in the slot the layout actually promotes', () => {
    /*
     * `lead_emphasis` draws `bodyLines[0]` at 86px and the headline small as a
     * label. The first quiz render had them backwards, so the card read
     * "Source: Beccari, 1728" in display type with the answer as a caption.
     * Invisible in the data, obvious on the card.
     */
    const slides = slidesForFormat('quiz', [
      slot('question', 0, 'When?'),
      slot('answer', 0, 'In 1728, by Jacopo Beccari.', 'Beccari, 1728'),
    ]);
    const answer = slides.find((s) => s.layout === 'lead_emphasis')!;
    expect(answer.bodyLines[0]).toContain('1728, by Jacopo Beccari');
    expect(answer.headline).not.toContain('Beccari');
  });

  it('never uses a promoting layout with nothing to promote', () => {
    /* `lead_emphasis` with an empty body falls back to the headline, which
       makes it an expensive `statement`. Better to say `statement`. */
    const every = [
      ...slidesForFormat('quiz', [slot('close', 0, 'How many did you get?')]),
      ...slidesForFormat('tips', [slot('close', 0, 'The first one matters most.')]),
    ];
    for (const slide of every) {
      if (slide.layout === 'lead_emphasis') expect(slide.bodyLines.length, slide.kicker).toBeGreaterThan(0);
    }
  });

  it('returns nothing for a format with no builder, rather than guessing a shape', () => {
    /* A catalogue entry nothing can render is a gap someone needs to see. */
    expect(slidesForFormat('not_a_format', [slot('x', 0, 'y')])).toHaveLength(0);
  });

  it('skips slots the writer did not fill instead of rendering blanks', () => {
    const slides = slidesForFormat('history', [slot('hook', 0, 'Gluten was named in 1728.')]);
    expect(slides).toHaveLength(1);
    expect(slides[0]!.headline).toContain('1728');
  });

  it('can render every format the catalogue declares', async () => {
    /*
     * The two lists are the same set written twice — exactly the shape of
     * gotcha 1. This is the test that catches a format added to one and not
     * the other.
     */
    const { POST_FORMATS } = await import('@halyard/core');
    for (const id of POST_FORMATS) {
      expect(RENDERABLE_FORMATS, `${id} is in the catalogue with no renderer`).toContain(id);
    }
  });
});
