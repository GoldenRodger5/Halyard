/**
 * §216. Provenance and licence answer different questions, and RecipeFix is
 * the case that proves it.
 *
 * Every recipe in its Discover catalogue returns a real photograph of the real
 * dish — `provenance: 'product'`, because the product's own API returned it —
 * carrying the note *"Publisher's own og:image — attribute and link back; do
 * not re-host or present as a RecipeFix asset."* Reading provenance alone
 * concludes the picture is free to use. It is not.
 */
import { describe, expect, it } from 'vitest';
import { canEvidence, licenceAllows, type ImageAttribution } from './types.js';
import { publisherOf, toArtifact, type RecipeFixAdaptation } from '../connectors/recipefix.js';

const attribution: ImageAttribution = {
  publisher: 'budgetbytes.com',
  sourceUrl: 'https://www.budgetbytes.com/bruschetta-chicken/',
};

describe('the two questions', () => {
  it('a publisher photo is real evidence and still not ours to burn full-bleed', () => {
    /* Provenance says yes. */
    expect(canEvidence('product')).toBe(true);
    /* Licence says no, for the use that matters. */
    expect(licenceAllows('attribution_required', 'full_bleed', attribution).allowed).toBe(false);
  });

  it('explains that the refusal is a licence decision, not a quality one', () => {
    const decision = licenceAllows('attribution_required', 'full_bleed', attribution);
    expect(decision.reason).toMatch(/re-hosts someone else's photograph/);
    expect(decision.reason).toMatch(/budgetbytes\.com/);
  });

  it('permits the attributed inset, which is what the note actually allows', () => {
    const decision = licenceAllows('attribution_required', 'attributed_inset', attribution);
    expect(decision.allowed).toBe(true);
    expect(decision.requiresVisibleCredit).toBe(true);
    expect(decision.reason).toMatch(/visible credit to budgetbytes\.com/);
  });

  it('refuses an attributed use with nobody to credit', () => {
    expect(licenceAllows('attribution_required', 'attributed_inset', null).allowed).toBe(false);
    expect(
      licenceAllows('attribution_required', 'attributed_inset', {
        publisher: 'budgetbytes.com',
        sourceUrl: '',
      }).allowed,
    ).toBe(false);
  });

  it('lets an owned image do anything', () => {
    expect(licenceAllows('owned', 'full_bleed').allowed).toBe(true);
    expect(licenceAllows('owned', 'full_bleed').requiresVisibleCredit).toBe(false);
  });
});

describe('publisherOf', () => {
  it('takes the host, which is where the link goes', () => {
    expect(publisherOf('https://www.budgetbytes.com/bruschetta-chicken/')).toBe('budgetbytes.com');
    expect(publisherOf('https://sallysbakingaddiction.com/easy-coconut-shrimp/')).toBe(
      'sallysbakingaddiction.com',
    );
  });

  it('invents nothing from an unusable URL', () => {
    expect(publisherOf('not a url')).toBe('');
    expect(publisherOf('')).toBe('');
  });
});

describe('toArtifact carries the photograph and its terms', () => {
  const base: RecipeFixAdaptation = {
    recipeName: 'Bruschetta Chicken',
    sourceUrl: 'https://www.budgetbytes.com/bruschetta-chicken/',
    ingredients: [],
    steps: [],
  };

  it('emits nothing when the payload has no image', () => {
    expect(toArtifact(base).imagery).toBeUndefined();
  });

  it('emits it as product provenance with an attribution licence', () => {
    const artifact = toArtifact({
      ...base,
      sourceImage: {
        url: 'https://www.budgetbytes.com/x.jpg',
        publisher: 'budgetbytes.com',
        note: "Publisher's own og:image — attribute and link back.",
      },
    });
    const image = artifact.imagery![0]!;
    expect(image.provenance).toBe('product');
    expect(image.license).toBe('attribution_required');
    expect(image.attribution).toEqual({
      publisher: 'budgetbytes.com',
      sourceUrl: base.sourceUrl,
    });
    expect(image.role).toBe('hero');
    expect(image.alt).toMatch(/photographed by budgetbytes\.com/);
  });

  it('withholds attribution rather than inventing a publisher', () => {
    const artifact = toArtifact({
      ...base,
      sourceUrl: undefined,
      sourceImage: { url: 'https://x.invalid/a.jpg', publisher: '' },
    });
    const image = artifact.imagery![0]!;
    expect(image.attribution).toBeUndefined();
    /* And with nothing to credit, no use is permitted. */
    expect(licenceAllows(image.license!, 'attributed_inset', image.attribution ?? null).allowed).toBe(
      false,
    );
  });
});
