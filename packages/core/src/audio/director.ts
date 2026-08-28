/**
 * The Music Director. §221.
 *
 * Halyard's mixer, ducking and loudness normalisation have been built and
 * tested for months against a library of zero beds — so every video it has
 * produced ships narration-only. The selection that existed rotated
 * least-recently-used and knew nothing about what any track sounded like.
 *
 * ## Why deterministic
 *
 * Matching a bed to a piece is comparison against stated metadata: does the
 * mood suit the emotional angle, does the energy suit the pacing, is the
 * tempo near the cut rhythm, does the licence permit this platform. Every term
 * is a number or a fact somebody wrote down. A model would make this
 * unauditable and, worse, would confidently pick a track whose licence forbids
 * the platform — which is a legal problem, not a taste one.
 *
 * ## Licence is a gate, not a tiebreak
 *
 * A bed whose licence does not cover the platform is not a worse choice, it is
 * not a choice. It is filtered before scoring, and the reason is reported —
 * the same shape as `licenceAllows` for imagery (§216), and for the same
 * reason: an operator who sees a track rejected needs to know it was legal and
 * not aesthetic.
 *
 * ## Silence is a decision, not a default
 *
 * `selectBed` returning null means "no bed fits", and the caller must then
 * decide whether that is acceptable. A short-form video with no audio is a
 * real creative choice occasionally and an accident usually, so the refusal
 * carries a reason that distinguishes the two.
 */

export type BedMood =
  | 'warm'
  | 'bright'
  | 'calm'
  | 'driving'
  | 'playful'
  | 'tense'
  | 'melancholy'
  | 'confident';

export interface MusicBed {
  id: string;
  assetId: string;
  title: string;
  mood: BedMood;
  /** 0..1 as stated by the licensor. */
  energy: number;
  bpm?: number | null;
  durationSeconds: number;
  loopable: boolean;
  introSeconds?: number | null;
  licence: string;
  attributionRequired: boolean;
  attributionText?: string | null;
  /** Platforms this licence does NOT cover. */
  platformRestrictions: string[];
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
}

/**
 * What the piece needs, from the creative direction rather than from taste.
 *
 * Derived by the caller from the concept's emotional angle and the plan's
 * pacing, so the same brief produces the same bed on every run.
 */
export interface AudioBrief {
  platform: string;
  /** The concept's emotional angle, when it declared one. */
  emotionalAngle?: string | null;
  /** The visual language the motion grammar chose (§220). */
  visualLanguage?: string | null;
  /** How long the piece runs. */
  targetSeconds: number;
  /** Cuts per minute, from the beat plan. Drives the tempo match. */
  cutsPerMinute?: number | null;
  /** True when narration will sit on top and the bed must stay under it. */
  hasVoiceover: boolean;
}

/**
 * The mood a piece wants, from what the creative already decided.
 *
 * The emotional angle wins when the concept stated one — it is the more
 * specific signal and a person chose it. Visual language is the fallback,
 * because a documentary cut and a kinetic cut genuinely want different beds.
 */
export function moodFor(brief: AudioBrief): BedMood {
  const angle = (brief.emotionalAngle ?? '').toLowerCase();
  if (angle.includes('surprise') || angle.includes('delight')) return 'playful';
  if (angle.includes('relief') || angle.includes('calm')) return 'calm';
  if (angle.includes('recognition')) return 'warm';
  if (angle.includes('curio')) return 'bright';
  if (angle.includes('urgen') || angle.includes('tens')) return 'tense';

  switch (brief.visualLanguage) {
    case 'kinetic':
      return 'driving';
    case 'editorial_cut':
      return 'confident';
    case 'product_led':
      return 'bright';
    case 'documentary':
      return 'warm';
    default:
      return 'warm';
  }
}

/** Energy a piece wants, 0..1, from its cut rhythm. */
export function energyFor(brief: AudioBrief): number {
  const cuts = brief.cutsPerMinute ?? 12;
  /* Twelve cuts a minute is a calm explainer; forty is a montage. */
  const fromRhythm = Math.max(0, Math.min(1, (cuts - 8) / 32));
  /* Narration wants headroom — a bed competing with a voice is the single most
     common way a mix goes wrong. */
  return brief.hasVoiceover ? Math.min(fromRhythm, 0.62) : fromRhythm;
}

export interface BedRejection {
  bed: MusicBed;
  reason: string;
}

export interface BedChoice {
  bed: MusicBed;
  score: number;
  reasons: string[];
  /** True when a credit must be rendered for this bed to be usable. */
  requiresAttribution: boolean;
}

export interface BedSelection {
  chosen: BedChoice | null;
  /** Beds the licence excluded, with the reason. Never silently dropped. */
  rejected: BedRejection[];
  considered: number;
  /** Why there is no bed, when there is none. */
  silenceReason?: string;
}

/**
 * Can this bed legally back this piece?
 *
 * Checked before scoring. A licence problem is not a lower score.
 */
