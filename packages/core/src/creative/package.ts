/**
 * CreativePackage v1 — the one creative contract every Halyard entry point
 * converges on before media production begins.
 *
 * The package owns creative intent and truth requirements. It deliberately
 * names capabilities rather than vendors; ProductionRouter chooses vendors
 * later from configured/calibrated provider profiles.
 */

export const CONTENT_FAMILIES = [
  'proof_demo',
  'transformation',
  'teach',
  'story_pov',
  'entertainment_social',
  'creator_style',
] as const;
export type ContentFamily = (typeof CONTENT_FAMILIES)[number];

export const GROWTH_OBJECTIVES = [
  // Existing Halyard concept objectives remain valid during migration.
  'awareness',
  'engagement',
  'education',
  'traffic',
  'conversion',
  'retention',
  'follower_growth',
  'product_promotion',
  // v2 makes the downstream growth outcome explicit where it is known.
  'reach',
  'follow',
  'profile_visit',
  'site_visit',
  'signup',
  'activation',
  'learning',
] as const;
export type GrowthObjective = (typeof GROWTH_OBJECTIVES)[number];

export type AudienceAwareness =
  | 'unaware'
  | 'problem_aware'
  | 'solution_aware'
  | 'product_aware'
  | 'mixed';

export type PackageOriginKind =
  | 'launch'
  | 'campaign'
  | 'daily'
  | 'manual'
  | 'opportunity'
  | 'experiment';

export type ProofKind =
  | 'product_capture'
  | 'product_artifact'
  | 'verified_fact'
  | 'external_source'
  | 'operator_statement';

export interface ProofRequirement {
  id: string;
  claim: string;
  kind: ProofKind;
  sourceRef: string;
  /** Some claims are not satisfied by a caption citation; the viewer must see the proof. */
  mustAppearVisually?: boolean;
}

export type MediaNeed =
  | { kind: 'real_product_capture'; subject: string }
  | { kind: 'real_supplied_media'; subject: string }
  | { kind: 'generated_broll'; subject: string; realism: 'illustrative' | 'photoreal' }
  | { kind: 'generated_presenter'; subject: string; disclosureRequired: true }
  | { kind: 'motion_graphics'; subject: string }
  | { kind: 'template_frame'; subject: string }
  | { kind: 'none' };

export type BeatPurpose = 'hook' | 'problem' | 'reveal' | 'proof' | 'explain' | 'payoff' | 'cta';

export interface CreativePackageBeat {
  id: string;
  purpose: BeatPurpose;
  seconds?: number;
  spoken?: string;
  onScreen?: string[];
  direction: string;
  evidenceRefs?: string[];
  mediaNeed: MediaNeed;
}

export interface VisualDirection {
  language: string;
  pace: 'calm' | 'measured' | 'fast' | 'mixed';
  firstFrame: string;
  finalFrame?: string;
  composition?: string;
  typography?: string;
  captionStyle?: string;
  camera?: string;
  realism?: string;
  productProofTreatment?: string;
  forbiddenShortcuts?: string[];
  brandRefs?: string[];
}

export interface AudioDirection {
  narration: 'none' | 'synthetic' | 'founder' | 'creator';
  voiceIntent?: string;
  music: 'none' | 'subtle' | 'driving' | 'editorial' | 'custom';
  musicIntent?: string;
  soundEffects?: string[];
}

export interface CtaDirection {
  kind: 'none' | 'soft' | 'product' | 'conversation' | 'follow' | 'save_share';
  intent?: string;
}

export interface ExperimentDirection {
  hypothesis: string;
  variable: string;
  value: string;
  controlValue?: string;
}

export const PRODUCTION_CAPABILITIES = [
  'real_product_capture',
  'supplied_media',
  'generated_broll',
  'generated_presenter',
  'branded_static',
  'branded_carousel',
  'motion_graphics',
  'synthetic_narration',
  'founder_audio',
  'transcript_edit',
  'final_video_assembly',
  'final_static_render',
  'caption_burnin',
  'music_bed',
  'sound_effects',
  'thumbnail',
] as const;
export type ProductionCapability = (typeof PRODUCTION_CAPABILITIES)[number];

export interface ProductionRequirement {
  id: string;
  capability: ProductionCapability;
  required: boolean;
  /** A truth-critical requirement may never be satisfied with synthetic media. */
  truthCritical?: boolean;
  quality?: 'standard' | 'premium';
  subject?: string;
  providerPin?: string;
  maxCostUsd?: number;
}

