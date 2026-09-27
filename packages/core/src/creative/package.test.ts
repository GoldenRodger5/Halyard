import { describe, expect, it } from 'vitest';
import {
  baselineProductionRequirements,
  baselineQualityBar,
  defaultAspectRatioForVariant,
  defaultPresentationModeForFormat,
  defaultTargetSecondsForVariant,
  defaultTreatmentForCategory,
  mediaRequiredForFormat,
  planPackageStory,
  contentCategoryForFamily,
  contentFamilyForCategory,
  creativeFeatures,
  growthObjectiveForCategory,
  creativePackageReady,
  validateCreativePackage,
  variantIn,
  type CreativePackage,
} from './package.js';

function basePackage(): CreativePackage {
  return {
    id: 'pkg-1',
    version: 1,
    productId: 'recipefix',
    origin: { kind: 'launch' },
    family: 'transformation',
    objective: 'activation',
    audience: {
      description: 'Home cooks adapting recipes around dietary constraints.',
      problemOrDesire: 'Keep the recipe they want without breaking the method.',
      awareness: 'problem_aware',
    },
    concept: {
      premise: 'A simple ingredient swap can leave the instructions wrong.',
      whyCareBeforeProduct: 'Bad substitutions waste ingredients and dinner.',
      hook: 'Your swap can break the instructions.',
      payoff: 'The method has to change with the ingredient.',
    },
    proof: [
      {
        id: 'proof-ui',
        claim: 'RecipeFix changes ingredients and method together.',
        kind: 'product_capture',
        sourceRef: 'capture:adapt-flow',
        mustAppearVisually: true,
      },
    ],
    evidenceRefs: ['FACT:workflows:ingredients_and_method_adaptation'],
    story: {
      targetSeconds: 15,
      beats: [
        {
          id: 'hook',
          purpose: 'hook',
          seconds: 1.2,
          onScreen: ['Your swap can break the instructions.'],
          direction: 'Open on food motion with the hook immediately visible.',
          mediaNeed: { kind: 'generated_broll', subject: 'close food motion', realism: 'photoreal' },
        },
        {
          id: 'proof',
          purpose: 'proof',
          seconds: 4,
          direction: 'Show the real adaptation in RecipeFix.',
          evidenceRefs: ['capture:adapt-flow'],
          mediaNeed: { kind: 'real_product_capture', subject: 'RecipeFix adaptation diff' },
        },
      ],
    },
    visual: {
      language: 'fast_cut_creator',
      pace: 'fast',
      firstFrame: 'Food movement plus five-word hook.',
      productProofTreatment: 'Real app capture in a phone crop.',
      forbiddenShortcuts: ['No synthetic app UI.'],
    },
    audio: { narration: 'synthetic', music: 'subtle' },
    cta: { kind: 'none' },
    productionRequirements: [
      {
        id: 'capture',
        capability: 'real_product_capture',
        required: true,
        truthCritical: true,
        subject: 'RecipeFix adaptation flow',
      },
      {
        id: 'broll',
        capability: 'generated_broll',
        required: true,
        subject: 'food close-up',
        quality: 'premium',
      },
      { id: 'voice', capability: 'synthetic_narration', required: true },
      { id: 'assembly', capability: 'final_video_assembly', required: true },
    ],
    platformVariants: [
      {
        id: 'variant-tiktok',
        accountId: 'account-tiktok',
        platform: 'tiktok',
        format: 'video',
        subtype: 'script',
        objective: 'earn attention and demonstrate the mechanism',
        hook: 'Your swap can break the instructions.',
        captionBrief: 'Add one detail the video does not say; do not transcribe it.',
        targetSeconds: 15,
        productionRequirements: [],
      },
    ],
    qualityBar: [
      {
        id: 'real-proof',
        description: 'Product proof is real capture, never generated UI.',
        severity: 'hard',
      },
    ],
    status: 'creative_ready',
  };
}

