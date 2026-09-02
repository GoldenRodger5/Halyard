/**
 * §473. Real pieces this system made, kept so the rules can be judged.
 *
 * ## Why a corpus and not more unit tests
 *
 * Every rule in this codebase was written against a piece that had already gone
 * wrong, and each one was tested against a sentence invented to trip it. That
 * proves a rule *can* fire. It proves nothing about the two things that decide
 * whether a rule is worth having:
 *
 * 1. **Does it catch the real thing?** A rule tuned on a hand-written example
 *    often misses the messier sentence that prompted it.
 * 2. **Is it quiet on good work?** This is the one that actually matters.
 *    `retentionQC`'s own header says it: *"a gate that fails everything is as
 *    useless as one that passes everything, and it is worse, because the first
 *    gets switched off."* A rule can only be shown to be quiet by running it
 *    over work that should pass — and unit tests never contain any.
 *
 * So this is the corpus: **actual output**, verbatim, each entry saying what is
 * wrong with it or that nothing is. Adding a rule means adding the piece that
 * motivated it, and every existing rule then runs over the new piece too.
 *
 * ## The rule this enforces
 *
 * A new rule must catch its own `defects` entry and stay silent on everything
 * marked `clean`. That is a much harder bar than a unit test and it is the bar
 * that stops the failure mode this file exists for — two rules that between
 * them left a short caption with no legal form (§466), which no unit test could
 * have shown because each rule passed its own.
 *
 * ## What belongs here
 *
 * Only text this system actually produced. Not improved, not shortened, not
 * tidied — the value is that it is what happened. A hand-written example is a
 * unit test and belongs beside its rule.
 */

/** One piece as it was generated, and the verdict on it. */
export interface RealPiece {
  /** Short handle used in test names. */
  id: string;
  platform: string;
  format: string;
  /** The caption, verbatim. */
  caption: string;
  /** What was on screen, in order, verbatim. */
  onScreen: string[];
  hashtags: string[];
  /**
   * Rules that *should* fire on this piece, with why in a person's words.
   *
   * A rule listed here and not firing is a regression. A rule firing on a piece
   * that does not list it is a false positive — both are failures, and the
   * second is the more dangerous.
   */
  defects: Array<{ rule: string; because: string }>;
  /**
   * True when this is work that should pass cleanly.
   *
   * The most valuable rows in the file. Without them a rule that fires on
   * everything looks perfect.
   */
  clean?: boolean;
}

