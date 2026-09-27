import type { ProductionCapability, ProductionRequirement } from '../creative/package.js';

export const PRODUCTION_PROVIDERS = [
  'halyard_capture',
  'asset_library',
  'higgsfield',
  'canva',
  'halyard_render',
  'elevenlabs',
  'descript',
  'halyard_audio',
  'blotato_visual',
] as const;
export type ProductionProviderId = (typeof PRODUCTION_PROVIDERS)[number];

export interface ProductionProviderProfile {
  id: ProductionProviderId;
  capabilities: ProductionCapability[];
  /** Synthetic visual generation, which must be calibrated before production automation. */
  generativeVisual: boolean;
  /** May this provider satisfy a truth-critical visual/media requirement? */
  truthEligible: boolean;
  deterministic: boolean;
  qualityTier: 1 | 2 | 3;
  costTier: 0 | 1 | 2 | 3;
}

export const DEFAULT_PRODUCTION_PROVIDERS: ProductionProviderProfile[] = [
  {
    id: 'halyard_capture',
    capabilities: ['real_product_capture'],
    generativeVisual: false,
    truthEligible: true,
    deterministic: true,
    qualityTier: 3,
    costTier: 0,
  },
  {
    id: 'asset_library',
    capabilities: ['supplied_media'],
    generativeVisual: false,
    truthEligible: true,
    deterministic: true,
    qualityTier: 3,
    costTier: 0,
  },
  {
    id: 'higgsfield',
    capabilities: ['generated_broll', 'generated_presenter'],
    generativeVisual: true,
    truthEligible: false,
    deterministic: false,
    qualityTier: 3,
    costTier: 2,
  },
  {
    id: 'canva',
    capabilities: ['branded_static', 'branded_carousel', 'final_static_render', 'thumbnail'],
    generativeVisual: false,
    truthEligible: false,
    deterministic: true,
    qualityTier: 3,
    costTier: 1,
  },
  {
    id: 'halyard_render',
    capabilities: [
      'branded_static',
      'branded_carousel',
      'motion_graphics',
      'final_video_assembly',
      'final_static_render',
      'caption_burnin',
      'thumbnail',
    ],
    generativeVisual: false,
    truthEligible: false,
    deterministic: true,
    qualityTier: 3,
    costTier: 0,
  },
  {
    id: 'elevenlabs',
    capabilities: ['synthetic_narration'],
    generativeVisual: false,
    truthEligible: false,
    deterministic: false,
    qualityTier: 3,
    costTier: 1,
  },
  {
    id: 'descript',
    capabilities: ['transcript_edit'],
    generativeVisual: false,
    truthEligible: false,
    deterministic: false,
    qualityTier: 3,
    costTier: 1,
  },
  {
    id: 'halyard_audio',
    capabilities: ['founder_audio', 'music_bed', 'sound_effects'],
    generativeVisual: false,
    truthEligible: true,
    deterministic: true,
    qualityTier: 2,
    costTier: 0,
  },
  {
    id: 'blotato_visual',
    capabilities: ['generated_broll', 'generated_presenter', 'branded_static', 'branded_carousel'],
    generativeVisual: true,
    truthEligible: false,
    deterministic: false,
    qualityTier: 1,
    costTier: 2,
  },
];

const DEFAULT_ORDER: Partial<Record<ProductionCapability, ProductionProviderId[]>> = {
  real_product_capture: ['halyard_capture'],
  supplied_media: ['asset_library'],
  generated_broll: ['higgsfield'],
  generated_presenter: ['higgsfield'],
  branded_static: ['canva', 'halyard_render', 'blotato_visual'],
  branded_carousel: ['canva', 'halyard_render', 'blotato_visual'],
  motion_graphics: ['halyard_render'],
  synthetic_narration: ['elevenlabs'],
  founder_audio: ['halyard_audio'],
  transcript_edit: ['descript'],
  final_video_assembly: ['halyard_render'],
  final_static_render: ['canva', 'halyard_render'],
  caption_burnin: ['halyard_render'],
  music_bed: ['halyard_audio'],
  sound_effects: ['halyard_audio'],
  thumbnail: ['canva', 'halyard_render'],
};

export interface ProductionRouteContext {
  mode: 'calibration' | 'production';
  configuredProviders: ProductionProviderId[];
  /** Legacy coarse calibration. Kept while old callers migrate. */
  calibratedProviders?: ProductionProviderId[];
  /** Preferred v2 calibration granularity: provider + exact capability. */
  calibratedCapabilities?: Array<{ provider: ProductionProviderId; capability: ProductionCapability }>;
  disabledProviders?: ProductionProviderId[];
  preferredProviders?: Partial<Record<ProductionCapability, ProductionProviderId[]>>;
  /** Used as a tie-breaker after capability and quality. */
  costPreference?: 'quality_first' | 'balanced' | 'cost_first';
}

export interface ProductionStep {
  requirementId: string;
  capability: ProductionCapability;
  provider: ProductionProviderId;
  truthCritical: boolean;
  humanReviewRequired: boolean;
  reason: string;
}

export interface ProductionRefusal {
  requirementId: string;
  capability: ProductionCapability;
  reason: string;
}

