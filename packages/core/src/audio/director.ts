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

/**
 * §311. The moods, as a value rather than only a type.
 *
 * A type cannot be iterated, so anything that has to cover every mood — the
 * music import, its test — had to copy the list, and a copied list drifts. This
 * is the same shape as gotcha 1 and it is cheaper to prevent here.
 */
export const BED_MOODS = [
  'warm',
  'bright',
  'calm',
  'driving',
  'playful',
  'tense',
  'melancholy',
  'confident',
] as const;

export type BedMood = (typeof BED_MOODS)[number];

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

  /* ── §239. What a production library actually needs ────────────────────── */

  /**
   * Whether this bed may reach a published post.
   *
   * The one column that makes a fixture library safe to have. Test audio was
   * never the danger; test audio *indistinguishable from licensed audio* was.
   */
  provenance: 'licensed_production' | 'test' | 'unverified';
  /** Where the grant can be checked. A licence with no proof is unverified. */
  licenceProof?: string | null;
  source?: string | null;
  /** Platforms this bed must NOT be used on, distinct from the allow-list. */
  prohibitedPlatforms?: string[];
  /** A vocal bed under a voiceover is two people talking at once. */
  hasVocals?: boolean;
  genre?: string | null;
  instrumentation?: string[];
  /** Retired without deleting, so its usage history survives. */
  active?: boolean;
  usageCount?: number;
  /** Accounts this bed is barred from, when a licence is per-channel. */
  accountRestrictions?: string[];
}

/** One past use, for repetition avoidance and learned preference. §239. */
export interface BedUsage {
  musicBedId: string;
  accountId?: string | null;
  platform: string;
  treatment?: string | null;
  visualLanguage?: string | null;
  usedAt: Date;
  /** Performance, once the post has any. Null means unmeasured. */
  score?: number | null;
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

  /* ── §239. The rest of what the choice should turn on ──────────────────── */

