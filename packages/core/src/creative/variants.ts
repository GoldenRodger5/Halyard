/**
 * Platform variants. §231.
 *
 * ## What "platform-specific" has to mean
 *
 * `platform_variants` has existed since §218 with columns for pacing, text
 * density, hook treatment, CTA and audio treatment — and **no writer**. The
 * only per-platform difference a render actually had was the caption budget
 * and the presentation register. A TikTok, a Reel and a Short got the same
 * file with different words underneath.
 *
 * They are not the same job. A TikTok is watched with sound on, thumb ready,
 * and punishes a slow open harder than anything else. A Reel is watched in a
 * feed that also contains photographs, so it competes on the first frame
 * rather than the first second. A Short is often the second thing a viewer
 * sees from a channel, so it can assume slightly more patience and rewards a
 * clear payoff over a fast one.
 *
 * ## Reuse, remix, or refuse
 *
 * Cross-posting the identical piece is the thing that makes an account read as
 * automated. But regenerating everything from scratch throws away the concept,
 * which is the expensive part and the part that was any good. So each variant
 * carries a `decision`:
 *
 * - `reuse`    — the same creative, because the platforms are close enough.
 * - `remix`    — same concept, materially different execution.
 * - `original` — this platform needs its own piece.
 * - `skip`     — this concept does not belong here at all.
 *
 * `skip` is the one that makes the rest honest. A system that always finds a
 * way to post everywhere is a system that posts things it should not.
 */

export type VariantDecision = 'reuse' | 'remix' | 'original' | 'skip';

export interface PlatformVariant {
  platform: string;
  aspectRatio: string;
  targetSeconds: number;
  /** Cuts per minute the edit should aim for. */
  pacing: 'slow' | 'steady' | 'fast' | 'very_fast';
  /** How much text may be on screen at once. */
  textDensity: 'minimal' | 'moderate' | 'dense';
  /** Which opening argument this platform rewards. */
  hookTreatment: 'immediate' | 'question' | 'visual' | 'stated';
  cta: string;
  audioTreatment: 'voice_led' | 'music_led' | 'voice_over_bed' | 'silent_captioned';
  decision: VariantDecision;
  decisionReason: string;
  /** Hours after the primary post before this one should go out. */
  spacingHours: number;
  /** True when this platform must not reuse the primary's hook wording. */
  needsOwnHook: boolean;
}

interface PlatformProfile {
  aspectRatio: string;
  seconds: [number, number];
  pacing: PlatformVariant['pacing'];
  textDensity: PlatformVariant['textDensity'];
  hookTreatment: PlatformVariant['hookTreatment'];
  cta: string;
  audioTreatment: PlatformVariant['audioTreatment'];
  /** Platforms whose creative is close enough to reuse from. */
  reuseFrom: string[];
  /** Hours of separation from the primary post. */
  spacingHours: number;
}

/**
 * What each surface actually is.
 *
 * These are behavioural facts about the feed, not preferences. Where two
 * platforms genuinely are close — Reels and Shorts are both 9:16 vertical
 * video watched in a scroll — `reuseFrom` says so rather than pretending a
 * difference exists.
 */
export const PLATFORM_PROFILES: Record<string, PlatformProfile> = {
  tiktok: {
    aspectRatio: '9:16',
    seconds: [15, 34],
    pacing: 'very_fast',
    textDensity: 'minimal',
    hookTreatment: 'immediate',
    cta: 'Comment and I will adapt yours',
    audioTreatment: 'voice_over_bed',
    reuseFrom: [],
    spacingHours: 0,
  },
  instagram: {
    /* A Reel competes on the first *frame*, because it sits in a grid beside
       photographs. Slightly longer and less frantic than TikTok. */
    aspectRatio: '9:16',
    seconds: [20, 45],
    pacing: 'fast',
    textDensity: 'moderate',
    hookTreatment: 'visual',
    cta: 'Save this for your next bake',
    audioTreatment: 'voice_over_bed',
    reuseFrom: ['tiktok'],
    spacingHours: 26,
  },
  youtube: {
    /* A Short is often the second thing a viewer sees from a channel, so it
       can assume a little more patience and rewards a clear payoff. */
    aspectRatio: '9:16',
    seconds: [25, 55],
    pacing: 'steady',
    textDensity: 'moderate',
    hookTreatment: 'stated',
    cta: 'Subscribe for more adaptations',
    audioTreatment: 'voice_led',
    reuseFrom: ['tiktok', 'instagram'],
    spacingHours: 50,
  },
  pinterest: {
    /* A still surface. Motion barely matters; legibility and keywords do. */
    aspectRatio: '2:3',
    seconds: [0, 0],
    pacing: 'slow',
    textDensity: 'dense',
    hookTreatment: 'stated',
    cta: 'Save the full adaptation',
    audioTreatment: 'silent_captioned',
    reuseFrom: [],
    spacingHours: 6,
  },
  x: {
    aspectRatio: '16:9',
    seconds: [12, 30],
    pacing: 'fast',
    textDensity: 'minimal',
    hookTreatment: 'stated',
    cta: '',
    audioTreatment: 'silent_captioned',
    reuseFrom: [],
    spacingHours: 3,
  },
  threads: {
    aspectRatio: '9:16',
    seconds: [12, 30],
    pacing: 'steady',
    textDensity: 'minimal',
    hookTreatment: 'question',
    cta: '',
    audioTreatment: 'silent_captioned',
    reuseFrom: ['tiktok'],
    spacingHours: 8,
  },
};

