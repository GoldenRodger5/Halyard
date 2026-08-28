/**
 * Sound design. §233.
 *
 * ## Why an effect is not a small music bed
 *
 * A bed is chosen by mood, energy and tempo and has to cover a runtime. An
 * effect is chosen by *what moment it marks* and is a fraction of a second.
 * They share only a licence discipline, which is why `sound_effects` is its
 * own table rather than a `kind` column on `music_beds`.
 *
 * ## Placement is derived, never decorative
 *
 * Every effect here is anchored to something the edit already decided: a
 * transition marks a transition that exists, an accent marks a word the
 * motion grammar already chose to emphasise, a UI sound marks a real product
 * interaction in captured footage. Nothing is placed "for energy".
 *
 * That constraint is what keeps this from becoming the thing the brief warns
 * about — an effects showcase. A whoosh on every cut is not sound design, it
 * is a tic, and the density cap below is deliberately low.
 *
 * ## It ships empty
 *
 * Like `music_beds`, the library starts with nothing in it, and the selector
 * says so rather than substituting. Synthesising a whoosh with FFmpeg would
 * be ours outright and would sound synthesised, which is worse than silence.
 */

export type SfxRole = 'transition' | 'impact' | 'accent' | 'ui' | 'ambience' | 'texture';

export interface SoundEffect {
  id: string;
  assetId: string;
  title: string;
  role: SfxRole;
  durationSeconds: number;
  peakDb: number;
  licence: string;
  attributionRequired: boolean;
  attributionText: string | null;
  platformRestrictions: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
}

export interface SfxCue {
  role: SfxRole;
  /** Seconds from the start of the piece. */
  atSeconds: number;
  /** Level relative to the mix. Never above the voice. */
  gainDb: number;
  /** What in the edit this marks, for the record and for QC. */
  because: string;
}

/**
 * The most effects a piece may carry, as a rate.
 *
 * One every four seconds is already busy. Above that a viewer stops hearing
 * individual sounds and starts hearing production, which is the opposite of
 * the point.
 */
export const MAX_SFX_PER_SECOND = 0.25;

/** Under the voice, always. An effect that competes with narration is a mistake. */
export const SFX_GAIN_DB: Record<SfxRole, number> = {
  transition: -20,
  impact: -16,
  accent: -22,
  ui: -20,
  ambience: -30,
  texture: -24,
};

export interface SfxPlanInput {
  /** Beats with their resolved start times and motion. */
  beats: Array<{
    startSeconds: number;
    role: string;
    transitionOut?: string;
    entrance?: string;
    hasMedia?: boolean;
    /** True when this beat plays captured product footage. */
    isProductFootage?: boolean;
  }>;
  totalSeconds: number;
  visualLanguage?: string | null;
  /** Languages that do not take sound design at all. */
  hasVoiceover: boolean;
}

/**
 * Languages where sound design is wrong rather than merely unnecessary.
 *
 * A documentary or cinematic cut earns its pace from the picture; punctuating
 * it with whooshes makes it read as a corporate sizzle reel. This is a refusal
 * list, not a preference — the effects are simply not planned.
 */
const NO_SOUND_DESIGN = new Set(['documentary', 'cinematic', 'editorial_food']);

/**
 * Where effects belong in this piece.
 *
 * Returns cues, not audio. Whether any of them can actually be filled depends
 * on the library, which is a separate question answered by `selectEffect`.
 */
export function planSfx(input: SfxPlanInput): { cues: SfxCue[]; refusedReason: string | null } {
  if (input.visualLanguage && NO_SOUND_DESIGN.has(input.visualLanguage)) {
    return {
      cues: [],
      refusedReason: `A ${input.visualLanguage} cut earns its pace from the picture; punctuating it reads as a sizzle reel.`,
    };
  }

  const cues: SfxCue[] = [];

  input.beats.forEach((beat, index) => {
    const next = input.beats[index + 1];

    /*
     * A transition sound marks a transition that already exists. A `cut` gets
     * nothing — the whole point of a hard cut is that it is instant, and a
     * whoosh over one turns it into a wipe.
     */
    if (next && beat.transitionOut && beat.transitionOut !== 'cut') {
      cues.push({
        role: 'transition',
        atSeconds: next.startSeconds,
        gainDb: SFX_GAIN_DB.transition,
        because: `${beat.transitionOut} into beat ${index + 2}`,
      });
    }

    /* A pop entrance is a landing, and a landing can take an impact. */
    if (beat.entrance === 'pop' && index > 0) {
      cues.push({
        role: 'impact',
        atSeconds: beat.startSeconds,
        gainDb: SFX_GAIN_DB.impact,
        because: `beat ${index + 1} enters on a pop`,
      });
    }

    /*
     * A real product interaction, not a generic UI blip over any screen. The
     * distinction matters: a tap sound over footage where nothing is tapped
     * is a fabricated interaction, in the same family as a fabricated
     * screenshot.
     */
    if (beat.isProductFootage) {
      cues.push({
        role: 'ui',
        atSeconds: beat.startSeconds + 0.4,
        gainDb: SFX_GAIN_DB.ui,
        because: `captured product interaction in beat ${index + 1}`,
      });
    }
  });

  /*
   * Thin to the density cap, keeping the earliest cues. The opening is where
   * punctuation does the most work, and a piece that gets busier as it goes
   * is the wrong shape.
   */
  const cap = Math.floor(input.totalSeconds * MAX_SFX_PER_SECOND);
  const kept = cues.sort((a, b) => a.atSeconds - b.atSeconds).slice(0, Math.max(0, cap));

  return {
    cues: kept,
    refusedReason:
      kept.length === 0 && cues.length > 0
        ? `All ${cues.length} cues exceeded the density cap for a ${input.totalSeconds}s piece.`
        : null,
  };
}

export interface SfxSelection {
  cue: SfxCue;
  effect: SoundEffect | null;
  /** Why nothing was chosen. Null when one was. */
  silenceReason: string | null;
}

/**
 * Fill a cue from the library, or say why it stays silent.
 *
 * Licence is a gate, exactly as it is for music (§221): an effect whose terms
 * exclude the platform is refused there even when it is the only one that
 * fits. An empty library is reported, never substituted.
 */
export function selectEffect(
  library: SoundEffect[],
  cue: SfxCue,
  platform: string,
  now: Date = new Date(),
): SfxSelection {
  const candidates = library.filter((e) => e.role === cue.role);
  if (candidates.length === 0) {
    return {
      cue,
      effect: null,
      silenceReason:
        library.length === 0
          ? 'The sound effect library is empty. Add licensed audio and these cues fill themselves.'
          : `No effect in the library plays the '${cue.role}' role.`,
    };
  }

  const permitted = candidates.filter((e) => {
    if (e.expiresAt && e.expiresAt <= now) return false;
    if (e.platformRestrictions.includes(platform)) return false;
    return true;
  });
  if (permitted.length === 0) {
    return {
      cue,
      effect: null,
      silenceReason: `Every '${cue.role}' effect is either expired or not licensed for ${platform}.`,
    };
  }

  /* Least recently used, so a three-effect library does not become one. */
  const chosen = [...permitted].sort((a, b) => {
    const at = a.lastUsedAt?.getTime() ?? 0;
    const bt = b.lastUsedAt?.getTime() ?? 0;
    return at - bt;
  })[0]!;

  return { cue, effect: chosen, silenceReason: null };
}