export interface BeatOverride {
  beatId: string;
  spoken?: string;
  onScreen?: string[];
  direction?: string;
  seconds?: number;
}

export interface DestinationIntent {
  type: 'none' | 'product' | 'share' | 'article' | 'custom';
  ref?: string;
}

export interface CreativePackageVariant {
  id: string;
  accountId: string;
  platform: string;
  format: 'text' | 'image' | 'carousel' | 'video' | 'pin' | 'story';
  subtype?: string;
  objective: string;
  hook: string;
  captionBrief: string;
  titleBrief?: string;
  targetSeconds?: number;
  beatOverrides?: BeatOverride[];
  destination?: DestinationIntent;
  scheduledWindow?: string;
  productionRequirements: ProductionRequirement[];
}

export interface QualityRequirement {
  id: string;
  description: string;
  severity: 'hard' | 'quality';
  metric?: string;
  threshold?: number | string;
}

export type PackageStatus =
  | 'draft'
  | 'strategy_ready'
  | 'creative_ready'
  | 'production_planned'
  | 'producing'
  | 'review_required'
  | 'approved'
  | 'rejected'
  | 'archived';

export interface CreativePackage {
  id: string;
  version: 1;
  productId: string;
  origin: { kind: PackageOriginKind; ref?: string };
  family: ContentFamily;
  objective: GrowthObjective;
  audience: {
    description: string;
    problemOrDesire: string;
    awareness: AudienceAwareness;
  };
  concept: {
    premise: string;
    whyCareBeforeProduct: string;
    hook: string;
    payoff: string;
    emotionalAngle?: string;
  };
  proof: ProofRequirement[];
  evidenceRefs: string[];
  story: {
    targetSeconds?: number;
    beats: CreativePackageBeat[];
  };
  visual: VisualDirection;
  audio: AudioDirection;
  cta: CtaDirection;
  experiment?: ExperimentDirection;
  productionRequirements: ProductionRequirement[];
  platformVariants: CreativePackageVariant[];
  qualityBar: QualityRequirement[];
  status: PackageStatus;
}

export interface CreativePackageProblem {
  field: string;
  message: string;
}

function blank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

