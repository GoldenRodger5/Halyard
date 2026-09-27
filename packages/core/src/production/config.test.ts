import { describe, expect, it } from 'vitest';
import { configuredProductionProviders } from './config.js';

describe('configuredProductionProviders', () => {
  it('always exposes Halyard-owned deterministic production', () => {
    expect(configuredProductionProviders({} as NodeJS.ProcessEnv)).toEqual([
      'halyard_capture',
      'asset_library',
      'halyard_render',
      'halyard_audio',
    ]);
  });

  it('only exposes external providers whose server credentials exist', () => {
    expect(
      configuredProductionProviders({
        ELEVENLABS_API_KEY: 'voice',
        HF_API_KEY: 'video',
        CANVA_ACCESS_TOKEN: 'design',
        DESCRIPT_API_TOKEN: 'edit',
        BLOTATO_API_KEY: 'transport',
      } as NodeJS.ProcessEnv),
    ).toEqual([
      'halyard_capture',
      'asset_library',
      'halyard_render',
      'halyard_audio',
      'elevenlabs',
      'higgsfield',
      'canva',
      'descript',
      'blotato_visual',
    ]);
  });

  it('does not expose Higgsfield from obsolete credential names', () => {
    expect(
      configuredProductionProviders({ HF_API_KEY_ID: 'id-only' } as NodeJS.ProcessEnv),
    ).not.toContain('higgsfield');
    expect(
      configuredProductionProviders({ HF_CREDENTIALS: 'old-combined-shape' } as NodeJS.ProcessEnv),
    ).not.toContain('higgsfield');
    expect(
      configuredProductionProviders({ HF_API_KEY: 'complete-copied-key' } as NodeJS.ProcessEnv),
    ).toContain('higgsfield');
  });
});
