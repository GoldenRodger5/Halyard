/**
 * §520. A researcher sent to the wrong library rejects everything, correctly.
 *
 * Kinolog's first piece — on why people scroll for forty minutes without
 * picking a film — was researched against PubMed, the FDA and King Arthur
 * Baking, because the preferred-domain list was one hard-coded food shelf.
 * Every source came back at 0% term overlap. The researcher was working
 * perfectly; the library could not contain the answer.
 */
import { describe, expect, it } from 'vitest';
import { preferredDomainsFor } from './formatWriter.js';

describe('§520 preferred domains come from the product', () => {
  it('gives a recipe product the food-science shelf', () => {
    const domains = preferredDomainsFor('recipefix');
    expect(domains).toContain('seriouseats.com');
    expect(domains).toContain('usda.gov');
  });

  it('gives a film product film sources, and none of the food ones', () => {
    const domains = preferredDomainsFor('kinolog');
    expect(domains).toContain('themoviedb.org');
    expect(domains).toContain('bfi.org.uk');
    for (const food of ['usda.gov', 'seriouseats.com', 'kingarthurbaking.com', 'fda.gov']) {
      expect(domains, `${food} cannot settle a claim about films`).not.toContain(food);
    }
  });

  it('always keeps the general shelf underneath, for any product', () => {
    for (const product of ['recipefix', 'kinolog', 'a-product-nobody-has-configured']) {
      expect(preferredDomainsFor(product)).toContain('britannica.com');
    }
  });

  it('gives an unknown product general sources only, rather than another product’s', () => {
    const domains = preferredDomainsFor('a-product-nobody-has-configured');
    expect(domains).not.toContain('seriouseats.com');
    expect(domains).not.toContain('themoviedb.org');
    expect(domains.length).toBeGreaterThan(0);
  });
});