/** Every reason a package is not yet a coherent production brief. */
export function validateCreativePackage(pkg: CreativePackage): CreativePackageProblem[] {
  const problems: CreativePackageProblem[] = [];
  const add = (field: string, message: string) => problems.push({ field, message });

  if (pkg.version !== 1) add('version', 'CreativePackage v1 is the only supported contract.');
  if (blank(pkg.id)) add('id', 'A package needs a stable id for lineage.');
  if (blank(pkg.productId)) add('productId', 'A package must belong to one product.');
  if (blank(pkg.audience.description)) add('audience.description', 'Name the audience this is for.');
  if (blank(pkg.audience.problemOrDesire)) add('audience.problemOrDesire', 'State the audience tension, problem, or desire.');
  if (blank(pkg.concept.premise)) add('concept.premise', 'State the creative premise.');
  if (blank(pkg.concept.whyCareBeforeProduct)) {
    add('concept.whyCareBeforeProduct', 'Explain why a person should care before the product is mentioned.');
  }
  if (blank(pkg.concept.hook)) add('concept.hook', 'A package needs a hook.');
  if (blank(pkg.concept.payoff)) add('concept.payoff', 'A package needs a payoff.');
  if (pkg.platformVariants.length === 0) add('platformVariants', 'A package needs at least one platform variant.');

  const beatIds = new Set<string>();
  for (const [index, beat] of pkg.story.beats.entries()) {
    const path = `story.beats[${index}]`;
    if (blank(beat.id)) add(`${path}.id`, 'Every beat needs an id.');
    else if (beatIds.has(beat.id)) add(`${path}.id`, `Beat id "${beat.id}" is duplicated.`);
    else beatIds.add(beat.id);
    if (blank(beat.direction)) add(`${path}.direction`, 'Say what happens in this beat.');
    if (beat.seconds != null && beat.seconds <= 0) add(`${path}.seconds`, 'Beat duration must be positive.');

    /*
     * Generated media may explain a claim, but it cannot *be* evidence that the
     * product did something. That distinction is the central anti-slop/truth
     * boundary for v2.
     */
    if (
      beat.purpose === 'proof' &&
      (beat.mediaNeed.kind === 'generated_broll' || beat.mediaNeed.kind === 'generated_presenter')
    ) {
      add(
        `${path}.mediaNeed`,
        'A proof beat cannot use generated media as its proof. Use real product/supplied media or make the generated shot an explanatory beat.',
      );
    }
  }

  const proofIds = new Set<string>();
  for (const [index, proof] of pkg.proof.entries()) {
    const path = `proof[${index}]`;
    if (blank(proof.id)) add(`${path}.id`, 'Every proof requirement needs an id.');
    else if (proofIds.has(proof.id)) add(`${path}.id`, `Proof id "${proof.id}" is duplicated.`);
    else proofIds.add(proof.id);
    if (blank(proof.claim)) add(`${path}.claim`, 'State the claim this evidence supports.');
    if (blank(proof.sourceRef)) add(`${path}.sourceRef`, 'Proof must resolve to an evidence reference.');
  }

  const requirementIds = new Set<string>();
  for (const [index, requirement] of pkg.productionRequirements.entries()) {
    const path = `productionRequirements[${index}]`;
    if (blank(requirement.id)) add(`${path}.id`, 'Every production requirement needs an id.');
    else if (requirementIds.has(requirement.id)) add(`${path}.id`, `Production requirement id "${requirement.id}" is duplicated.`);
    else requirementIds.add(requirement.id);
    if (requirement.maxCostUsd != null && requirement.maxCostUsd < 0) {
      add(`${path}.maxCostUsd`, 'A production cost ceiling cannot be negative.');
    }
    if (
      requirement.truthCritical &&
      ['generated_broll', 'generated_presenter'].includes(requirement.capability)
    ) {
      add(
        `${path}.truthCritical`,
        'Truth-critical visual requirements cannot request synthetic generation. Request real_product_capture or supplied_media.',
      );
    }
  }

  const variantIds = new Set<string>();
  for (const [index, variant] of pkg.platformVariants.entries()) {
    const path = `platformVariants[${index}]`;
    if (blank(variant.id)) add(`${path}.id`, 'Every variant needs an id.');
    else if (variantIds.has(variant.id)) add(`${path}.id`, `Variant id "${variant.id}" is duplicated.`);
    else variantIds.add(variant.id);
    if (blank(variant.accountId)) add(`${path}.accountId`, 'Every variant must target a connected social identity.');
    if (blank(variant.platform)) add(`${path}.platform`, 'Every variant needs a platform.');
    if (blank(variant.hook)) add(`${path}.hook`, 'A platform variant needs its own hook.');
    if (blank(variant.captionBrief)) add(`${path}.captionBrief`, 'A platform variant needs a caption brief.');
    if (variant.targetSeconds != null && variant.targetSeconds <= 0) {
      add(`${path}.targetSeconds`, 'Video duration must be positive.');
    }
  }

  return problems;
}

export function creativePackageReady(pkg: CreativePackage): boolean {
  return validateCreativePackage(pkg).length === 0 &&
    ['creative_ready', 'production_planned', 'producing', 'review_required', 'approved'].includes(pkg.status);
}

export function variantIn(
  pkg: CreativePackage,
  variantId: string,
): CreativePackageVariant | null {
  return pkg.platformVariants.find((variant) => variant.id === variantId) ?? null;
}

/** Stable creative features attached to publication/metric rows for learning. */
export function creativeFeatures(
  pkg: CreativePackage,
  variant?: CreativePackageVariant | null,
): Record<string, string | number | boolean> {
  const realUi = pkg.story.beats.some((beat) => beat.mediaNeed.kind === 'real_product_capture');
  const generated = pkg.story.beats.filter((beat) => beat.mediaNeed.kind.startsWith('generated_')).length;
  return {
    content_family: pkg.family,
    objective: pkg.objective,
    hook: variant?.hook ?? pkg.concept.hook,
    visual_language: pkg.visual.language,
    pace: pkg.visual.pace,
    narration: pkg.audio.narration,
    cta: pkg.cta.kind,
    real_product_capture: realUi,
    generated_beats: generated,
    ...(variant
      ? {
          platform: variant.platform,
          format: variant.format,
          subtype: variant.subtype ?? '',
          target_seconds: variant.targetSeconds ?? pkg.story.targetSeconds ?? 0,
        }
      : {}),
    ...(pkg.experiment
      ? {
          experiment_variable: pkg.experiment.variable,
          experiment_value: pkg.experiment.value,
        }
      : {}),
  };
}


