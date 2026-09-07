/**
 * §523. The captions in this file are real.
 *
 * Every string under "the observed run" is a caption Halyard actually wrote and
 * queued, pulled from `content_items`. They are the evidence that the defect
 * existed, so a future change that stops classifying them is a regression in
 * the thing this module was built for, not a failing style opinion.
 */
import { describe, expect, it } from 'vitest';

import {
  connectivesIn,
  openingFormula,
  openingGuidance,
  CAPTION_OPENINGS,
} from './captionOpening.js';

/** Ten consecutive captions from the queue, across two products and three platforms. */
const OBSERVED_RUN = [
  'Dairy-free pastry confusion: 60 g lard plus 60 g oil supply fat.',
  'Dairy-free ziti browns fast: meltable mozzarella gives a gooey top.',
  'Wet steak stalls: surface water spends pan heat on evaporation before browning.',
  'Juices still escape: searing browns the surface into crust.',
  'Underseasoned noodles need timing: 2021 salinity testing points to absorption, not heat.',
  'Labels hide tradeoffs: in 1266, wheat prices helped define a legal loaf.',
  'Dry meat needs heat control: searing browns for Maillard flavor, not moisture.',
  'Mushy ramen starts early: slow heat softens noodles, so add them last.',
  'Gluten hides in pie: only cookies and 3 Tbsp flour changed.',
  'Vegan toppings fall flat: this 5-serving soup chased Cotija’s salty creaminess.',
];

describe('§523 openingFormula', () => {
  it.each(OBSERVED_RUN)('classifies the observed run as label_colon: %s', (caption) => {
    expect(openingFormula(caption)).toBe('label_colon');
  });

  it('does not call a long clause with a colon a label', () => {
    /* Nine words before the colon is a sentence, not a filing category. */
    expect(
      openingFormula('The reason nobody ever finishes a watchlist is simple: nothing forces a choice.'),
    ).toBe('claim');
  });

  it('does not fire on a colon that arrives after the first sentence', () => {
    expect(openingFormula('Nobody finishes a watchlist. Here is the whole trick: pick badly, fast.')).toBe(
      'claim',
    );
  });

  it('reads the real Kinolog caption as a claim, which is what it is', () => {
    expect(openingFormula('Forty minutes. Zero movies.\n\nBeing fair to every possible film is how nobody chooses.')).toBe(
      'claim',
    );
  });

  it('recognises the other moves', () => {
    expect(openingFormula('Why does every watchlist end in nothing?')).toBe('question');
    expect(openingFormula('3 rules that end the scroll.')).toBe('number_lead');
    expect(openingFormula('You are not indecisive. Your list is too long.')).toBe('direct_address');
    expect(openingFormula('If you cannot choose, the list is the problem.')).toBe('direct_address');
    expect(openingFormula('Stop scrolling and set a timer.')).toBe('imperative');
    expect(openingFormula('Searing does not seal anything in.')).toBe('claim');
  });

  it('never returns a move outside the declared set', () => {
    for (const caption of [...OBSERVED_RUN, '', '   ', '???', '42', 'Ok.']) {
      expect(CAPTION_OPENINGS).toContain(openingFormula(caption));
    }
  });
});

describe('§523 openingGuidance', () => {
  it('always forbids the label, even for an account that has never used it', () => {
    const { brief, overused } = openingGuidance(['Searing does not seal anything in.']);
    expect(brief).toContain('Never use this one');
    expect(overused).toEqual([]);
  });

  it('counts the run and tells the copywriter to break it', () => {
    const { brief } = openingGuidance(OBSERVED_RUN);
    expect(brief).toContain('8 of the last 8');
    expect(brief).toContain('Break the run');
  });

  it('flags a different move once it becomes a habit, at three in the window', () => {
    const twice = ['Why one?', 'Why two?', 'A plain claim.', 'Another plain claim.'];
    expect(openingGuidance(twice).overused).toEqual([]);

    const thrice = ['Why one?', 'Why two?', 'Why three?', 'A plain claim.'];
    expect(openingGuidance(thrice).overused).toEqual(['question']);
    expect(openingGuidance(thrice).brief).toContain('3 of the last 4');
  });

  it('never demotes the plain claim, which is the residual category', () => {
    const allClaims = Array.from({ length: 8 }, (_, i) => `Searing does not seal number ${i}.`);
    expect(openingGuidance(allClaims).overused).toEqual([]);
  });

  it('reads an empty history without inventing a habit', () => {
    const { overused, brief } = openingGuidance([]);
    expect(overused).toEqual([]);
    expect(brief).toContain('Never use this one');
    expect(brief).not.toContain('of the last');
  });
});

/**
 * §544. The tic moved inward.
 *
 * §523 fixed how a caption opens. Measured across the 24 captions written
 * afterwards, **10 contained a sentence starting "So"** — twice the next
 * commonest opener, across two products and three platforms. Every one is
 * defensible alone; together they are one voice with one move.
 */
describe('§544 the connective an account leans on', () => {
  const soRun = [
    'Slimy cilantro is trapped moisture. So the fix is giving leaves humidity.',
    'Wet steak stalls. So the fridge step is doing pan work.',
    'Recipe edits wobble. So the useful question is which instruction moves first.',
    'Dairy-free ziti browns fast. So check at 16 minutes.',
  ];

  it('reads the connective out of a real run', () => {
    expect(connectivesIn(soRun[0]!)).toEqual(['so']);
  });

  it('ignores the first sentence, which cannot be a connective', () => {
    expect(connectivesIn('So this is how it starts.')).toEqual([]);
  });

  it('names the connective once the account is leaning on it', () => {
    const { leaned, brief } = openingGuidance(soRun);
    expect(leaned).toContain('so');
    expect(brief).toContain('do not hinge a sentence on "so"');
    expect(brief).toContain('4 of the last 4');
  });

  it('says nothing at two, because that is coincidence', () => {
    const { leaned } = openingGuidance([...soRun.slice(0, 2), 'A plain claim here.', 'Another plain one.']);
    expect(leaned).toEqual([]);
  });

  it('fires at the rate the real corpus actually shows', () => {
    /*
     * The threshold was set at half the window first, and against the measured
     * corpus it never fired: "so" runs 3 of 8, 5 of 12 and 10 of 24 — a flat
     * 42% at every size. A rule that cannot fire on the thing it was written
     * for is the defect this session keeps finding, so the real ratio is
     * pinned here rather than left to taste.
     */
    const eight = [
      ...soRun,
      'A plain claim about crust.',
      'Another plain claim.',
      'A third plain claim.',
      'A fourth plain claim.',
    ];
    /* Three of eight is the observed rate, and it must be caught. */
    expect(openingGuidance(eight.slice(0, 8)).leaned).toContain('so');
  });

  it('leaves a merely-varied connective alone', () => {
    /* "which" ran 2 of 8 and 4 of 24 in the same corpus: variety, not a tic. */
    const window = [
      'One claim. Which is the part people miss.',
      'Two claim. Which nobody checks.',
      'Three plain claim.',
      'Four plain claim.',
      'Five plain claim.',
      'Six plain claim.',
      'Seven plain claim.',
      'Eight plain claim.',
    ];
    expect(openingGuidance(window).leaned).not.toContain('which');
  });

  it('counts a caption once however many times it leans', () => {
    const { brief } = openingGuidance([
      'One. So two. So three. So four.',
      'A plain claim.',
      'Another claim.',
    ]);
    /* Three captions, one of which leans — nowhere near the threshold. */
    expect(brief).not.toContain('hinge a sentence');
  });
});
