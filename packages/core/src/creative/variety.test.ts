import { describe, expect, it } from 'vitest';
import {
  adaptVariationForPlatform,
  creativeVariationFor,
  FAMILY_VARIATIONS,
  variationKey,
} from './variety.js';

describe('creative variety', () => {
  it('rotates materially different shapes inside every content family', () => {
    for (const family of Object.keys(FAMILY_VARIATIONS) as Array<keyof typeof FAMILY_VARIATIONS>) {
      const count = FAMILY_VARIATIONS[family].length;
      const shapes = Array.from({ length: count }, (_, i) =>
        variationKey(creativeVariationFor(family, i)),
      );
      expect(new Set(shapes).size, family).toBe(count);
    }
  });

  it('avoids the two most recent treatments when another family option exists', () => {
    const selected = creativeVariationFor('teach', 0, ['how_to', 'myth_fact']);
    expect(['how_to', 'myth_fact']).not.toContain(selected.treatment);
  });

  it('keeps text-native destinations text-native instead of forcing media', () => {
    const base = creativeVariationFor('transformation', 0);
    const x = adaptVariationForPlatform(base, 'x', 'text');
    const threads = adaptVariationForPlatform(base, 'threads', 'text');

    for (const v of [x, threads]) {
      expect(v.mediaMode).toBe('text_native');
      expect(v.audioMode).toBe('text_only');
      expect(v.openingStyle).toBe('question_first');
      expect(v.captionJob).toBe('debate');
    }
  });

  it('makes Pinterest a search/save utility rather than a cropped social card', () => {
    const pin = adaptVariationForPlatform(
      creativeVariationFor('teach', 3),
      'pinterest',
      'pin',
    );
    expect(pin.mediaMode).toBe('search_utility');
    expect(pin.openingStyle).toBe('search_answer');
    expect(pin.captionJob).toBe('search');
    expect(pin.audioMode).toBe('text_only');
  });

  it('adapts one video concept differently for TikTok, Reels and Shorts', () => {
    const base = creativeVariationFor('transformation', 2);
    const tiktok = adaptVariationForPlatform(base, 'tiktok', 'video');
    const reels = adaptVariationForPlatform(base, 'instagram', 'video');
    const shorts = adaptVariationForPlatform(base, 'youtube', 'video');

    expect(tiktok.openingStyle).toBe('motion_first');
    expect(tiktok.captionJob).toBe('debate');
    expect(reels.captionJob).toBe('save');
    expect(shorts.openingStyle).toBe('search_answer');
    expect(shorts.captionJob).toBe('search');
  });

  it('turns carousel/image executions into designed static work without mutating treatment', () => {
    const base = creativeVariationFor('teach', 0);
    const carousel = adaptVariationForPlatform(base, 'instagram', 'carousel');
    expect(carousel.treatment).toBe(base.treatment);
    expect(carousel.mediaMode).toBe('designed_static');
    expect(carousel.audioMode).toBe('text_only');
    expect(carousel.captionJob).toBe('save');
  });
});