export function bedPermitted(
  bed: MusicBed,
  platform: string,
  now: Date = new Date(),
): { allowed: boolean; reason: string } {
  if (!bed.licence || !bed.licence.trim()) {
    return { allowed: false, reason: 'No licence terms recorded. "Probably fine" is not a licence.' };
  }
  if (bed.expiresAt && bed.expiresAt.getTime() <= now.getTime()) {
    return { allowed: false, reason: `Licence expired ${bed.expiresAt.toISOString().slice(0, 10)}.` };
  }
  if (bed.platformRestrictions.includes(platform)) {
    return { allowed: false, reason: `Licence does not cover ${platform}.` };
  }
  if (bed.attributionRequired && !bed.attributionText?.trim()) {
    return {
      allowed: false,
      reason: 'Attribution is required and no attribution text was supplied to render.',
    };
  }
  return { allowed: true, reason: 'Licensed for this use.' };
}

/**
 * Whether a bed can cover the runtime without an audible seam.
 *
 * A 12-second file under a 30-second piece needs a clean loop; without one the
 * options are a seam or silence, and silence is the honest one.
 */
export function coversRuntime(bed: MusicBed, targetSeconds: number): boolean {
  if (bed.durationSeconds >= targetSeconds) return true;
  return bed.loopable;
}

const DAY = 86_400_000;

/**
 * Choose a bed.
 *
 * Licence first, runtime second, then a score over mood, energy and tempo with
 * a recency penalty — the same rotation reasoning the previous implementation
 * had, kept because sixty posts a month over three beds makes repetition the
 * first thing a viewer notices.
 */
export function selectBed(
  beds: MusicBed[],
  brief: AudioBrief,
  now: Date = new Date(),
): BedSelection {
  const rejected: BedRejection[] = [];
  const eligible: MusicBed[] = [];

  for (const bed of beds) {
    const licence = bedPermitted(bed, brief.platform, now);
    if (!licence.allowed) {
      rejected.push({ bed, reason: licence.reason });
      continue;
    }
    if (!coversRuntime(bed, brief.targetSeconds)) {
      rejected.push({
        bed,
        reason: `${bed.durationSeconds}s and not loopable; the piece runs ${brief.targetSeconds}s.`,
      });
      continue;
    }
    eligible.push(bed);
  }

  if (eligible.length === 0) {
    return {
      chosen: null,
      rejected,
      considered: beds.length,
      silenceReason:
        beds.length === 0
          ? 'The music library is empty. Every video ships narration-only until licensed beds are added.'
          : `No bed is usable here: ${rejected.map((r) => r.reason).join(' ')}`,
    };
  }

  const wantMood = moodFor(brief);
  const wantEnergy = energyFor(brief);
  const wantBpm = brief.cutsPerMinute ? Math.max(60, Math.min(180, brief.cutsPerMinute * 4)) : null;

  const scored = eligible.map((bed): BedChoice => {
    const reasons: string[] = [];

    const moodMatch = bed.mood === wantMood ? 1 : 0;
    if (moodMatch) reasons.push(`${bed.mood} suits the piece`);

    /* Energy distance, inverted. A bed half a point away is a poor fit. */
    const energyFit = 1 - Math.min(1, Math.abs(bed.energy - wantEnergy) / 0.5);
    if (energyFit > 0.7) reasons.push(`energy ${bed.energy} near the ${wantEnergy.toFixed(2)} the cut rhythm wants`);

    const tempoFit =
      wantBpm && bed.bpm ? 1 - Math.min(1, Math.abs(bed.bpm - wantBpm) / 60) : 0.5;
    if (wantBpm && bed.bpm && tempoFit > 0.75) reasons.push(`${bed.bpm}bpm sits with the cuts`);

    /* Recency. Anything used in the last fortnight is penalised, most heavily
       if it was the last thing used. */
    const daysSince = bed.lastUsedAt ? (now.getTime() - bed.lastUsedAt.getTime()) / DAY : 999;
    const recency = daysSince >= 14 ? 0 : (14 - daysSince) / 14;
    if (recency > 0.5) reasons.push('recently used');

    const score =
      moodMatch * 2.0 + energyFit * 1.5 + tempoFit * 0.8 - recency * 1.2;

    return {
      bed,
      score: Math.round(score * 100) / 100,
      reasons,
      requiresAttribution: bed.attributionRequired,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return { chosen: scored[0]!, rejected, considered: beds.length };
}

/**
 * How loud the bed sits under narration.
 *
 * Returned as a target rather than applied here — the mixer owns the audio and
 * this owns the decision, which is the same split as the motion grammar and
 * the renderer.
 */
export function duckingFor(brief: AudioBrief): { bedGainDb: number; duckDb: number } {
  if (!brief.hasVoiceover) {
    /* Music carries it alone, so it may sit where the loudness target wants. */
    return { bedGainDb: -14, duckDb: 0 };
  }
  return {
    /* Under a voice, a bed belongs far enough down that a listener stops
       hearing it as a separate thing. */
    bedGainDb: -26,
    duckDb: -8,
  };
}