/**
 * Bridge current content categories into the simpler v2 audience-facing
 * families. This is deliberately centralized so Launch/Campaign/Daily do not
 * each invent their own taxonomy during migration.
 */
export function contentFamilyForCategory(category: string): ContentFamily {
  switch (category) {
    case 'transformation': return 'transformation';
    case 'education': return 'teach';
    case 'community': return 'entertainment_social';
    case 'product': return 'proof_demo';
    case 'founder_insight':
    case 'brand': return 'story_pov';
    default: return 'teach';
  }
}

/** Existing strategy vocabulary stays valid; this picks the best v2 intent. */
export function growthObjectiveForCategory(category: string): GrowthObjective {
  switch (category) {
    case 'community': return 'engagement';
    case 'product': return 'product_promotion';
    case 'brand': return 'follower_growth';
    case 'founder_insight': return 'awareness';
    case 'transformation':
    case 'education':
    default: return 'education';
  }
}

/**
 * Minimum production capabilities implied by the media type before a creative
 * director has made shot/audio decisions. These are intentionally conservative:
 * later planning may add source footage, narration, capture, music, etc.
 */
export function baselineProductionRequirements(
  format: CreativePackageVariant['format'],
  category?: string,
): ProductionRequirement[] {
  const requirements: ProductionRequirement[] = [];
  if (format === 'video') {
    if (category === 'product') {
      requirements.push({
        id: 'product-proof-capture',
        capability: 'real_product_capture',
        required: true,
        truthCritical: true,
        subject: 'Real product workflow shown in the creative.',
      });
    }
    requirements.push(
      { id: 'video-assembly', capability: 'final_video_assembly', required: true },
      { id: 'captions', capability: 'caption_burnin', required: true },
    );
    return requirements;
  }
  if (format === 'carousel') {
    return [{ id: 'carousel', capability: 'branded_carousel', required: true }];
  }
  if (format === 'pin' || format === 'image' || format === 'story') {
    return [{ id: 'static', capability: 'branded_static', required: true }];
  }
  return requirements;
}


export function mediaRequiredForFormat(format: CreativePackageVariant['format'] | string): boolean {
  return ['image', 'carousel', 'video', 'story', 'pin'].includes(format);
}

export function defaultTreatmentForCategory(category: string): string {
  switch (category) {
    case 'transformation': return 'before_after';
    case 'education': return 'how_to';
    case 'community': return 'myth_fact';
    case 'product': return 'feature_demo';
    case 'founder_insight': return 'comparison';
    case 'brand': return 'feature_demo';
    default: return 'how_to';
  }
}

export function defaultPresentationModeForFormat(format: string): 'editorial' | 'punch' {
  return format === 'video' ? 'punch' : 'editorial';
}

export function defaultAspectRatioForVariant(platform: string, format: string): string | null {
  if (format === 'video' && ['instagram', 'tiktok', 'youtube'].includes(platform)) return '9:16';
  if (format === 'carousel' || (platform === 'instagram' && format === 'image')) return '4:5';
  if (format === 'pin' || platform === 'pinterest') return '2:3';
  if (format === 'image') return '4:5';
  return null;
}

export function defaultTargetSecondsForVariant(format: string): number | null {
  return format === 'video' ? 15 : null;
}

export function baselineQualityBar(format: string): QualityRequirement[] {
  const requirements: QualityRequirement[] = [
    {
      id: 'truth',
      severity: 'hard',
      description: 'Every product claim resolves to real product evidence; generated media never fabricates product proof.',
    },
    {
      id: 'native',
      severity: 'quality',
      description: 'The final creative must feel native to the destination rather than like one syndicated ad.',
    },
  ];
  if (mediaRequiredForFormat(format)) {
    requirements.push({
      id: 'actual-media-review',
      severity: 'hard',
      description: 'The actual finished media must exist and pass artifact-level review before approval.',
    });
  }
  return requirements;
}


