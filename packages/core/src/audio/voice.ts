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
 * ## §480 / §490. Speed exists, and the read was never slow
 *
 * This file said the endpoint had no speed control; that was true when it was
 * written, and `voice_settings.speed` (0.7–1.2) exists now — verified live.
 * §480 then raised every energy above 1.0 because the pacing gate read 127
 * wpm. That number was the script divided by the **whole mix**, designed
 * silences included. Measured four ways since (§487, §490):
 *
 *     over the mix              127 wpm   what the gate used to read
 *     over caption spans        139       whisper stretches words across gaps
 *     over clip durations       179       what the gate reads now (§487)
 *     over silence-trimmed span 220       pure articulation
 *
 * The middle two are the honest ones for "words per minute" as a listener
 * means it, and they put this voice at the *top* of the 140–175 band at 1.0.
 * So speed is directed slightly under 1.0 for the slower energies, and the
 * gate measures the result over the voiced seconds.
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
  /** §490. 0.7–1.2. Over clip durations this voice reads ~180 wpm at 1.0, so calm and warm sit under it. */
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
const SETTINGS: Record<
  VoiceEnergy,
  { stability: number; similarityBoost: number; speed: number; notes: string[] }
> = {
  calm: {
    stability: 0.7,
    similarityBoost: 0.85,
    speed: 0.9,
    notes: [
      'Long sentences are fine. Let clauses breathe; use commas where a person would pause.',
      'No exclamation marks. The calm is doing the work.',
    ],
  },
  warm: {
    stability: 0.6,
    similarityBoost: 0.8,
    speed: 0.95,
    notes: [
      'Write the way you would explain it to one person across a kitchen counter.',
      'Contractions throughout. "It is" reads as a press release.',
    ],
  },
  bright: {
    stability: 0.45,
    similarityBoost: 0.75,
    speed: 1.0,
    notes: [
      'Short sentences. A five-word sentence is emphasis the synthesiser can actually hear.',
      'One em dash where the surprise lands — the pause is the joke.',
    ],
  },
  urgent: {
    stability: 0.35,
    similarityBoost: 0.7,
    speed: 1.05,
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
    speed: settings.speed,
    similarityBoost: settings.similarityBoost,
    deliveryNotes: notes,
    reason: `${energy} delivery: ${
      input.emotionalAngle
        ? `the concept's angle is "${input.emotionalAngle}"`
        : `the cut is ${input.visualLanguage ?? 'unspecified'}`
    }, at stability ${settings.stability}.`,
  };
}
