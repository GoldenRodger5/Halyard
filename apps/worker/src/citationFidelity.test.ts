/**
 * §400. The gate that abandoned the first briefed quiz.
 *
 * `matchesResearchedFact` demanded a third of the researched fact's words
 * appear in a single slot. A quiz question that shares a third of the fact's
 * words has given away its own answer, so the rule could only be satisfied by
 * bad writing — and it refused a real piece three times before abandoning it.
 *
 * Both directions matter here. Loosening it until quizzes pass would remove the
 * only thing standing between a checked source and a post that misrepresents
 * it, so the fabrication cases are asserted as hard as the good ones.
 */
import { describe, expect, it } from 'vitest';
import { matchesResearchedFact } from './formatWriter.js';

const BECCARI =
  'Jacopo Beccari isolated gluten in 1728 by washing dough until only the protein remained';

describe('a citation is honoured by the slots that cite it', () => {
  it('accepts a question and its answer taken together', () => {
    /* Exactly the piece that was abandoned. */
    const together = 'What year was gluten first identified? 1728';
    expect(matchesResearchedFact(together, BECCARI)).toBe(true);
  });

  it('accepts a terse answer that is only the specific', () => {
    /* "1728" is the citation being honoured. The grammar around it is writing. */
    expect(matchesResearchedFact('1728', BECCARI)).toBe(true);
  });

  it('refuses text that carries none of the fact’s specifics', () => {
    /*
     * The thing the gate exists for: cites a checked source, says something
     * else. No year, no name — nothing the source pinned down.
     */
    expect(
      matchesResearchedFact('Gluten was discovered by accident in a French bakery', BECCARI),
    ).toBe(false);
  });

  it('refuses a wrong number even when the shape is right', () => {
    /* A confident, well-formed, wrong answer is the most dangerous output. */
    expect(matchesResearchedFact('What year was gluten identified? 1892', BECCARI)).toBe(false);
  });

  it('accepts a proper noun as the specific', () => {
    expect(matchesResearchedFact('Who isolated it? Beccari did.', BECCARI)).toBe(true);
  });

  it('falls back to wording when the fact pins nothing down', () => {
    /*
     * A qualitative claim has no number and no name, so wording is all there is
     * to go on and the original overlap rule still applies.
     */
    const qualitative = 'hydration rather than flour choice determines whether the crumb sets';
    expect(
      matchesResearchedFact('Hydration, not flour choice, is what makes the crumb set', qualitative),
    ).toBe(true);
    expect(matchesResearchedFact('Use a bigger tin and bake it longer', qualitative)).toBe(false);
  });

  it('refuses an empty fact rather than accepting anything', () => {
    expect(matchesResearchedFact('anything at all', '')).toBe(false);
  });

  it('does not treat a sentence-leading capital as a proper noun', () => {
    /*
     * Otherwise the first word of every fact becomes a "specific" and any text
     * repeating it passes — which would gut the check.
     */
    const fact = 'Hydration is the dominant variable in gluten-free crumb structure';
    expect(matchesResearchedFact('Hydration matters', fact)).toBe(false);
  });
});
