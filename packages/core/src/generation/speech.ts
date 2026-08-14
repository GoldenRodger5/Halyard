/**
 * Voiceover and music, via ElevenLabs.
 *
 * Written against the API as documented in August 2026 — TTS at
 * `POST /v1/text-to-speech/{voice_id}` and music at `POST /v1/music`, both
 * authenticated with an `xi-api-key` header rather than a bearer token.
 *
 * ## Two clients, because they are two different decisions
 *
 * Narration is unambiguously ours to generate and publish. Music is not,
 * quite — see `MUSIC_LICENSING` below — so it is a separate client behind a
 * separate switch, and a deployment can have narration without ever composing a
 * bar of music.
 *
 * ## No key is a first-class state
 *
 * Both clients refuse with a typed error naming the missing variable, rather
 * than returning empty audio. A video that renders silent because a credential
 * was absent is the worst outcome available here: it publishes, it looks
 * finished, and the only symptom is that nobody hears anything.
 */

/**
 * What the licence actually permits, which is not "anything".
 *
 * ElevenLabs' music terms grant broad commercial use on paid plans **but call
 * out advertising as needing an additional licence**, alongside film, TV, games
 * and enterprise distribution.
 *
 * Halyard's entire output is marketing for a product. That is advertising by
 * any reading, so composing a bed here and publishing it under the standard
 * plan is not clearly covered. This is a commercial decision with legal
 * consequences and it is not one this code should make silently — so music is
 * off unless `ELEVENLABS_MUSIC_LICENSED` is explicitly set, and the refusal
 * says why.
 *
 * The alternative, which needs no licence argument at all, is a small library of
 * beds bought once under a perpetual commercial licence.
 */
export const MUSIC_LICENSING =
  "ElevenLabs' music terms require an additional licence for advertising. Halyard's " +
  'output is product marketing, so the standard plan does not clearly cover it. Set ' +
  'ELEVENLABS_MUSIC_LICENSED=true only once that licence is actually in place, or supply ' +
  'a bed from a library licensed for commercial use.';

export class SpeechUnavailableError extends Error {
  readonly reason: 'no_key' | 'no_voice' | 'not_licensed' | 'api';

  constructor(message: string, reason: SpeechUnavailableError['reason']) {
    super(message);
    this.name = 'SpeechUnavailableError';
    this.reason = reason;
  }
}

/**
 * The narration model.
 *
 * `eleven_v3` is the more expressive model and is the wrong default here.
 * Halyard publishes on the order of sixty posts a month in a single brand
 * voice, and the thing that matters across that many posts is that they sound
 * like the same person — expressive variation between takes reads as
 * inconsistency, not as range. `eleven_multilingual_v2` with a high stability
 * setting is the model that repeats.
 *
 * Overridable per call for the cases where expression is the point.
 */
export const SPEECH_MODEL = 'eleven_multilingual_v2';

/** 44.1 kHz keeps the mix out of resampling; 128 kbps is transparent for speech. */
export const SPEECH_OUTPUT_FORMAT = 'mp3_44100_128';

export const MUSIC_MODEL = 'music_v1';

/**
 * The composable length window, in milliseconds.
 *
 * Every composition here is comfortably inside it — the shortest, ChefNoteCard,
 * is 16 s against a 10 s floor — so this is defensive rather than load-bearing
 * today. It matters when a script comes back short: asking for less than the
 * floor is a hard rejection, and rounding up costs nothing, because the bed is
 * looped and trimmed to the narration by the mix regardless.
 */
export const MIN_MUSIC_MS = 10_000;
export const MAX_MUSIC_MS = 300_000;

export function clampMusicLength(lengthMs: number): number {
  if (!Number.isFinite(lengthMs)) return MIN_MUSIC_MS;
  return Math.min(MAX_MUSIC_MS, Math.max(MIN_MUSIC_MS, Math.round(lengthMs)));
}