  /** The treatment, so a transformation and a tutorial do not sound alike. */
  treatment?: string | null;
  /** The account, so repetition is judged in the feed a viewer actually sees. */
  accountId?: string | null;
  /** How much the frame is moving. Music below the picture reads as flat. */
  motionDensity?: number | null;
  /**
   * Whether this piece may be published.
   *
   * `true` restricts selection to `licensed_production`. A preview or a
   * regression render sets it false and may use a fixture — which is the whole
   * reason the fixture library is safe to have.
   */
  forPublication?: boolean;
  /** Past uses on this account, most recent first. */
  history?: BedUsage[];
  /** What measurement established about music, from §204. */
  insights?: Array<{ feature: string; featureValue: string; lift: number; confidence: number }>;
  /* Recorded on the usage row, so a choice is answerable months later. */
  contentItemId?: string | null;
  briefId?: string | null;
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
  /**
   * Whether this is for something that will be published. §239.
   *
   * The gate that makes a fixture library safe. A preview, a regression render
   * or a Studio proof may use a `test` bed; a post may not, and the refusal
   * names the class rather than saying "no licence".
   */
  forPublication = true,
  accountId?: string | null,
): { allowed: boolean; reason: string } {
  if (bed.active === false) {
    return { allowed: false, reason: 'Retired from the library.' };
  }
  if (forPublication && bed.provenance !== 'licensed_production') {
    return {
      allowed: false,
      reason:
        bed.provenance === 'test'
          ? 'A test fixture. Usable for previews and regression renders, never for a post.'
          : 'Licence not verified. Record where the grant can be checked, then mark it licensed_production.',
    };
  }
  if (bed.provenance === 'licensed_production' && !bed.licenceProof?.trim()) {
    /* Belt and braces: the database constraint says the same thing, and a bed
       arriving from a fixture or an older row should not slip past it. */
    return { allowed: false, reason: 'Claims a production licence with no proof recorded.' };
  }
  if (accountId && bed.accountRestrictions?.includes(accountId)) {
    return { allowed: false, reason: 'The licence does not cover this account.' };
  }
  if (bed.prohibitedPlatforms?.includes(platform)) {
    return { allowed: false, reason: `Expressly prohibited on ${platform}.` };
  }
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
    const licence = bedPermitted(
      bed,
      brief.platform,
      now,
      /* Absent means this is for a post. A caller that wants a fixture must
         say so explicitly, rather than a fixture leaking in by default. */
      brief.forPublication !== false,
      brief.accountId,
    );
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
  const history = brief.history ?? [];

  const scored = eligible.map((bed): BedChoice => {
    const reasons: string[] = [];

    const moodMatch = bed.mood === wantMood ? 1 : 0;
    if (moodMatch) reasons.push(`${bed.mood} suits ${brief.treatment ?? 'the piece'}`);

    /* Energy distance, inverted. A bed half a point away is a poor fit. */
    const energyFit = 1 - Math.min(1, Math.abs(bed.energy - wantEnergy) / 0.5);
    if (energyFit > 0.7) reasons.push(`energy ${bed.energy} near the ${wantEnergy.toFixed(2)} the cut rhythm wants`);

    const tempoFit =
      wantBpm && bed.bpm ? 1 - Math.min(1, Math.abs(bed.bpm - wantBpm) / 60) : 0.5;
    if (wantBpm && bed.bpm && tempoFit > 0.75) {
      reasons.push(`${bed.bpm}bpm matched to a ${Math.round(brief.cutsPerMinute ?? 0)}-cut-per-minute edit`);
    }

    /*
     * §239. A vocal bed under a voiceover is two people talking at once.
     *
     * The single most audible mistake in this whole module, and the cheapest
     * to avoid — so it is a heavy penalty rather than a tiebreak, but not a
     * refusal: a vocal bed under a piece with no narration is fine.
     */
    let vocalPenalty = 0;
    if (brief.hasVoiceover && bed.hasVocals) {
      vocalPenalty = 2.5;
      reasons.push('vocals under narration — heavily penalised');
    } else if (brief.hasVoiceover && bed.hasVocals === false) {
      reasons.push('instrumental, so it does not fight the voice');
    }

    /*
     * Music that sits below the picture reads as flat. A fast cut wants a bed
     * with energy behind it; a still, considered piece wants the opposite, and
     * the mismatch is worse in that direction because loud music over nothing
     * happening is the sound of a template.
     */
    let motionPenalty = 0;
    if (typeof brief.motionDensity === 'number') {
      const gap = bed.energy - brief.motionDensity;
      if (gap < -0.3) {
        motionPenalty = 0.9;
        reasons.push('quieter than the picture is moving');
      } else if (gap > 0.35) {
        motionPenalty = 0.6;
        reasons.push('busier than the picture');
      }
    }

    /*
     * §239. Repetition judged in the feed a viewer actually sees.
     *
     * `lastUsedAt` is global; this account's own history is what somebody
     * scrolling it would notice. Both count, and the account's own weighs more.
     */
    const daysSince = bed.lastUsedAt ? (now.getTime() - bed.lastUsedAt.getTime()) / DAY : 999;
    const recency = daysSince >= 14 ? 0 : (14 - daysSince) / 14;

    const onAccount = history.filter((u) => u.musicBedId === bed.id);
    const postsSince = onAccount.length === 0 ? 999 : history.indexOf(onAccount[0]!);
    let accountRepetition = 0;
    if (onAccount.length > 0) {
      /* Within the last ten posts on this account is where a repeat is heard. */
      accountRepetition = postsSince >= 10 ? 0 : (10 - postsSince) / 10;
      if (accountRepetition > 0.4) {
        reasons.push(`used ${postsSince + 1} post${postsSince === 0 ? '' : 's'} ago on this account`);
      }
    } else {
      reasons.push('not used by this account');
    }

    /*
     * What measurement established. Weighted below fit, because an insight is
     * a belief with a confidence rather than a fact, and music is a weak
     * signal that is easy to over-attribute.
     */
    let learned = 0;
    for (const insight of brief.insights ?? []) {
      const matches =
        (insight.feature === 'music_bed' && insight.featureValue === bed.id) ||
        (insight.feature === 'music_mood' && insight.featureValue === bed.mood);
      if (matches) {
        learned += insight.lift * insight.confidence * 1.5;
        reasons.push(
          `${insight.lift >= 0 ? 'historically strong' : 'historically weak'} for this account`,
        );
      }
    }

    const score =
      moodMatch * 2.0 +
      energyFit * 1.5 +
      tempoFit * 0.8 +
      learned -
      recency * 0.8 -
      accountRepetition * 1.6 -
      vocalPenalty -
      motionPenalty;

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
