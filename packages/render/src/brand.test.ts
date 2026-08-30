/**
 * §337. `products.brand_tokens` is untyped JSON, so it holds whatever was
 * written into it — and two things wrote into it with different conventions.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_BRAND, resolveBrand } from './brand.js';

describe('resolveBrand', () => {
  it('reads the snake_case keys RecipeFix was written with', () => {
    const brand = resolveBrand({ heading_font: 'Instrument Serif', body_font: 'Inter' });
    expect(brand.headingFont).toBe('Instrument Serif');
    expect(brand.bodyFont).toBe('Inter');
  });

  it('reads the camelCase keys the extractor writes', () => {
    /*
     * Kinolog's row, written by §323 from its own stylesheet. This silently
     * fell back to RecipeFix's serif — a product-agnostic pipeline rendering
     * one product in another's typeface, with no error anywhere.
     *
     * Found by a motif pack explaining itself: it said "a near-black ground
     * with Instrument Serif", and Kinolog does not own that face.
     */
    const brand = resolveBrand({ headingFont: 'Bricolage Grotesque', bodyFont: 'Inter' });
    expect(brand.headingFont).toBe('Bricolage Grotesque');
    expect(brand.bodyFont).toBe('Inter');
  });

  it('still falls back when a product genuinely has no face set', () => {
    expect(resolveBrand({ primary: '#000000' }).headingFont).toBe(DEFAULT_BRAND.headingFont);
  });

  it('falls back entirely for a product with no tokens', () => {
    expect(resolveBrand(null)).toEqual(DEFAULT_BRAND);
  });

  it('keeps colours independent of the font-key confusion', () => {
    const brand = resolveBrand({ background: '#141210', ink: '#ede8e0', primary: '#e3b341' });
    expect(brand.background).toBe('#141210');
    expect(brand.primary).toBe('#e3b341');
  });
});
