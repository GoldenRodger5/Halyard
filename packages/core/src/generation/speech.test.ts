/**
 * The speech and music clients.
 *
 * Weighted towards the refusal paths, because those are the ones that decide
 * whether a missing credential becomes a loud failure or a silent video.
 */
import { describe, expect, it } from 'vitest';
import {
  clampMusicLength,
  ElevenLabsMusicClient,
  ElevenLabsSpeechClient,
  MAX_MUSIC_MS,
  MIN_MUSIC_MS,
  SPEECH_MODEL,
  SpeechUnavailableError,
} from './speech.js';

const audio = (): Response =>
  new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]).buffer, {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });

describe('ElevenLabsSpeechClient', () => {
  it('refuses without a key rather than returning silence', async () => {
    const client = new ElevenLabsSpeechClient({ apiKey: undefined, voiceId: 'v1' });
    await expect(client.synthesize('Vinegar firms the crumb.')).rejects.toThrow(
      /ELEVENLABS_API_KEY/,
    );
  });

  it('refuses without a voice rather than picking one', async () => {
    /**
     * Defaulting to the account's first voice would work, and would mean the
     * brand voice changed the day somebody added a voice to the account.
     */
    const client = new ElevenLabsSpeechClient({ apiKey: 'k', voiceId: undefined });
    await expect(client.synthesize('Anything')).rejects.toThrow(/ELEVENLABS_VOICE_ID/);
  });

  it('names the missing thing in a typed reason, not just prose', async () => {
    const client = new ElevenLabsSpeechClient({ apiKey: undefined, voiceId: undefined });
    await client.synthesize('x').catch((err: SpeechUnavailableError) => {
      expect(err.reason).toBe('no_key');
    });
    expect.assertions(1);
  });

  it('refuses an empty script before spending a request on it', async () => {
    let called = false;
    const client = new ElevenLabsSpeechClient({
      apiKey: 'k',
      voiceId: 'v',
      fetchImpl: (async () => {
        called = true;
        return audio();
      }) as unknown as typeof fetch,
    });
    await expect(client.synthesize('   ')).rejects.toThrow(/empty script/);
    expect(called).toBe(false);
  });

  it('treats a 200 with an empty body as a failure', async () => {
    /**
     * The single worst outcome this module can produce. An empty body with a
     * success status becomes a zero-length audio file, which becomes a video
     * that renders, publishes, looks finished and plays nothing.
     */
    const client = new ElevenLabsSpeechClient({
      apiKey: 'k',
      voiceId: 'v',
      fetchImpl: (async () => new Response(new ArrayBuffer(0), { status: 200 })) as unknown as typeof fetch,
    });
    await expect(client.synthesize('Something worth hearing')).rejects.toThrow(/empty audio/);
  });

  it('authenticates with xi-api-key, not a bearer token', async () => {
    let headers: Record<string, string> = {};
    const client = new ElevenLabsSpeechClient({
      apiKey: 'secret',
      voiceId: 'voice-1',
      fetchImpl: (async (_url: string, init: RequestInit) => {
        headers = init.headers as Record<string, string>;
        return audio();
      }) as unknown as typeof fetch,
    });

    await client.synthesize('Vinegar firms the crumb.');
    expect(headers['xi-api-key']).toBe('secret');
    expect(headers.authorization).toBeUndefined();
  });

  it('sends the consistent model by default, not the expressive one', async () => {
    let body: Record<string, unknown> = {};
    const client = new ElevenLabsSpeechClient({
      apiKey: 'k',
      voiceId: 'v',
      fetchImpl: (async (_url: string, init: RequestInit) => {
        body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return audio();
      }) as unknown as typeof fetch,
    });

    await client.synthesize('A line of narration');
    expect(body.model_id).toBe(SPEECH_MODEL);
  });

  it('surfaces the API status when the request is refused', async () => {
    const client = new ElevenLabsSpeechClient({
      apiKey: 'k',
      voiceId: 'v',
      fetchImpl: (async () =>
        new Response('quota exhausted', { status: 401, statusText: 'Unauthorized' })) as unknown as typeof fetch,
    });
    await expect(client.synthesize('x')).rejects.toThrow(/401.*quota exhausted/s);
  });
});

describe('ElevenLabsMusicClient', () => {
  it('refuses to compose without the advertising licence, and says why', async () => {
    /**
     * Halyard's output is product marketing. ElevenLabs' music terms carve
     * advertising out of the standard commercial grant, so composing a bed
     * here is a legal decision rather than a technical one — and not one this
     * code should make on the operator's behalf by defaulting to on.
     */
    const client = new ElevenLabsMusicClient({ apiKey: 'k', licensed: false });
    await expect(client.compose('warm kitchen bed', 20_000)).rejects.toThrow(/advertising/);
  });

  it('reports not_licensed distinctly from a missing key', async () => {
    const client = new ElevenLabsMusicClient({ apiKey: 'k', licensed: false });
    await client.compose('x', 20_000).catch((err: SpeechUnavailableError) => {
      expect(err.reason).toBe('not_licensed');
    });
    expect.assertions(1);
  });

  it('composes once the licence is asserted', async () => {
    let body: Record<string, unknown> = {};
    const client = new ElevenLabsMusicClient({
      apiKey: 'k',
      licensed: true,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return audio();
      }) as unknown as typeof fetch,
    });

    await client.compose('warm kitchen bed, no vocals', 24_000);
    expect(body.music_length_ms).toBe(24_000);
  });

  it('clamps a request shorter than the API minimum instead of being rejected', () => {
    // Asking for less than the floor is a hard rejection, and rounding up is
    // free: the bed is looped and trimmed to the narration by the mix anyway.
    expect(clampMusicLength(4_000)).toBe(MIN_MUSIC_MS);
    // The real compositions are all above the floor and pass through untouched.
    expect(clampMusicLength(16_000)).toBe(16_000);
    expect(clampMusicLength(999_999)).toBe(MAX_MUSIC_MS);
    expect(clampMusicLength(Number.NaN)).toBe(MIN_MUSIC_MS);
    expect(clampMusicLength(24_000)).toBe(24_000);
  });
});
