import { describe, expect, it } from 'vitest';
import { routeProduction, type ProductionProviderId } from './router.js';
import type { ProductionRequirement } from '../creative/package.js';

const all: ProductionProviderId[] = [
  'halyard_capture',
  'asset_library',
  'higgsfield',
  'canva',
  'halyard_render',
  'elevenlabs',
  'descript',
  'halyard_audio',
  'blotato_visual',
];

function req(
  id: string,
  capability: ProductionRequirement['capability'],
  extra: Partial<ProductionRequirement> = {},
): ProductionRequirement {
  return { id, capability, required: true, ...extra };
}

describe('ProductionRouter', () => {
  it('routes truth-critical product proof only to real capture', () => {
    const recipe = routeProduction(
      [req('proof', 'real_product_capture', { truthCritical: true })],
      { mode: 'production', configuredProviders: all, calibratedProviders: ['higgsfield'] },
    );
    expect(recipe.ready).toBe(true);
    expect(recipe.steps[0]).toMatchObject({ provider: 'halyard_capture', truthCritical: true });
  });

  it('allows Higgsfield as generated source footage during calibration and forces review', () => {
    const recipe = routeProduction(
      [req('broll', 'generated_broll')],
      { mode: 'calibration', configuredProviders: ['higgsfield', 'blotato_visual'] },
    );
    expect(recipe.ready).toBe(true);
    expect(recipe.steps[0]).toMatchObject({ provider: 'higgsfield', humanReviewRequired: true });
    expect(recipe.humanReviewRequired).toBe(true);
  });

  it('refuses uncalibrated generative media in production mode', () => {
    const recipe = routeProduction(
      [req('broll', 'generated_broll')],
      { mode: 'production', configuredProviders: ['higgsfield'] },
    );
    expect(recipe.ready).toBe(false);
    expect(recipe.refusals[0]?.reason).toContain('not passed visual calibration');
  });

  it('calibrates generative providers per capability rather than globally', () => {
    const recipe = routeProduction(
      [req('broll', 'generated_broll'), req('presenter', 'generated_presenter')],
      {
        mode: 'production',
        configuredProviders: ['higgsfield'],
        calibratedCapabilities: [{ provider: 'higgsfield', capability: 'generated_broll' }],
      },
    );
    expect(recipe.steps).toEqual([
      expect.objectContaining({ capability: 'generated_broll', provider: 'higgsfield' }),
    ]);
    expect(recipe.refusals).toEqual([
      expect.objectContaining({ capability: 'generated_presenter' }),
    ]);
    expect(recipe.ready).toBe(false);
  });

  it('uses Higgsfield in production after calibration', () => {
    const recipe = routeProduction(
      [req('broll', 'generated_broll')],
      {
        mode: 'production',
        configuredProviders: ['higgsfield', 'blotato_visual'],
        calibratedProviders: ['higgsfield'],
      },
    );
    expect(recipe.ready).toBe(true);
    expect(recipe.steps[0]?.provider).toBe('higgsfield');
  });

  it('prefers Canva for a branded carousel but falls back to deterministic Halyard render', () => {
    const withCanva = routeProduction(
      [req('carousel', 'branded_carousel')],
      { mode: 'production', configuredProviders: ['canva', 'halyard_render'] },
    );
    expect(withCanva.steps[0]?.provider).toBe('canva');

    const withoutCanva = routeProduction(
      [req('carousel', 'branded_carousel')],
      { mode: 'production', configuredProviders: ['halyard_render'] },
    );
    expect(withoutCanva.steps[0]?.provider).toBe('halyard_render');
  });

  it('routes narration and final assembly to specialist deterministic stages', () => {
    const recipe = routeProduction(
      [req('voice', 'synthetic_narration'), req('edit', 'final_video_assembly')],
      { mode: 'production', configuredProviders: ['elevenlabs', 'halyard_render'] },
    );
    expect(recipe.ready).toBe(true);
    expect(recipe.steps.map((step) => step.provider)).toEqual(['elevenlabs', 'halyard_render']);
  });

  it('honours a provider pin only when it still satisfies capability policy', () => {
    const recipe = routeProduction(
      [req('carousel', 'branded_carousel', { providerPin: 'halyard_render' })],
      { mode: 'production', configuredProviders: ['canva', 'halyard_render'] },
    );
    expect(recipe.steps[0]?.provider).toBe('halyard_render');
  });

  it('keeps optional missing capabilities from blocking the whole recipe', () => {
    const recipe = routeProduction(
      [
        { id: 'optional-descript', capability: 'transcript_edit', required: false },
        req('edit', 'final_video_assembly'),
      ],
      { mode: 'production', configuredProviders: ['halyard_render'] },
    );
    expect(recipe.ready).toBe(true);
    expect(recipe.refusals).toHaveLength(1);
    expect(recipe.steps[0]?.provider).toBe('halyard_render');
  });
});
