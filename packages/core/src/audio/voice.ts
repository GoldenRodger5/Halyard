/**
 * The Voice Director. §232.
 *
 * ## Why every voiceover sounded the same
 *
 * `synthesize` took stability 0.55 and similarity 0.8 as defaults and nothing
 * ever passed anything else, so a playful 15-second TikTok and a considered
 * three-minute explainer were read in exactly the same voice at exactly the
 * same energy. Stability is not a quality setting — it is a *performance*
 * setting. High stability is consistent and flat; low stability is expressive
 * and varies between renders. Which one is right depends on the piece.
 *
 * ## What is directable and what is not
 *
 * ElevenLabs gives five levers that actually change delivery: the voice, the
 * model, stability, similarity boost and — since §480 — **speed**. It does not
 * expose per-word emphasis, so that is achieved in the script rather than in
 * the request: a comma is a pause, a short sentence is emphasis, and an em
 * dash is a beat. That is why `deliveryNotes` exists: the VO scriptwriter is
 * told how to write for the delivery, instead of the delivery being asked to
 * do something the API cannot do.
 *
 * ## §480 / §490 / §496. Speed is derived, not guessed
 *
 * The endpoint has a `speed` (0.7–1.2), verified live. Twice this session it
 * was set by hand and twice it was wrong, because the number it was aimed at
 * was measured over different things — the whole mix (127 wpm), whisper's
 * caption spans (139), the clips themselves (184). §487 settled the
 * measurement: **words over the seconds actually voiced**, which is the rate a
 * listener hears.
 *
 * So the speed is now computed rather than chosen. One measured constant says
 * how fast this voice articulates at speed 1.0; each energy names a target
 * inside the gate's 140–175 band; the speed is the ratio. When the voice or
 * the model changes, one number changes and every energy follows.
 *
 *     ARTICULATION_WPM_AT_1 = 194   measured 2 Sep: 184 wpm at speed 0.95
 */

export type VoiceEnergy = 'calm' | 'warm' | 'bright' | 'urgent';

export interface VoiceDirection {
  /** Which voice. Null means the account's configured brand voice. */
  voiceId: string | null;
  energy: VoiceEnergy;
  /**
   * 0–1. Low is expressive and varies between renders; high is consistent and
   * flat. A brand voice wants consistency; a hook wants expression.
   */
  stability: number;
  similarityBoost: number;
  /** §496. 0.7–1.2, derived from the energy's target rate and the measured articulation. */
  speed: number;
  /**
   * How the script should be written for this delivery.
   *
   * The half of voice direction the API cannot take. Passed to the VO
   * scriptwriter's prompt rather than to the synthesiser.
   */
  deliveryNotes: string[];
  reason: string;
}

export interface VoiceInput {
  platform: string;
  /** The visual language, so the voice matches the cut. */
  visualLanguage?: string | null;
  emotionalAngle?: string | null;
  targetSeconds: number;
  /** Set when the operator or the account pinned a specific voice. */
  voiceId?: string | null;
}

/**
 * Energy from the language, because a voice that fights the cut is worse than
 * a flat one.
 *
 * Named `voiceEnergyFor` rather than `energyFor`: the Music Director already
 * exports an `energyFor` that returns a *number* for bed matching, and two
 * different things with one name in one barrel is how a caller ends up
 * scoring a music bed against a voice setting.
 */
export function voiceEnergyFor(input: VoiceInput): VoiceEnergy {
  const angle = (input.emotionalAngle ?? '').toLowerCase();
  if (/urgen|frustrat|tens/.test(angle)) return 'urgent';
  if (/calm|relief|reassur/.test(angle)) return 'calm';
  if (/delight|surprise|fun|whims/.test(angle)) return 'bright';

  switch (input.visualLanguage) {
    case 'energetic_short':
    case 'fast_cut_creator':
    case 'bold_social':
      return 'urgent';
    case 'kinetic':
    case 'playful':
      return 'bright';
    case 'cinematic':
    case 'editorial_food':
    case 'documentary':
      return 'calm';
    default:
      return 'warm';
  }
}