export function contentCategoryForFamily(
  family: ContentFamily | null | undefined,
  legacyTreatment?: string | null,
): 'transformation' | 'education' | 'community' | 'product' | 'founder_insight' {
  switch (family) {
    case 'proof_demo': return 'product';
    case 'transformation': return 'transformation';
    case 'story_pov': return 'founder_insight';
    case 'entertainment_social': return 'community';
    case 'creator_style':
    case 'teach': return 'education';
  }

  // Concepts written before the v2 `family` column still carry their treatment
  // in story_structure. Preserve that intent during migration rather than
  // flattening every old selected concept into education.
  switch (legacyTreatment) {
    case 'before_after': return 'transformation';
    case 'feature_demo': return 'product';
    case 'comparison': return 'education';
    case 'myth_fact': return 'education';
    case 'listicle': return 'education';
    case 'how_to': return 'education';
    case 'process_montage': return 'transformation';
    default: return 'education';
  }
}


export interface PackageStoryPlanInput {
  family: ContentFamily;
  format: CreativePackageVariant['format'];
  hook: string;
  premise: string;
  payoff: string;
  /** A real connector/artifact exists and may be quoted/visualised truthfully. */
  hasProductArtifact?: boolean;
  /** The creative explicitly promises to show the product itself working. */
  requiresProductCapture?: boolean;
  targetSeconds?: number | null;
}

export interface PackageStoryPlan {
  beats: CreativePackageBeat[];
  productionRequirements: ProductionRequirement[];
  visual: VisualDirection;
  audio: AudioDirection;
}

function seconds(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((weight) => Math.max(0.8, Number(((total * weight) / sum).toFixed(1))));
}

/**
 * A bounded story grammar for package-driven media.
 *
 * This does not write copy or choose a vendor. It prevents the downstream
 * production layer from inventing the story shape and makes truth-bearing
 * beats explicit before any expensive visual generation is allowed.
 */
