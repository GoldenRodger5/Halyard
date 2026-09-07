/**
 * §546. The pillars in this file are Kinolog's real, verified ones.
 *
 * Halyard wrote Kinolog a piece of screenwriting advice — "Your third act loses
 * viewers. Cut every scene that only explains the plan." Good advice, aimed at
 * people *making* films, for a product whose verified competitors are
 * Letterboxd, Trakt and SIMKL and whose pillars are all about choosing what to
 * watch tonight. Nothing objected, because nothing read the pillars.
 */
import { describe, expect, it } from 'vitest';

import { pillarFit, isOnPillar } from './pillars.js';

/** Verbatim from `product_facts` where product_id = 'kinolog', status verified. */
const KINOLOG = [
  {
    key: 'choosing_what_to_watch',
    value: 'Choosing what to watch: tonight’s constraints, watchlists, couples and movie-night stalemates.',
  },
  {
    key: 'ai_recommendations',
    value: 'AI recommendations: how recommenders work, when to distrust them and how picks should be explained.',
  },
  { key: 'movie_diary_habit', value: 'Keeping a movie diary users will actually maintain.' },
];

describe('§546 a subject checked against what the product talks about', () => {
  it('refuses the screenwriting piece that shipped', () => {
    const fit = pillarFit('Why the third act of a thriller is where most viewers quit', KINOLOG);
    expect(isOnPillar(fit), fit.because).toBe(false);
    expect(fit.because).toContain('somebody else');
  });

  it('accepts the subjects that were right', () => {
    for (const subject of [
      'How to pick a film in under two minutes',
      'Why you scroll for forty minutes and still do not pick a film',
      'Keeping a movie diary you will actually maintain',
    ]) {
      const fit = pillarFit(subject, KINOLOG);
      expect(isOnPillar(fit), `${subject} — ${fit.because}`).toBe(true);
    }
  });

  it('names the pillar it matched, so the reason is arguable', () => {
    const fit = pillarFit('Watchlists that never get watched', KINOLOG);
    expect(fit.pillar?.key).toBe('choosing_what_to_watch');
    expect(fit.shared).toContain('watchlist');
    expect(fit.because).toContain('choosing_what_to_watch');
  });

  it('matches singular and plural as the same territory', () => {
    expect(isOnPillar(pillarFit('One watchlist, two minutes', KINOLOG))).toBe(true);
    expect(isOnPillar(pillarFit('Two watchlists, one couple', KINOLOG))).toBe(true);
  });

  it('is not fooled by common words alone', () => {
    /* Shares "the", "and", "your" with everything and nothing that matters. */
    expect(isOnPillar(pillarFit('What are the best ways to use your own time', KINOLOG))).toBe(false);
  });

  it('says a product with no pillars has not disagreed, which is different', () => {
    const fit = pillarFit('Anything at all', []);
    expect(isOnPillar(fit)).toBe(false);
    expect(fit.because).toContain('no verified content pillars yet');
    expect(fit.because).not.toContain('somebody else');
  });
});
