/**
 * §514. The operator asked for pastry and got baked ziti.
 *
 * `chooseSample` hashed the intent to an index, so the subject picked a recipe
 * deterministically and arbitrarily. The whole carousel was well made and about
 * the wrong dish, which is worse than a random choice because it looks
 * deliberate. These cover the scoring that now decides, and the case where the
 * old behaviour is still the right one.
 */
import { describe, expect, it } from 'vitest';
import { titleMatchScore } from './recipefix.js';

describe('§514 matching a subject to a catalogue title', () => {
  it('scores a title that answers the request, and not the one that does not', () => {
    /* Two shared content words — "shortcrust" and "pastry" — against none. */
    expect(titleMatchScore('Making classic shortcrust pastry dairy-free', 'Shortcrust Pastry')).toBe(2);
    expect(
      titleMatchScore('Making classic shortcrust pastry dairy-free', 'Easy Baked Ziti'),
    ).toBe(0);
  });

  it('prefers the title sharing more of the subject', () => {
    const intent = 'A gluten free chocolate birthday cake';
    expect(titleMatchScore(intent, 'Chocolate Cake')).toBeGreaterThan(
      titleMatchScore(intent, 'Chocolate Mousse'),
    );
  });

  it('ignores the words every recipe title shares', () => {
    /* "classic", "easy", "recipe", "free" would otherwise match everything. */
    expect(titleMatchScore('Classic easy free recipe', 'Classic Easy Free Recipe')).toBe(0);
  });

  it('scores nothing for a generic intent, which is when the hash should decide', () => {
    expect(titleMatchScore('something for the weekend', 'Easy Baked Ziti')).toBe(0);
    expect(titleMatchScore('', 'Shortcrust Pastry')).toBe(0);
  });

  it('is not fooled by a substring that is not a word', () => {
    /* "pastry" must not match "pasta"; a shared prefix is not a shared word. */
    expect(titleMatchScore('shortcrust pastry', 'Baked Pasta')).toBe(0);
  });

  it('survives a missing title rather than throwing', () => {
    expect(titleMatchScore('shortcrust pastry', undefined)).toBe(0);
  });
});
