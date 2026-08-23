/**
 * §158. Captions are legible because the contrast is measured, not because a
 * colour was chosen once and hoped for.
 *
 * The defect this replaces: `color: brand.ink` with a `brand.background`
 * outline, fixed, whatever the composition put behind it. Legible on a cream
 * card; black text with a pale halo over a screen recording of a product.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_CAPTION_CONTRAST,
  captionStyle,
  contrastRatio,
  relativeLuminance,
} from './captionStyle.js';
import { DEFAULT_BRAND } from '../brand.js';

const brand = DEFAULT_BRAND;

describe('contrastRatio', () => {
  it('matches the WCAG reference points', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('is symmetric, because a ratio has no direction', () => {
    expect(contrastRatio('#2A2320', '#FAF8F3')).toBeCloseTo(
      contrastRatio('#FAF8F3', '#2A2320'),
      6,
    );
  });

  it('reads hsl and rgb, which is how brand tokens actually arrive', () => {
    // The seeded RecipeFix background is `hsl(50 20% 97%)`, not a hex string.
    expect(relativeLuminance('hsl(50 20% 97%)')).toBeGreaterThan(0.8);
    expect(relativeLuminance('rgb(0, 0, 0)')).toBeCloseTo(0, 5);
  });
});

describe('captionStyle on a known surface', () => {
  it('clears WCAG AA on the brand background', () => {
    const style = captionStyle(brand, { kind: 'surface', color: brand.background });
    expect(style.contrast).toBeGreaterThanOrEqual(MIN_CAPTION_CONTRAST);
  });

  it('needs no plate when the brand ink already carries it', () => {
    // A cream card does not deserve a letterbox band across it.
    const style = captionStyle(brand, { kind: 'surface', color: brand.background });
    expect(style.scrim).toBeNull();
    expect(style.textShadow).not.toBeNull();
  });

  it('flips to the light token on a dark surface rather than staying black', () => {
    const style = captionStyle(brand, { kind: 'surface', color: '#101014' });
    expect(style.color).toBe(brand.background);
    expect(style.contrast).toBeGreaterThanOrEqual(MIN_CAPTION_CONTRAST);
  });

  it('falls back to a plate when neither brand colour can carry the surface', () => {
    /*
     * A mid-tone surface is the case an outline cannot rescue: ink and paper
     * both land near 4:1 and no amount of halo fixes it.
     */
    const style = captionStyle(brand, { kind: 'surface', color: '#7A7A7A' });
    expect(style.scrim).not.toBeNull();
    expect(style.contrast).toBeGreaterThanOrEqual(MIN_CAPTION_CONTRAST);
  });
});

describe('captionStyle over footage', () => {
  it('always plates, because no ink is readable across every frame', () => {
    const style = captionStyle(brand, { kind: 'media' });
    expect(style.scrim).not.toBeNull();
    expect(style.textShadow).toBeNull();
    expect(style.contrast).toBeGreaterThanOrEqual(MIN_CAPTION_CONTRAST);
  });

  it('inverts the plate on dark footage so it does not become a bright slab', () => {
    const dark = captionStyle(brand, { kind: 'media', meanLuminance: 0.1 });
    const light = captionStyle(brand, { kind: 'media', meanLuminance: 0.9 });
    expect(dark.color).not.toBe(light.color);
    expect(dark.contrast).toBeGreaterThanOrEqual(MIN_CAPTION_CONTRAST);
    expect(light.contrast).toBeGreaterThanOrEqual(MIN_CAPTION_CONTRAST);
  });
});

describe('the guarantee itself', () => {
  it('clears AA for every backdrop across the colour space', () => {
    /*
     * The property that matters. If any backdrop can produce a caption below
     * 4.5:1, the gate will eventually catch it on a rendered frame — and by
     * then it is in a video.
     */
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const color = `rgb(${r}, ${g}, ${b})`;
          const style = captionStyle(brand, { kind: 'surface', color });
          expect(style.contrast, `failed on ${color}`).toBeGreaterThanOrEqual(
            MIN_CAPTION_CONTRAST,
          );
        }
      }
    }
  });

  it('does not invent a colour outside the product’s own palette', () => {
    // Brand fidelity: the treatment may change, the palette may not.
    const palette = [brand.ink, brand.background];
    for (const color of ['#101014', '#7A7A7A', brand.background]) {
      const style = captionStyle(brand, { kind: 'surface', color });
      expect(palette).toContain(style.color);
    }
  });

  it('treats an unparseable token as mid-grey, forcing a plate', () => {
    // Guessing white here yields a style that looks fine and renders invisible.
    const style = captionStyle(brand, { kind: 'surface', color: 'var(--nope)' });
    expect(style.scrim).not.toBeNull();
    expect(style.contrast).toBeGreaterThanOrEqual(MIN_CAPTION_CONTRAST);
  });
});