export interface SynthesisOptions {
  /** Overrides the configured brand voice. */
  voiceId?: string;
  modelId?: string;
  /**
   * High stability favours consistency between renders over expressiveness,
   * which is what a repeated brand voice needs.
   */
  stability?: number;
  similarityBoost?: number;
  /** ISO 639-1. Ignored by models that do not support the language. */
  languageCode?: string;
}

export interface SpeechClient {
  synthesize(text: string, options?: SynthesisOptions): Promise<Buffer>;
}

export interface MusicClient {
  /** Length is requested in milliseconds, matching the API. */
  compose(prompt: string, lengthMs: number): Promise<Buffer>;
}

const API_ROOT = 'https://api.elevenlabs.io/v1';

async function readError(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  return `${response.status} ${response.statusText}${body ? `: ${body.slice(0, 400)}` : ''}`;
}

export class ElevenLabsSpeechClient implements SpeechClient {
  private readonly apiKey: string | undefined;
  private readonly voiceId: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { apiKey?: string; voiceId?: string; fetchImpl?: typeof fetch } = {}) {
    this.apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY ?? undefined;
    this.voiceId = options.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? undefined;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Whether a call would get as far as the network. */
  get configured(): boolean {
    return Boolean(this.apiKey && this.voiceId);
  }

  async synthesize(text: string, options: SynthesisOptions = {}): Promise<Buffer> {
    if (!text.trim()) {
      throw new SpeechUnavailableError('Refusing to synthesise an empty script.', 'api');
    }
    if (!this.apiKey) {
      throw new SpeechUnavailableError(
        'ELEVENLABS_API_KEY is not set, so no voiceover can be produced. ' +
          'The video would render silent, which is worse than not rendering.',
        'no_key',
      );
    }

    const voiceId = options.voiceId ?? this.voiceId;
    if (!voiceId) {
      throw new SpeechUnavailableError(
        'ELEVENLABS_VOICE_ID is not set. The brand voice has to be chosen deliberately ' +
          'rather than defaulted to whichever voice the account happens to list first.',
        'no_voice',
      );
    }

    const response = await this.fetchImpl(
      `${API_ROOT}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${SPEECH_OUTPUT_FORMAT}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: options.modelId ?? SPEECH_MODEL,
          ...(options.languageCode ? { language_code: options.languageCode } : {}),
          voice_settings: {
            stability: options.stability ?? 0.55,
            similarity_boost: options.similarityBoost ?? 0.8,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new SpeechUnavailableError(
        `ElevenLabs refused the synthesis request — ${await readError(response)}`,
        'api',
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      // A 200 with no body would otherwise become a silent video.
      throw new SpeechUnavailableError(
        'ElevenLabs returned an empty audio body with a success status.',
        'api',
      );
    }
    return bytes;
  }
}

export class ElevenLabsMusicClient implements MusicClient {
  private readonly apiKey: string | undefined;
  private readonly licensed: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { apiKey?: string; licensed?: boolean; fetchImpl?: typeof fetch } = {}) {
    this.apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY ?? undefined;
    this.licensed =
      options.licensed ?? process.env.ELEVENLABS_MUSIC_LICENSED === 'true';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get configured(): boolean {
    return Boolean(this.apiKey) && this.licensed;
  }

  async compose(prompt: string, lengthMs: number): Promise<Buffer> {
    if (!this.apiKey) {
      throw new SpeechUnavailableError('ELEVENLABS_API_KEY is not set.', 'no_key');
    }
    if (!this.licensed) {
      throw new SpeechUnavailableError(MUSIC_LICENSING, 'not_licensed');
    }

    const response = await this.fetchImpl(`${API_ROOT}/music`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        prompt,
        music_length_ms: clampMusicLength(lengthMs),
        model_id: MUSIC_MODEL,
      }),
    });

    if (!response.ok) {
      throw new SpeechUnavailableError(
        `ElevenLabs refused the music request — ${await readError(response)}`,
        'api',
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new SpeechUnavailableError('ElevenLabs returned an empty music body.', 'api');
    }
    return bytes;
  }
}
