/**
 * §328. The duplicates that actually appeared in Kinolog's Brain.
 */
import { describe, it, expect } from 'vitest';
import { contentOverlap, sameValue } from './model.js';

describe('sameValue', () => {
  it('collapses the three `export` facts', () => {
    /* All three were written, and all three say one thing. */
    expect(sameValue('Kinolog lets users export their data.', 'Users can export their Kinolog data.')).toBe(true);
  });

  it('treats a fact with more detail as the same fact', () => {
    expect(
      sameValue(
        'Kinolog imports Letterboxd history.',
        'Kinolog imports Letterboxd history, including ratings, watch dates, reviews, tags, rewatches, likes and watchlist.',
      ),
    ).toBe(true);
  });

  it('collapses the product_type restatements', () => {
    expect(
      sameValue('Kinolog is a movie diary app.', 'Kinolog is a private movie diary app with recommendations.'),
    ).toBe(true);
  });

  it('keeps genuinely different facts apart', () => {
    /* The point of the rule is dedup, not merging everything about a product. */
    expect(
      sameValue(
        'Kinolog imports Letterboxd history.',
        'Kinolog recommends films using the user’s diary and taste profile.',
      ),
    ).toBe(false);
  });

  it('keeps two different prices apart, which must stay a contradiction', () => {
    /*
     * The most important negative case. Two prices in one slot is a
     * contradiction the reconciler has to see; merging them would hide it.
     */
    expect(sameValue('Plus costs $2.99 a month.', 'Plus costs $4.99 a month.')).toBe(false);
  });

  it('keeps two different limits apart', () => {
    expect(
      sameValue('The free tier imports up to 500 films.', 'The free tier imports up to 100 films.'),
    ).toBe(false);
  });

  it('is unchanged for identical strings', () => {
    expect(sameValue('Same thing.', 'same thing')).toBe(true);
  });
});

describe('contentOverlap', () => {
  it('ignores words that carry no meaning', () => {
    expect(contentOverlap('the export of their data', 'export data')).toBe(1);
  });

  it('is zero for unrelated statements', () => {
    expect(contentOverlap('imports Letterboxd history', 'costs $2.99 monthly')).toBe(0);
  });
});
