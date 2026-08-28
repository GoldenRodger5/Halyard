/**
 * §213. Generated imagery may illustrate. It may never evidence.
 *
 * This is the file that holds that line, and the tests are written as attacks
 * on it rather than as demonstrations of it: every one asks whether a picture
 * of somebody's software could get out.
 */
import { describe, expect, it } from 'vitest';
import {
  EVIDENTIAL_ROLES,
  FabricationRefused,
  assertIllustrative,
  canEvidence,
  imageAllowedForRole,
} from './types.js';
import { OpenAiImageClient } from './openai.js';
import { runCreativeQC } from '../qc/creativeQC.js';

describe('assertIllustrative', () => {
  it('allows atmosphere', () => {
    for (const prompt of [
      'A rustic loaf of sourdough on a floured board, warm morning light',
      'Steam rising from a cast-iron pan, shallow depth of field',
      'Overhead of scattered flour and a rolling pin on dark wood',
    ]) {
      expect(() => assertIllustrative(prompt)).not.toThrow();
    }
  });

  it('refuses anything that reaches for the product', () => {
    for (const prompt of [
      'A screenshot of the recipe app showing swapped ingredients',
      'A clean mobile app interface with a Save button',
      'A dashboard showing nutrition data',
      'A mockup of the settings page',
      'A browser window with the website open',
    ]) {
      expect(() => assertIllustrative(prompt), prompt).toThrow(FabricationRefused);
    }
  });

  it('explains why, rather than just failing', () => {
    try {
      assertIllustrative('a screenshot of the app');
      throw new Error('should have refused');
    } catch (e) {
      expect((e as Error).message).toMatch(/invents software that does not exist/);
    }
  });

  it('refuses before the provider spends anything', async () => {
    let called = false;
    const client = new OpenAiImageClient({
      apiKey: 'k',
      fetchImpl: (async () => {
        called = true;
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
    });
    await expect(
      client.generate({ prompt: 'a screenshot of our app', aspectRatio: '9:16', alt: 'x' }),
    ).rejects.toThrow(FabricationRefused);
    expect(called, 'the provider was called before the refusal').toBe(false);
  });
});

describe('provenance', () => {
  it('lets the product, a capture and a human back a claim', () => {
    expect(canEvidence('product')).toBe(true);
    expect(canEvidence('captured')).toBe(true);
    expect(canEvidence('operator')).toBe(true);
  });

  it('never lets a model back one', () => {
    expect(canEvidence('generated')).toBe(false);
  });

  it('keeps generated imagery out of every evidential role', () => {
    for (const role of EVIDENTIAL_ROLES) {
      expect(imageAllowedForRole('generated', role), role).toBe(false);
    }
  });

  it('allows it in decorative roles, which is the whole point', () => {
    for (const role of ['hook', 'item', 'step', 'result', 'cta']) {
      expect(imageAllowedForRole('generated', role), role).toBe(true);
    }
  });
});

describe('the gate repeats the check against the artifact', () => {
  const base = {
    creativeType: 'how_to',
    platform: 'tiktok',
    footageAvailable: false,
  };

  it('fails a generated image standing where proof belongs', () => {
    const result = runCreativeQC({
      ...base,
      beats: [
        { role: 'hook', emphasis: 'quick', wordCount: 5 },
        { role: 'proof', emphasis: 'hold', wordCount: 8, imageProvenance: 'generated' },
        { role: 'step', emphasis: 'normal', wordCount: 6 },
      ],
    });
    expect(result.passed).toBe(false);
    const finding = result.findings.find((f) => f.rule === 'creative.fabricated_evidence')!;
    expect(finding.severity).toBe('error');
    expect(finding.correction).toBe('replace_fabricated_image');
    expect(finding.beatIndex).toBe(1);
  });

  it('permits the same image behind a hook', () => {
    const result = runCreativeQC({
      ...base,
      beats: [
        { role: 'hook', emphasis: 'quick', wordCount: 5, imageProvenance: 'generated' },
        { role: 'step', emphasis: 'normal', wordCount: 8 },
        { role: 'result', emphasis: 'hold', wordCount: 6 },
      ],
    });
    expect(result.findings.some((f) => f.rule === 'creative.fabricated_evidence')).toBe(false);
  });

  it('permits a real product image where proof belongs', () => {
    const result = runCreativeQC({
      ...base,
      beats: [
        { role: 'hook', emphasis: 'quick', wordCount: 5 },
        { role: 'proof', emphasis: 'hold', wordCount: 8, imageProvenance: 'product' },
        { role: 'step', emphasis: 'normal', wordCount: 6 },
      ],
    });
    expect(result.findings.some((f) => f.rule === 'creative.fabricated_evidence')).toBe(false);
  });
});
