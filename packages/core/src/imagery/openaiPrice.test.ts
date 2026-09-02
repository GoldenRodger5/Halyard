import { describe, expect, it } from 'vitest';
import { DEFAULT_IMAGE_QUALITY, imagePriceUsd, imageQualityFrom } from './openai.js';

describe('§494 image price', () => {
  it('defaults to medium, and medium portrait is a quarter of high', () => {
    expect(DEFAULT_IMAGE_QUALITY).toBe('medium');
    expect(imagePriceUsd('medium', '1024x1536')).toBeLessThan(imagePriceUsd('high', '1024x1536') / 3.5);
  });
  it('reads IMAGE_QUALITY and ignores nonsense', () => {
    expect(imageQualityFrom({ IMAGE_QUALITY: 'high' } as NodeJS.ProcessEnv)).toBe('high');
    expect(imageQualityFrom({ IMAGE_QUALITY: 'ultra' } as NodeJS.ProcessEnv)).toBe('medium');
  });
});
