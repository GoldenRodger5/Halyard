import type { ProductionProviderId } from './router.js';

/**
 * What the Halyard runtime can actually call, from server-side configuration.
 *
 * A tool connected to the operator's ChatGPT account is not a credential the
 * Halyard worker owns. This function keeps that boundary explicit: provider
 * routing may only select services the deployed Halyard runtime can execute.
 */
export function configuredProductionProviders(
  env: NodeJS.ProcessEnv = process.env,
): ProductionProviderId[] {
  const providers: ProductionProviderId[] = [
    'halyard_capture',
    'asset_library',
    'halyard_render',
    'halyard_audio',
  ];

  if (env.ELEVENLABS_API_KEY?.trim()) providers.push('elevenlabs');
  if (env.HF_API_KEY?.trim()) providers.push('higgsfield');
  if (env.CANVA_ACCESS_TOKEN?.trim() || env.CANVA_API_TOKEN?.trim()) providers.push('canva');
  if (env.DESCRIPT_API_TOKEN?.trim()) providers.push('descript');
  if (env.BLOTATO_API_KEY?.trim()) providers.push('blotato_visual');

  return providers;
}