describe('CreativePackage v1', () => {
  it('accepts a coherent product-proof package', () => {
    const pkg = basePackage();
    expect(validateCreativePackage(pkg)).toEqual([]);
    expect(creativePackageReady(pkg)).toBe(true);
  });

  it('refuses generated media as the proof itself', () => {
    const pkg = basePackage();
    pkg.story.beats[1]!.mediaNeed = {
      kind: 'generated_broll',
      subject: 'fake app result',
      realism: 'photoreal',
    };
    expect(validateCreativePackage(pkg)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'story.beats[1].mediaNeed' }),
      ]),
    );
  });

  it('refuses truth-critical synthetic production requirements', () => {
    const pkg = basePackage();
    pkg.productionRequirements.push({
      id: 'bad-proof',
      capability: 'generated_presenter',
      required: true,
      truthCritical: true,
    });
    expect(validateCreativePackage(pkg)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'productionRequirements[4].truthCritical' }),
      ]),
    );
  });

  it('catches duplicate variant ids and missing native briefs', () => {
    const pkg = basePackage();
    pkg.platformVariants.push({
      ...pkg.platformVariants[0]!,
      platform: 'instagram',
      accountId: 'ig',
      captionBrief: '',
    });
    const problems = validateCreativePackage(pkg);
    expect(problems.some((problem) => problem.message.includes('duplicated'))).toBe(true);
    expect(problems.some((problem) => problem.field.endsWith('captionBrief'))).toBe(true);
  });


  it('bridges legacy categories into the v2 family/objective model in one place', () => {
    expect(contentFamilyForCategory('transformation')).toBe('transformation');
    expect(contentFamilyForCategory('product')).toBe('proof_demo');
    expect(contentFamilyForCategory('brand')).toBe('story_pov');
    expect(growthObjectiveForCategory('community')).toBe('engagement');
    expect(growthObjectiveForCategory('brand')).toBe('follower_growth');
    expect(contentCategoryForFamily('proof_demo')).toBe('product');
    expect(contentCategoryForFamily('story_pov')).toBe('founder_insight');
    expect(contentCategoryForFamily('creator_style')).toBe('education');
  });

  it('derives only the minimum production requirements before creative direction', () => {
    expect(baselineProductionRequirements('text', 'education')).toEqual([]);
    expect(baselineProductionRequirements('carousel', 'education')).toEqual([
      expect.objectContaining({ capability: 'branded_carousel', required: true }),
    ]);
    expect(baselineProductionRequirements('video', 'product')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capability: 'real_product_capture', truthCritical: true }),
        expect.objectContaining({ capability: 'final_video_assembly' }),
        expect.objectContaining({ capability: 'caption_burnin' }),
      ]),
    );
  });


  it('centralizes package seed defaults so entry points cannot drift', () => {
    expect(mediaRequiredForFormat('video')).toBe(true);
    expect(mediaRequiredForFormat('text')).toBe(false);
    expect(defaultTreatmentForCategory('transformation')).toBe('before_after');
    expect(defaultPresentationModeForFormat('video')).toBe('punch');
    expect(defaultPresentationModeForFormat('carousel')).toBe('editorial');
    expect(defaultAspectRatioForVariant('tiktok', 'video')).toBe('9:16');
    expect(defaultAspectRatioForVariant('instagram', 'carousel')).toBe('4:5');
    expect(defaultAspectRatioForVariant('pinterest', 'pin')).toBe('2:3');
    expect(defaultTargetSecondsForVariant('video')).toBe(15);
    expect(defaultTargetSecondsForVariant('text')).toBeNull();
    expect(baselineQualityBar('video').some((rule) => rule.id === 'actual-media-review')).toBe(true);
    expect(baselineQualityBar('text').some((rule) => rule.id === 'actual-media-review')).toBe(false);
  });

  it('plans truth-bearing video beats before a production provider is chosen', () => {
    const plan = planPackageStory({
      family: 'proof_demo',
      format: 'video',
      hook: 'Watch the instructions change too.',
      premise: 'A recipe adaptation changes method as well as ingredients.',
      payoff: 'The swap is only half the fix.',
      requiresProductCapture: true,
      targetSeconds: 15,
    });
    expect(plan.beats.map((beat) => beat.purpose)).toEqual(['hook', 'problem', 'proof', 'payoff']);
    expect(plan.beats.find((beat) => beat.purpose === 'proof')?.mediaNeed.kind).toBe('real_product_capture');
    expect(plan.productionRequirements).toEqual(
      expect.arrayContaining([expect.objectContaining({ capability: 'real_product_capture', truthCritical: true })]),
    );
  });

  it('makes generative source footage explicit for a teach video but never calls it proof', () => {
    const plan = planPackageStory({
      family: 'teach',
      format: 'video',
      hook: 'Honey and maple syrup do not bake the same.',
      premise: 'Viscosity and water content change browning and structure.',
      payoff: 'Change the method with the ingredient.',
      targetSeconds: 15,
    });
    expect(plan.productionRequirements).toEqual(
      expect.arrayContaining([expect.objectContaining({ capability: 'generated_broll', quality: 'premium' })]),
    );
    expect(plan.beats.filter((beat) => beat.purpose === 'proof')).toHaveLength(0);
  });

  it('plans a carousel as swipe-worthy frames rather than a caption pasted on slides', () => {
    const plan = planPackageStory({
      family: 'transformation',
      format: 'carousel',
      hook: 'The ingredient changed. The method has to change too.',
      premise: 'Show the mechanism in four concise steps.',
      payoff: 'Keep the recipe; change the rules.',
      hasProductArtifact: true,
    });
    expect(plan.beats).toHaveLength(4);
    expect(plan.beats[0]?.purpose).toBe('hook');
    expect(plan.beats.at(-1)?.purpose).toBe('payoff');
    expect(plan.visual.forbiddenShortcuts?.join(' ')).toMatch(/PowerPoint/);
  });

  it('finds variants and emits stable learning features', () => {
    const pkg = basePackage();
    const variant = variantIn(pkg, 'variant-tiktok');
    expect(variant?.platform).toBe('tiktok');
    expect(creativeFeatures(pkg, variant)).toMatchObject({
      content_family: 'transformation',
      objective: 'activation',
      platform: 'tiktok',
      format: 'video',
      visual_language: 'fast_cut_creator',
      narration: 'synthetic',
      real_product_capture: true,
      generated_beats: 1,
    });
  });
});
