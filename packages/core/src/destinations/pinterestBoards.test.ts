/**
 * Board routing.
 *
 * Pinterest treats the board as a classification, so filing a dairy-free
 * adaptation under "Gluten-Free Recipes" is not a cosmetic error — it is a
 * wrong answer given to a search engine. These tests are mostly about the
 * routing being *specific*, and about refusing rather than guessing.
 */
import { describe, expect, it } from 'vitest';
import { chooseBoard, deriveBoardKeywords, type PinterestBoard } from './pinterestBoards.js';

/** The real boards on the RecipeFix account. */
const BOARDS: PinterestBoard[] = [
  { boardId: '…085', name: 'Gluten-Free Recipes' },
  { boardId: '…087', name: 'Dairy-Free Recipes' },
  { boardId: '…088', name: 'Vegan Substitutions' },
  { boardId: '…090', name: 'High-Protein Recipes' },
  { boardId: '…091', name: 'Ingredient Substitutions', isDefault: true },
];

describe('deriveBoardKeywords', () => {
  it('drops the word every board shares', () => {
    // "Recipes" would match every post ever written.
    expect(deriveBoardKeywords('Gluten-Free Recipes')).not.toContain('recipes');
  });

  it('matches the hyphenated, unhyphenated and spaced forms', () => {
    const terms = deriveBoardKeywords('Gluten-Free Recipes');
    expect(terms).toContain('gluten-free');
    expect(terms).toContain('glutenfree');
    expect(terms).toContain('gluten free');
  });

  it('knows the shorthands a post uses and a board name never does', () => {
    expect(deriveBoardKeywords('Gluten-Free Recipes')).toContain('gf');
    expect(deriveBoardKeywords('Dairy-Free Recipes')).toContain('lactose');
    expect(deriveBoardKeywords('Vegan Substitutions')).toContain('plant-based');
  });

  it('matches a multi-word name as a phrase as well as separately', () => {
    expect(deriveBoardKeywords('Ingredient Substitutions')).toContain('ingredient substitutions');
  });
});

describe('chooseBoard', () => {
  it('files a pin by its hashtag', () => {
    const choice = chooseBoard(BOARDS, { hashtags: ['glutenfree', 'baking'] });
    expect(choice.boardId).toBe('…085');
    expect(choice.reason).toContain('Gluten-Free Recipes');
  });

  it('files a pin by its body when there are no hashtags', () => {
    const choice = chooseBoard(BOARDS, {
      body: 'Swapping butter for oil in a dairy-free loaf changes the crumb.',
    });
    expect(choice.boardId).toBe('…087');
  });

  it('prefers the more specific board when two match', () => {
    // "Vegan Substitutions" and "Ingredient Substitutions" both match a vegan
    // swap. The vegan one is the better answer to give a search index.
    const choice = chooseBoard(BOARDS, {
      hashtags: ['vegan'],
      body: 'A substitution that works: aquafaba for egg white.',
    });
    expect(choice.boardId).toBe('…088');
  });

  it('reads the artifact when the copy does not say it outright', () => {
    const choice = chooseBoard(BOARDS, {
      body: 'The crumb held together this time.',
      artifact: { adaptation: { diet: 'gluten-free' } },
    });
    expect(choice.boardId).toBe('…085');
  });

  it('does not fire on a substring of an unrelated word', () => {
    // "gf" inside "gforce" is not a coeliac signal.
    const choice = chooseBoard([{ boardId: 'b1', name: 'Gluten-Free Recipes' }], {
      body: 'The gforce of a stand mixer is not the problem here.',
    });
    expect(choice.boardId).toBeNull();
  });

  it('falls back to the default board and says the placement was generic', () => {
    const choice = chooseBoard(BOARDS, { body: 'A note about oven thermometers.' });
    expect(choice.boardId).toBe('…091');
    expect(choice.reason).toContain('default');
    // Pinterest ranks on the board, so a generic placement is a real cost and
    // the operator is told rather than left to notice.
    expect(choice.reason).toContain('rank');
  });

  it('refuses when there are no boards at all, and says what to do', () => {
    const choice = chooseBoard([], { hashtags: ['glutenfree'] });
    expect(choice.boardId).toBeNull();
    expect(choice).toMatchObject({ problem: 'no_boards' });
    expect(choice.reason).toContain('create at least one board');
  });

  it('refuses when nothing matches and no default exists, naming the boards', () => {
    const noDefault = BOARDS.map((board) => ({ ...board, isDefault: false }));
    const choice = chooseBoard(noDefault, { body: 'A note about oven thermometers.' });
    expect(choice.boardId).toBeNull();
    expect(choice).toMatchObject({ problem: 'no_match' });
    expect(choice.reason).toContain('Gluten-Free Recipes');
  });

  it('honours explicit match tags over the name', () => {
    const boards: PinterestBoard[] = [
      { boardId: 'b1', name: 'Weeknight', matchTags: ['quick', '30-minute'] },
      { boardId: 'b2', name: 'Gluten-Free Recipes' },
    ];
    expect(chooseBoard(boards, { body: 'A quick one for a Tuesday.' }).boardId).toBe('b1');
  });

  it('reports which terms it matched, so a wrong route is debuggable', () => {
    const choice = chooseBoard(BOARDS, { hashtags: ['dairyfree'] });
    expect(choice).toMatchObject({ matched: expect.arrayContaining(['dairyfree']) });
  });
});