export interface VariantInput {
  /** The platform the concept was originally built for. */
  primaryPlatform: string;
  /** Every platform with a connected, publishable account. */
  platforms: string[];
  /** What the piece is. Some concepts do not travel. */
  treatment: string;
  /** True when the piece depends on a voiceover to make sense. */
  voiceCarriesMeaning?: boolean;
  /** True when the piece depends on captured product footage. */
  needsFootage?: boolean;
  hasFootage?: boolean;
  /** Formats an account cannot take, keyed by platform. */
  unsupported?: Record<string, string[]>;
}

/**
 * Treatments that do not travel, and why.
 *
 * A refusal list rather than a score. "This concept is wrong for Pinterest"
 * is a judgement that should be stated once and be visible, not emerge from
 * arithmetic nobody can read back.
 */
const DOES_NOT_TRAVEL: Record<string, Record<string, string>> = {
  pinterest: {
    process_montage: 'A montage is motion, and Pinterest is a still surface.',
    myth_fact: 'The reversal lands on a cut, and there is no cut on a pin.',
  },
  x: {
    how_to: 'A sequence needs room X does not give it.',
    process_montage: 'Montage without sound on a muted timeline is a slideshow.',
  },
  threads: {
    how_to: 'Threads rewards a single thought, not a sequence.',
  },
};

/**
 * Decide the variant for every platform.
 *
 * The primary always gets `original`. Everything else is judged on what it
 * would actually take to make the concept work there.
 */
export function planVariants(input: VariantInput): PlatformVariant[] {
  const out: PlatformVariant[] = [];

  for (const platform of input.platforms) {
    const profile = PLATFORM_PROFILES[platform];
    if (!profile) continue;

    const primary = platform === input.primaryPlatform;
    const blocked = DOES_NOT_TRAVEL[platform]?.[input.treatment];
    const unsupported = input.unsupported?.[platform];

    let decision: VariantDecision;
    let reason: string;

    if (primary) {
      decision = 'original';
      reason = 'The platform this concept was built for.';
    } else if (blocked) {
      decision = 'skip';
      reason = blocked;
    } else if (unsupported && unsupported.includes('video')) {
      decision = 'skip';
      reason = `The connected ${platform} account cannot take video.`;
    } else if (input.needsFootage && !input.hasFootage) {
      decision = 'skip';
      reason = 'The concept depends on product footage that does not exist.';
    } else if (
      profile.reuseFrom.includes(input.primaryPlatform) &&
      profile.aspectRatio === PLATFORM_PROFILES[input.primaryPlatform]?.aspectRatio
    ) {
      /*
       * Close enough to reuse — but only the *file*. A reused render still
       * gets its own copy, CTA and posting time, because those are what a
       * viewer who follows both accounts actually notices.
       */
      decision = 'reuse';
      reason = `Same canvas and a similar feed to ${input.primaryPlatform}; the edit carries over, the copy and timing do not.`;
    } else if (
      input.voiceCarriesMeaning &&
      profile.audioTreatment === 'silent_captioned'
    ) {
      decision = 'remix';
      reason = 'The piece depends on narration and this surface is watched muted, so the words have to move on screen.';
    } else {
      decision = 'remix';
      reason = `A ${profile.aspectRatio} ${profile.pacing} cut is a different edit from a ${
        PLATFORM_PROFILES[input.primaryPlatform]?.aspectRatio ?? '9:16'
      } one.`;
    }

    out.push({
      platform,
      aspectRatio: profile.aspectRatio,
      targetSeconds: Math.round((profile.seconds[0] + profile.seconds[1]) / 2),
      pacing: profile.pacing,
      textDensity: profile.textDensity,
      hookTreatment: profile.hookTreatment,
      cta: profile.cta,
      audioTreatment: profile.audioTreatment,
      decision,
      decisionReason: reason,
      spacingHours: primary ? 0 : profile.spacingHours,
      /*
       * A reused edit must not also reuse the wording. Two accounts posting
       * the identical hook a day apart is the single clearest tell that a
       * feed is automated, and it is the cheapest thing to vary.
       */
      needsOwnHook: !primary && decision !== 'skip',
    });
  }

  return out;
}

/** Cuts per minute a pacing implies, for the beat plan and the QC gate. */
export function cutsPerMinuteFor(pacing: PlatformVariant['pacing']): number {
  switch (pacing) {
    case 'very_fast': return 30;
    case 'fast': return 22;
    case 'steady': return 14;
    case 'slow': return 8;
  }
}