export const REAL_PIECES: RealPiece[] = [
  {
    /*
     * The first tips piece that rendered (2026-09-02, TikTok). Every line
     * concrete, the whole unreadable: one cryptic aside per tip, no sentence,
     * no reason to watch, nothing to do. The pictures were good.
     */
    id: 'tips-herbs-caption-as-notes',
    platform: 'tiktok',
    format: 'tips',
    caption: 'Dry leaves last longer\nThe inch is for cut stems.\nLeaf moisture is the weak link.\nBasil is the fridge exception.',
    hashtags: ['freshherbstorage', 'cilantrostorage', 'parsleystorage', 'basilstorage'],
    onScreen: [
      'Keep Herbs Alive Two Weeks',
      'Trim the stems, stand herbs in an inch of water, and keep leaves above the waterline.',
      'Cover loosely with a bag, then refrigerate parsley, cilantro, dill, and mint upright to slow wilting.',
      'Keep basil on the counter, away from cold air, and change water the moment it turns cloudy.',
      'Most important: dry leaves. Any wet leaf can spoil the bunch before stems quit.',
    ],
    defects: [
      { rule: 'structure.fragment_stack', because: 'Four five-word lines and no sentence.' },
      { rule: 'structure.invites_nothing', because: 'No question, no ask, nothing to do.' },
    ],
    clean: false,
  },
  {
    id: 'eggplant-myth',
    platform: 'tiktok',
    format: 'myth_fact',
    caption: 'Salt is not for bitterness\n\nEstablished by BBC Good Food',
    onScreen: [
      'Salting eggplant removes bitterness',
      'Yes, aubergines used to be salted and rinsed to remove bitterness.',
      'Modern varieties are much less bitter; salt mainly helps frying by reducing oil absorption.',
    ],
    hashtags: ['cookingtips', 'eggplant', 'foodmyths', 'recipefix'],
    defects: [
      {
        rule: 'format.two_names_one_thing',
        because: 'Calls it eggplant, then aubergines, four seconds apart, on a piece correcting somebody else.',
      },
      {
        rule: 'claim.vague_authority',
        because: '"Established by" is the language of a finding and BBC Good Food is a recipe site.',
      },
      {
        rule: 'structure.ends_on_a_citation',
        because: 'The last line is provenance, in the one place a reply is earned.',
      },
      { rule: 'structure.invites_nothing', because: 'Nothing for a reader to do.' },
    ],
  },
  {
    id: 'sourdough-history',
    platform: 'tiktok',
    format: 'history',
    caption:
      'Sharp loaf, wrong suspect.\n\nThe acid producers, not the bubble producers, account for the tang.\n\nWikipedia, Sourdough.',
    onScreen: [
      'Yeast is not the sour part.',
      'Most people look at the bubbles and blame the wild yeast in the starter.',
      'The tang comes from lactic-acid bacteria, which can outnumber yeasts about 100 to 1.',
      'So a sharper loaf is often your bacteria speaking, through lactic and acetic acids.',
    ],
    hashtags: ['sourdough', 'breadtok', 'bakingtips', 'foodscience'],
    defects: [
      { rule: 'structure.ends_on_a_citation', because: 'Ends on "Wikipedia, Sourdough."' },
      { rule: 'structure.invites_nothing', because: 'States a fact and stops.' },
    ],
  },
  {
    id: 'pasta-salt',
    platform: 'tiktok',
    format: 'history',
    caption:
      'Underseasoned noodles need timing: 2021 salinity testing points to absorption, not heat.',
    onScreen: [
      'Sauce cannot salt pasta later.',
      'Everyone assumes chefs throw in handfuls so the pot boils hotter.',
      'But salt barely changes boiling at kitchen amounts.',
      'Salt before the pasta goes in, then adjust the sauce later.',
    ],
    hashtags: ['pastatips', 'cookingbasics', 'salt', 'recipefix'],
    defects: [
      {
        rule: 'claim.vague_authority',
        because: '"2021 salinity testing" names no study, no author and no publication.',
      },
      { rule: 'structure.invites_nothing', because: 'No question, no invitation.' },
    ],
  },
  {
    id: 'onion-tips',
    platform: 'tiktok',
    format: 'tips',
    caption:
      'Cold onions cry less\n\nCut cells release fumes.\nCold slows the release.\nLess crushing means less sting.',
    onScreen: [
      'Onions do not have to sting',
      'Chill the onion for 30 minutes before cutting.',
      'Slice with a sharp knife, and avoid crushing the layers.',
      'Set a fan beside the board, blowing fumes away from your face.',
    ],
    hashtags: ['oniontips', 'cookingtips', 'kitchentips', 'mealprep'],
    /**
     * §473. The corpus corrected the hand critique on its first run.
     *
     * This was annotated `structure.caption_echoes_screen` — "the caption
     * restates tips one and two" — and the rule did not fire. Measured, the
     * overlap is 44% against a 66% bar, and reading it again the rule is right
     * and the annotation was wrong: the screen says *chill the onion* and *use
     * a sharp knife*; the caption says **why those work**. That is a caption
     * doing its own job, which is exactly what §450 asks for.
     *
     * Kept as a note because it is the argument for the corpus. A hand critique
     * over four pieces produced a confident wrong call, and running every rule
     * over the real text found it in one pass.
     */
    defects: [{ rule: 'structure.invites_nothing', because: 'Ends on a statement, asking nothing.' }],
  },
  {
    id: 'bread-1266',
    platform: 'instagram',
    format: 'history',
    caption: 'Labels hide tradeoffs: in 1266, wheat prices helped define a legal loaf.',
    onScreen: [
      'Bread was once weighed by law.',
      'The scale protected buyers from skimpy loaves.',
      'In 1266 loaf weight changed with wheat prices under the Assize of Bread and Ale.',
      'Compare the loaf, not the label.',
    ],
    hashtags: ['breadhistory', 'foodhistory', 'bakinghistory', 'RecipeFix'],
    defects: [
      { rule: 'structure.invites_nothing', because: 'Strong piece, and it still asks nothing.' },
    ],
  },

  /*
   * §473. The rows that keep the rules honest.
   *
   * Written to the standard every rule above is meant to produce, so any rule
   * that fires here is firing on work that is doing its job.
   */
  {
    id: 'clean-tiktok-history',
    platform: 'tiktok',
    format: 'history',
    caption:
      'Bread was weighed by law for six hundred years.\n\nThe baker who came up short lost a hand, then later just a fine. Which loaf would you rather buy by weight?',
    onScreen: [
      'Bread was once weighed by law.',
      'The scale protected buyers from skimpy loaves.',
      'In 1266 loaf weight changed with wheat prices.',
      'Compare the loaf, not the label.',
    ],
    hashtags: ['breadhistory', 'breadtok', 'foodhistory', 'RecipeFix'],
    defects: [],
    clean: true,
  },
  {
    id: 'clean-tiktok-myth',
    platform: 'tiktok',
    format: 'myth_fact',
    caption:
      'Searing seals nothing.\n\nThe crust is worth having anyway, and it is the only part of that sentence that survives a thermometer. Who told you the sealing part?',
    onScreen: [
      'Searing seals in the juices',
      'A hard crust really does taste better, which is why the advice stuck.',
      'Moisture leaves a steak throughout cooking, whatever you do first.',
    ],
    hashtags: ['steaktok', 'maillard', 'cookingscience', 'RecipeFix'],
    defects: [],
    clean: true,
  },
];