export function planPackageStory(input: PackageStoryPlanInput): PackageStoryPlan {
  const isVideo = input.format === 'video' || input.format === 'story';
  const isCarousel = input.format === 'carousel';
  const total = input.targetSeconds ?? (isVideo ? 15 : 0);
  const requirements = baselineProductionRequirements(input.format, input.family === 'proof_demo' ? 'product' : undefined);
  const beats: CreativePackageBeat[] = [];

  if (!mediaRequiredForFormat(input.format)) {
    return {
      beats,
      productionRequirements: [],
      visual: {
        language: 'text_native',
        pace: 'measured',
        firstFrame: input.hook,
        forbiddenShortcuts: ['Do not turn a text-native post into a screenshot of prose.'],
      },
      audio: { narration: 'none', music: 'none' },
    };
  }

  if (isVideo) {
    const [hookS, middleA, middleB, payoffS] = seconds(total, [1, 2, 2, 1]);
    const illustrativeNeed: MediaNeed =
      input.family === 'creator_style'
        ? { kind: 'generated_presenter', subject: input.premise, disclosureRequired: true }
        : { kind: 'generated_broll', subject: input.premise, realism: 'photoreal' };

    beats.push({
      id: 'hook', purpose: 'hook', seconds: hookS, onScreen: [input.hook],
      direction: 'Open on meaningful motion immediately; the premise is understandable without waiting for a logo.',
      mediaNeed: input.family === 'proof_demo' ? { kind: 'motion_graphics', subject: input.hook } : illustrativeNeed,
    });
    beats.push({
      id: 'problem', purpose: input.family === 'teach' ? 'explain' : 'problem', seconds: middleA,
      direction: input.premise,
      mediaNeed: input.family === 'proof_demo' ? { kind: 'motion_graphics', subject: input.premise } : illustrativeNeed,
    });

    if (input.requiresProductCapture) {
      beats.push({
        id: 'proof', purpose: 'proof', seconds: middleB,
        direction: 'Show the real product performing the exact behavior the post claims.',
        mediaNeed: { kind: 'real_product_capture', subject: input.premise },
      });
      if (!requirements.some((r) => r.capability === 'real_product_capture')) {
        requirements.unshift({
          id: 'story-product-proof', capability: 'real_product_capture', required: true,
          truthCritical: true, subject: input.premise,
        });
      }
    } else if (input.hasProductArtifact && ['proof_demo', 'transformation'].includes(input.family)) {
      beats.push({
        id: 'proof', purpose: 'proof', seconds: middleB,
        direction: 'Visualise the real product artifact/output as a truthful before/after or evidence card; do not invent UI.',
        mediaNeed: { kind: 'motion_graphics', subject: 'Real product output / artifact evidence' },
      });
    } else {
      beats.push({
        id: 'reveal', purpose: input.family === 'teach' ? 'explain' : 'reveal', seconds: middleB,
        direction: 'Advance the idea with a new visual fact or example rather than restating the hook.',
        mediaNeed: input.family === 'creator_style' ? illustrativeNeed : { kind: 'motion_graphics', subject: input.premise },
      });
    }

    beats.push({
      id: 'payoff', purpose: 'payoff', seconds: payoffS, onScreen: [input.payoff],
      direction: 'Land the useful conclusion cleanly; no generic "download now" end card unless the package explicitly calls for one.',
      mediaNeed: { kind: 'motion_graphics', subject: input.payoff },
    });

    const needsGenerated = beats.some((beat) =>
      beat.mediaNeed.kind === 'generated_broll' || beat.mediaNeed.kind === 'generated_presenter',
    );
    if (needsGenerated) {
      requirements.unshift({
        id: input.family === 'creator_style' ? 'story-presenter' : 'story-broll',
        capability: input.family === 'creator_style' ? 'generated_presenter' : 'generated_broll',
        required: true,
        quality: 'premium',
        subject: input.premise,
      });
    }
    if (!requirements.some((r) => r.capability === 'synthetic_narration')) {
      requirements.push({ id: 'story-narration', capability: 'synthetic_narration', required: false });
    }

    return {
      beats,
      productionRequirements: requirements,
      visual: {
        language:
          input.family === 'creator_style' ? 'creator_native' :
          input.family === 'teach' ? 'editorial_motion' :
          input.family === 'proof_demo' ? 'product_proof' : 'cinematic_mixed',
        pace: input.family === 'creator_style' || input.family === 'entertainment_social' ? 'fast' : 'mixed',
        firstFrame: input.hook,
        finalFrame: input.payoff,
        captionStyle: 'Large mobile-safe captions; never cover the proof area.',
        productProofTreatment: input.requiresProductCapture ? 'Real product capture; no synthetic interface.' : undefined,
        forbiddenShortcuts: [
          'No fake product UI.',
          'No generic AI montage with repeated shots.',
          'No dead intro before the hook.',
          'No synthetic customer testimony or personal-use claim.',
        ],
      },
      audio: {
        narration: 'synthetic',
        voiceIntent: 'Natural, concise, conversational; never ad-announcer energy.',
        music: 'subtle',
        musicIntent: 'Support rhythm without competing with speech.',
      },
    };
  }

  if (isCarousel) {
    beats.push(
      { id: 'hook', purpose: 'hook', onScreen: [input.hook], direction: 'Slide 1 earns the swipe with one clear promise.', mediaNeed: { kind: 'template_frame', subject: input.hook } },
      { id: 'explain', purpose: 'explain', direction: input.premise, mediaNeed: { kind: 'template_frame', subject: input.premise } },
      { id: 'proof', purpose: input.hasProductArtifact ? 'proof' : 'explain', direction: input.hasProductArtifact ? 'Use real product output or verified evidence, not invented UI.' : 'Give a concrete example or mechanism.', mediaNeed: { kind: 'template_frame', subject: input.premise } },
      { id: 'payoff', purpose: 'payoff', onScreen: [input.payoff], direction: 'Land the value; do not waste the last slide on engagement bait.', mediaNeed: { kind: 'template_frame', subject: input.payoff } },
    );
  } else {
    beats.push({
      id: 'frame', purpose: 'hook', onScreen: [input.hook],
      direction: `${input.premise} ${input.payoff}`,
      mediaNeed: { kind: 'template_frame', subject: input.premise },
    });
  }

  return {
    beats,
    productionRequirements: requirements,
    visual: {
      language: isCarousel ? 'branded_editorial' : 'single_idea_editorial',
      pace: 'measured',
      firstFrame: input.hook,
      finalFrame: input.payoff,
      typography: 'Mobile-first hierarchy; one dominant idea per frame/slide.',
      forbiddenShortcuts: ['No PowerPoint density.', 'No fabricated screenshots or testimonials.', 'No decorative AI imagery that obscures the point.'],
    },
    audio: { narration: 'none', music: 'none' },
  };
}
