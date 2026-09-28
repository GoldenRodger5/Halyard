import { describe, expect, it } from 'vitest';
import { deriveDiscoveryTerms } from './terms.js';

describe('deriveDiscoveryTerms', () => {
  it('derives concise RecipeFix discovery topics from verified Brain slots', () => {
    const terms = deriveDiscoveryTerms([
      {
        id: 'pillar-1',
        category: 'content_pillars',
        key: 'substitution_guides',
        value: 'Ingredient substitution guides with exact ratios and failure modes',
        confidence: 0.75,
      },
      {
        id: 'job-1',
        category: 'jobs_to_be_done',
        key: 'check_recipe_compliance',
        value: 'Check whether a recipe is gluten-free or vegan and identify conflicting ingredients',
        confidence: 0.75,
      },
      {
        id: 'persona-1',
        category: 'personas',
        key: 'gluten_free_cooks',
        value: 'People converting recipes to gluten-free and checking for hidden gluten',
        confidence: 0.75,
      },
      {
        id: 'user-1',
        category: 'users',
        key: 'primary_audience',
        value: 'Home cooks adapting existing recipes for dietary restrictions and allergies',
        confidence: 0.75,
      },
    ]);

    expect(terms.map((term) => term.term)).toEqual([
      'substitution guides',
      'check recipe compliance',
      'gluten free',
      'home adapting recipes dietary restrictions allergies',
    ]);
  });

  it('works unchanged for KinoLog-style product facts', () => {
    const terms = deriveDiscoveryTerms([
      {
        id: 'pillar-movies',
        category: 'content_pillars',
        key: 'movie_recommendation_explainers',
        value: 'Movie recommendation explainers and taste prediction receipts',
        confidence: 0.9,
      },
      {
        id: 'job-pick',
        category: 'jobs_to_be_done',
        key: 'choose_what_to_watch',
        value: 'Pick something to watch based on personal taste rather than generic popularity',
        confidence: 0.85,
      },
      {
        id: 'persona-film',
        category: 'personas',
        key: 'movie_night_planners',
        value: 'People choosing a movie with friends who want a fast confident pick',
        confidence: 0.8,
      },
    ]);

    expect(terms.map((term) => term.term)).toEqual([
      'movie recommendation explainers',
      'choose what watch',
      'movie night planners',
    ]);
    expect(terms.some((term) => /recipe|diet|food/.test(term.term))).toBe(false);
  });

  it('is bounded and ignores Brain categories that should not become trend queries', () => {
    const terms = deriveDiscoveryTerms(
      [
        ...[
          'alpha','bravo','charlie','delta','echo','foxtrot',
          'golf','hotel','india','juliet','kilo','lima',
        ].map((name, index) => ({
          id: `pillar-${index}`,
          category: 'content_pillars',
          key: `topic_${name}_guide`,
          value: `Topic ${name} guide`,
          confidence: 0.8,
        })),
        {
          id: 'pricing',
          category: 'pricing',
          key: 'monthly_price',
          value: '$2.99 per month',
          confidence: 1,
        },
      ],
      8,
    );

    expect(terms).toHaveLength(8);
    expect(terms.some((term) => term.category === 'pricing')).toBe(false);
  });
});