/**
 * Settings per energy.
 *
 * Stability moves inversely with energy: an urgent read needs the model free
 * to push, a calm one needs it steady. The range is deliberately narrow —
 * below about 0.3 ElevenLabs starts producing genuinely different takes run to
 * run, which is unusable for a brand voice that has to sound like one person
 * across sixty posts.
 */
/**
 * §496. How fast this voice articulates at `speed: 1.0`, in words per minute
 * over voiced seconds. Measured, not assumed: a tips piece read 184 wpm at
 * speed 0.95 (`content_item_costs`-era run, 2 September). Re-measure from
 * `qc_results.audio.wordsPerMinute` after a voice or model change and update
 * this one number.
 */
export const ARTICULATION_WPM_AT_1 = 194;

/** ElevenLabs accepts 0.7–1.2 and degrades outside it. */
const SPEED_FLOOR = 0.7;
const SPEED_CEILING = 1.2;

/** Speed that lands this voice on a target rate, clamped to what the API takes. */
export function speedForWpm(targetWpm: number, articulationWpm = ARTICULATION_WPM_AT_1): number {
  const raw = targetWpm / articulationWpm;
  return Number(Math.min(SPEED_CEILING, Math.max(SPEED_FLOOR, raw)).toFixed(2));
}

const SETTINGS: Record<
  VoiceEnergy,
  { stability: number; similarityBoost: number; targetWpm: number; notes: string[] }
> = {
  calm: {
    stability: 0.7,
    similarityBoost: 0.85,
    /* §496. Inside the 140-175 band; the pace rises with the energy. */
    targetWpm: 152,
    notes: [
      'Long sentences are fine. Let clauses breathe; use commas where a person would pause.',
      'No exclamation marks. The calm is doing the work.',
    ],
  },
  warm: {
    stability: 0.6,
    similarityBoost: 0.8,
    /* §496. Inside the 140-175 band; the pace rises with the energy. */
    targetWpm: 160,
    notes: [
      'Write the way you would explain it to one person across a kitchen counter.',
      'Contractions throughout. "It is" reads as a press release.',
    ],
  },
  bright: {
    stability: 0.45,
    similarityBoost: 0.75,
    /* §496. Inside the 140-175 band; the pace rises with the energy. */
    targetWpm: 168,
    notes: [
      'Short sentences. A five-word sentence is emphasis the synthesiser can actually hear.',
      'One em dash where the surprise lands — the pause is the joke.',
    ],
  },
  urgent: {
    stability: 0.35,
    similarityBoost: 0.7,
    /* §496. Inside the 140-175 band; the pace rises with the energy. */
    targetWpm: 172,
    notes: [
      'Front-load. The verb belongs in the first four words.',
      'Fragments are allowed. Not every line needs a subject.',
      'No preamble at all — the first word is the hook.',
    ],
  },
};

export function directVoice(input: VoiceInput): VoiceDirection {
  const energy = voiceEnergyFor(input);
  const settings = SETTINGS[energy];

  const notes = [...settings.notes];
  /*
   * Runtime changes how a script has to be written more than energy does. A
   * 15-second read is roughly 40 words, and a script written without that in
   * mind is either rushed by the synthesiser or truncated by the timing engine.
   */
  const words = Math.round(input.targetSeconds * 2.6);
  notes.push(`About ${words} words. A ${input.targetSeconds}s read is ${words} words, not a paragraph trimmed to fit.`);

  if (input.platform === 'youtube' && input.targetSeconds > 180) {
    notes.push('Long-form: signpost. "First", "the part everyone misses", "here is the result" give a listener somewhere to be.');
  }

  return {
    voiceId: input.voiceId ?? null,
    energy,
    stability: settings.stability,
    speed: speedForWpm(settings.targetWpm),
    similarityBoost: settings.similarityBoost,
    deliveryNotes: notes,
    reason: `${energy} delivery: ${
      input.emotionalAngle
        ? `the concept's angle is "${input.emotionalAngle}"`
        : `the cut is ${input.visualLanguage ?? 'unspecified'}`
    }, at stability ${settings.stability}.`,
  };
}
