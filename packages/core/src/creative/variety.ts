import type { ContentFamily, CreativePackageVariant } from './package.js';
import type { CreativeType } from './plan.js';

export const CREATIVE_OPENING_STYLES = [
  'result_first',
  'motion_first',
  'question_first',
  'contrarian',
  'search_answer',
  'side_by_side',
  'mechanism_first',
  'story_first',
  'saveable_rule',
  'proof_first',
] as const;
export type CreativeOpeningStyle = (typeof CREATIVE_OPENING_STYLES)[number];

export const CREATIVE_MEDIA_MODES = [
  'real_product_proof',
  'mixed_broll_capture',
  'motion_editorial',
  'designed_static',
  'text_native',
  'search_utility',
] as const;
export type CreativeMediaMode = (typeof CREATIVE_MEDIA_MODES)[number];

export const CREATIVE_AUDIO_MODES = [
  'text_only',
  'silent_captioned',
  'narrated',
  'natural_sound',
] as const;
export type CreativeAudioMode = (typeof CREATIVE_AUDIO_MODES)[number];

export const CAPTION_JOBS = ['extend', 'debate', 'save', 'search', 'context', 'convert'] as const;
export type CaptionJob = (typeof CAPTION_JOBS)[number];

export interface CreativeVariation {
  treatment: CreativeType;
  openingStyle: CreativeOpeningStyle;
  mediaMode: CreativeMediaMode;
  audioMode: CreativeAudioMode;
  captionJob: CaptionJob;
}

/**
 * Product-neutral variation palettes.
 *
 * These encode ways to tell a story, never product subjects. Product truth,
 * examples and audience language still come from Product Brain / CreativePackage.
 */
export const FAMILY_VARIATIONS: Record<ContentFamily, readonly CreativeVariation[]> = {
  proof_demo: [
    { treatment: 'feature_demo', openingStyle: 'proof_first', mediaMode: 'real_product_proof', audioMode: 'narrated', captionJob: 'context' },
    { treatment: 'tutorial', openingStyle: 'result_first', mediaMode: 'real_product_proof', audioMode: 'silent_captioned', captionJob: 'extend' },
    { treatment: 'process_montage', openingStyle: 'motion_first', mediaMode: 'mixed_broll_capture', audioMode: 'natural_sound', captionJob: 'context' },
    { treatment: 'comparison', openingStyle: 'side_by_side', mediaMode: 'real_product_proof', audioMode: 'narrated', captionJob: 'debate' },
  ],
  transformation: [
    { treatment: 'before_after', openingStyle: 'result_first', mediaMode: 'mixed_broll_capture', audioMode: 'silent_captioned', captionJob: 'extend' },
    { treatment: 'comparison', openingStyle: 'side_by_side', mediaMode: 'mixed_broll_capture', audioMode: 'narrated', captionJob: 'debate' },
    { treatment: 'process_montage', openingStyle: 'motion_first', mediaMode: 'mixed_broll_capture', audioMode: 'natural_sound', captionJob: 'context' },
    { treatment: 'myth_fact', openingStyle: 'contrarian', mediaMode: 'motion_editorial', audioMode: 'narrated', captionJob: 'debate' },
  ],
  teach: [
    { treatment: 'how_to', openingStyle: 'mechanism_first', mediaMode: 'motion_editorial', audioMode: 'narrated', captionJob: 'save' },
    { treatment: 'myth_fact', openingStyle: 'contrarian', mediaMode: 'motion_editorial', audioMode: 'silent_captioned', captionJob: 'debate' },
    { treatment: 'listicle', openingStyle: 'saveable_rule', mediaMode: 'designed_static', audioMode: 'text_only', captionJob: 'save' },
    { treatment: 'comparison', openingStyle: 'side_by_side', mediaMode: 'motion_editorial', audioMode: 'narrated', captionJob: 'extend' },
    { treatment: 'tutorial', openingStyle: 'search_answer', mediaMode: 'motion_editorial', audioMode: 'silent_captioned', captionJob: 'search' },
  ],
  story_pov: [
    { treatment: 'comparison', openingStyle: 'story_first', mediaMode: 'text_native', audioMode: 'text_only', captionJob: 'debate' },
    { treatment: 'myth_fact', openingStyle: 'contrarian', mediaMode: 'motion_editorial', audioMode: 'narrated', captionJob: 'debate' },
    { treatment: 'announcement', openingStyle: 'question_first', mediaMode: 'designed_static', audioMode: 'text_only', captionJob: 'context' },
    { treatment: 'process_montage', openingStyle: 'motion_first', mediaMode: 'mixed_broll_capture', audioMode: 'natural_sound', captionJob: 'context' },
  ],
  entertainment_social: [
    { treatment: 'comparison', openingStyle: 'question_first', mediaMode: 'text_native', audioMode: 'text_only', captionJob: 'debate' },
    { treatment: 'myth_fact', openingStyle: 'contrarian', mediaMode: 'motion_editorial', audioMode: 'silent_captioned', captionJob: 'debate' },
    { treatment: 'listicle', openingStyle: 'saveable_rule', mediaMode: 'designed_static', audioMode: 'text_only', captionJob: 'debate' },
    { treatment: 'process_montage', openingStyle: 'motion_first', mediaMode: 'mixed_broll_capture', audioMode: 'natural_sound', captionJob: 'context' },
  ],
  creator_style: [
    { treatment: 'tutorial', openingStyle: 'question_first', mediaMode: 'mixed_broll_capture', audioMode: 'narrated', captionJob: 'extend' },
    { treatment: 'comparison', openingStyle: 'contrarian', mediaMode: 'mixed_broll_capture', audioMode: 'narrated', captionJob: 'debate' },
    { treatment: 'process_montage', openingStyle: 'motion_first', mediaMode: 'mixed_broll_capture', audioMode: 'natural_sound', captionJob: 'context' },
  ],
};