export interface ProductionRecipe {
  steps: ProductionStep[];
  refusals: ProductionRefusal[];
  ready: boolean;
  humanReviewRequired: boolean;
  reasons: string[];
}

function providerById(
  profiles: ProductionProviderProfile[],
  id: ProductionProviderId,
): ProductionProviderProfile | null {
  return profiles.find((profile) => profile.id === id) ?? null;
}

function orderFor(
  capability: ProductionCapability,
  context: ProductionRouteContext,
): ProductionProviderId[] {
  return context.preferredProviders?.[capability] ?? DEFAULT_ORDER[capability] ?? [];
}

function candidateScore(
  profile: ProductionProviderProfile,
  orderIndex: number,
  preference: ProductionRouteContext['costPreference'],
): number {
  const order = Math.max(0, 20 - orderIndex * 3);
  if (preference === 'cost_first') return order + profile.qualityTier * 2 - profile.costTier * 4;
  if (preference === 'balanced') return order + profile.qualityTier * 4 - profile.costTier * 2;
  return order + profile.qualityTier * 6 - profile.costTier;
}

/**
 * Deterministic provider selection. Strategy asks for capabilities; this code
 * decides who may execute them and explains every refusal.
 */
export function routeProduction(
  requirements: readonly ProductionRequirement[],
  context: ProductionRouteContext,
  profiles: ProductionProviderProfile[] = DEFAULT_PRODUCTION_PROVIDERS,
): ProductionRecipe {
  const configured = new Set(context.configuredProviders);
  const calibrated = new Set(context.calibratedProviders ?? []);
  const calibratedCapabilities = new Set(
    (context.calibratedCapabilities ?? []).map(
      ({ provider, capability }) => `${provider}:${capability}`,
    ),
  );
  const disabled = new Set(context.disabledProviders ?? []);
  const steps: ProductionStep[] = [];
  const refusals: ProductionRefusal[] = [];

  for (const requirement of requirements) {
    const preferred = requirement.providerPin
      ? [requirement.providerPin as ProductionProviderId]
      : orderFor(requirement.capability, context);

    const ranked = preferred
      .map((id, index) => ({ id, index, profile: providerById(profiles, id) }))
      .filter(
        (candidate): candidate is { id: ProductionProviderId; index: number; profile: ProductionProviderProfile } =>
          Boolean(candidate.profile),
      )
      .filter(({ id, profile }) =>
        configured.has(id) &&
        !disabled.has(id) &&
        profile.capabilities.includes(requirement.capability),
      )
      .filter(({ profile }) => !requirement.truthCritical || profile.truthEligible)
      .filter(({ id, profile }) =>
        context.mode === 'calibration' ||
        !profile.generativeVisual ||
        calibrated.has(id) ||
        calibratedCapabilities.has(`${id}:${requirement.capability}`),
      )
      .sort(
        (a, b) =>
          candidateScore(b.profile, b.index, context.costPreference ?? 'quality_first') -
          candidateScore(a.profile, a.index, context.costPreference ?? 'quality_first'),
      );

    const selected = ranked[0];
    if (!selected) {
      const generativeBlocked = preferred.some((id) => {
        const profile = providerById(profiles, id);
        return Boolean(
          profile?.generativeVisual &&
          configured.has(id) &&
          !calibrated.has(id) &&
          !calibratedCapabilities.has(`${id}:${requirement.capability}`),
        );
      });
      const reason =
        context.mode === 'production' && generativeBlocked
          ? `${requirement.capability} has a configured generative provider, but it has not passed visual calibration for production automation.`
          : requirement.truthCritical
            ? `${requirement.capability} is truth-critical and no configured truth-eligible provider can satisfy it.`
            : `No configured production provider can satisfy ${requirement.capability}.`;
      refusals.push({ requirementId: requirement.id, capability: requirement.capability, reason });
      continue;
    }

    const { profile } = selected;
    const humanReviewRequired = context.mode === 'calibration' || profile.generativeVisual;
    steps.push({
      requirementId: requirement.id,
      capability: requirement.capability,
      provider: profile.id,
      truthCritical: requirement.truthCritical === true,
      humanReviewRequired,
      reason: requirement.providerPin
        ? `Pinned to ${profile.id}; capability and truth rules still passed.`
        : `${profile.id} is the highest-ranked configured provider for ${requirement.capability}${
            profile.generativeVisual && context.mode === 'calibration'
              ? '; calibration mode requires human visual review of its actual output.'
              : '.'
          }`,
    });
  }

  const requiredIds = new Set(requirements.filter((requirement) => requirement.required).map((requirement) => requirement.id));
  const refusedRequired = refusals.some((refusal) => requiredIds.has(refusal.requirementId));
  const humanReviewRequired = steps.some((step) => step.humanReviewRequired);
  return {
    steps,
    refusals,
    ready: !refusedRequired,
    humanReviewRequired,
    reasons: [
      context.mode === 'calibration'
        ? 'Calibration mode may use uncalibrated providers, but the finished visual requires human review.'
        : 'Production mode refuses uncalibrated generative visual providers.',
      ...(refusedRequired ? ['At least one required production capability has no valid route.'] : []),
    ],
  };
}