export function creativeVariationFor(
  family: ContentFamily,
  ordinal: number,
  recentTreatments: readonly string[] = [],
): CreativeVariation {
  const options = FAMILY_VARIATIONS[family];
  const start = Math.abs(ordinal) % options.length;
  for (let offset = 0; offset < options.length; offset += 1) {
    const option = options[(start + offset) % options.length]!;
    if (!recentTreatments.slice(0, 2).includes(option.treatment)) return { ...option };
  }
  return { ...options[start]! };
}

/**
 * Preserve the package treatment while adapting the execution to the
 * destination. Same idea; genuinely native finish.
 */
export function adaptVariationForPlatform(
  variation: CreativeVariation,
  platform: string,
  format: CreativePackageVariant['format'] | string,
): CreativeVariation {
  if (format === 'text') {
    return {
      ...variation,
      openingStyle: platform === 'x' || platform === 'threads' ? 'question_first' : variation.openingStyle,
      mediaMode: 'text_native',
      audioMode: 'text_only',
      captionJob: platform === 'x' || platform === 'threads' ? 'debate' : variation.captionJob,
    };
  }

  if (platform === 'pinterest' || format === 'pin') {
    return {
      ...variation,
      openingStyle: 'search_answer',
      mediaMode: 'search_utility',
      audioMode: 'text_only',
      captionJob: 'search',
    };
  }

  if (format === 'carousel' || format === 'image') {
    return {
      ...variation,
      openingStyle: variation.openingStyle === 'motion_first' ? 'saveable_rule' : variation.openingStyle,
      mediaMode: 'designed_static',
      audioMode: 'text_only',
      captionJob: platform === 'instagram' ? 'save' : variation.captionJob,
    };
  }

  if (format === 'video') {
    /*
     * A video cannot stay text-native/designed-static/search-utility just
     * because the base package came from a conversational or saveable family.
     * Those are valid package ideas and invalid moving-media executions.
     */
    const videoMediaMode: CreativeMediaMode =
      variation.mediaMode === 'real_product_proof' ||
      variation.mediaMode === 'mixed_broll_capture' ||
      variation.mediaMode === 'motion_editorial'
        ? variation.mediaMode
        : 'motion_editorial';
    const videoAudioMode: CreativeAudioMode =
      variation.audioMode === 'text_only' ? 'silent_captioned' : variation.audioMode;

    if (platform === 'tiktok') {
      return {
        ...variation,
        openingStyle: ['result_first', 'contrarian'].includes(variation.openingStyle)
          ? variation.openingStyle
          : 'motion_first',
        mediaMode: videoMediaMode,
        audioMode: videoAudioMode,
        captionJob: 'debate',
      };
    }
    if (platform === 'youtube') {
      return {
        ...variation,
        openingStyle: variation.openingStyle === 'motion_first' ? 'search_answer' : variation.openingStyle,
        mediaMode: videoMediaMode,
        audioMode: videoAudioMode,
        captionJob: 'search',
      };
    }
    if (platform === 'instagram') {
      return {
        ...variation,
        openingStyle: variation.openingStyle === 'question_first' ? 'result_first' : variation.openingStyle,
        mediaMode: videoMediaMode,
        audioMode: videoAudioMode,
        captionJob: 'save',
      };
    }
    return { ...variation, mediaMode: videoMediaMode, audioMode: videoAudioMode };
  }

  return { ...variation };
}

export function variationKey(v: CreativeVariation): string {
  return [v.treatment, v.openingStyle, v.mediaMode, v.audioMode, v.captionJob].join(':');
}
