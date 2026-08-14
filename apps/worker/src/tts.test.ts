/**
 * The voiceover handler, against a real Postgres and real FFmpeg.
 *
 * Only the two network calls are stubbed — ElevenLabs speech and music. The
 * mix, the loudness measurement, the silence detection and the gate all run for
 * real, because those are the parts that decide whether the audio is any good.
 *
 * Whisper is stubbed where it is not installed: transcription is the one step
 * that needs a model file on disk, and a test suite that silently skipped the
 * gate whenever whisper was absent would be the exact failure this project
 * keeps finding.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { SpeechUnavailableError, type MusicClient, type SpeechClient } from '@halyard/core';
import { ttsHandler } from './handlers/tts.js';
import type { HandlerContext, Job } from './poller.js';

const execFileAsync = promisify(execFile);
const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

/**
 * A real MP3, synthesised by FFmpeg.
 *
 * Returning a handful of bytes that merely look like an MP3 header would pass
 * the client's emptiness check and then fail in ffprobe, so the fake produces
 * genuinely decodable audio of a known length.
 */
async function realMp3(seconds: number, hz = 300): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${hz}:duration=${seconds}`,
      '-ar',
      '44100',
      '-f',
      'mp3',
      '-',
    ],
    { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 },
  );
  return stdout as unknown as Buffer;
}

function speechStub(seconds = 3): SpeechClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async synthesize(text: string) {
      calls.push(text);
      return realMp3(seconds);
    },
  };
}

function musicStub(seconds = 12): MusicClient {
  return { async compose() { return realMp3(seconds, 1150); } };
}

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('tts', 6);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')`,
  );
  await pool.query(
    `insert into social_accounts (id, product_id, platform, persona, handle)
     values ('11111111-1111-1111-1111-111111111111','recipefix','tiktok','brand','@recipefix')`,
  );
  await pool.query(
    `insert into templates (id, renderer, format, aspect_ratio, enabled)
     values ('ChefNoteCard','remotion','video','9:16',true)
     on conflict (id) do update set enabled = true`,
  );
  // Transcription needs a whisper model on disk, which CI does not have. The
  // stub returns the script back as words, which is what a perfect read sounds
  // like — the gate's own logic is exercised in its own unit tests.
  vi.mock('./video.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./video.js')>()),
    transcribeWords: vi.fn(async () => [
      { text: 'Vinegar', startSeconds: 0.0, endSeconds: 0.4 },
      { text: 'firms', startSeconds: 0.4, endSeconds: 0.7 },
      { text: 'the', startSeconds: 0.7, endSeconds: 0.8 },
      { text: 'crumb', startSeconds: 0.8, endSeconds: 1.2 },
    ]),
  }));
}, 180_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from renders');
  await pool.query('delete from content_items');
  await pool.query('delete from voice_lexicon');
});

function context(): HandlerContext & {
  logs: Array<[string, unknown]>;
  enqueued: Array<[string, Record<string, unknown>]>;
} {
  const logs: Array<[string, unknown]> = [];
  const enqueued: Array<[string, Record<string, unknown>]> = [];
  return {
    pool,
    workerId: 'test',
    logs,
    enqueued,
    log: (m: string, det?: unknown) => logs.push([m, det]),
    enqueue: async (kind: string, payload: Record<string, unknown>) => {
      enqueued.push([kind, payload]);
    },
  } as unknown as HandlerContext & {
    logs: Array<[string, unknown]>;
    enqueued: Array<[string, Record<string, unknown>]>;
  };
}

async function seedItem(overrides: { audioMode?: string; script?: string | null } = {}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into content_items
       (product_id, account_id, platform, persona, format, category, status, body,
        audio_mode, vo_script)
     values ('recipefix','11111111-1111-1111-1111-111111111111','tiktok','brand','video',
             'educational','draft','Body copy', $1, $2)
     returning id`,
    [
      overrides.audioMode ?? 'founder_cloned',
      // `?? default` would swallow an explicit null, which is exactly the case
      // the missing-script test is trying to create.
      'script' in overrides ? overrides.script : 'Vinegar firms the crumb.',
    ],
  );
  return rows[0]!.id;
}

const job = (contentItemId: string): Job =>
  ({ id: 'j', kind: 'tts', payload: { contentItemId }, attempts: 1, max_attempts: 3 }) as unknown as Job;

d('ttsHandler', () => {
  it('produces a mixed voiceover and attaches it to the item', async () => {
    const id = await seedItem();
    await ttsHandler(job(id), context(), { speech: speechStub(), music: null });

    const { rows } = await pool.query<{ vo_asset_id: string | null }>(
      'select vo_asset_id from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.vo_asset_id).not.toBeNull();

    const { rows: asset } = await pool.query<{ kind: string; duration_seconds: string }>(
      'select kind, duration_seconds from assets where id = $1',
      [rows[0]!.vo_asset_id],
    );
    expect(asset[0]!.kind).toBe('audio');
    expect(Number(asset[0]!.duration_seconds)).toBeGreaterThan(3);
  }, 180_000);

  it('records the gate verdict, which has never had an input before now', async () => {
    const id = await seedItem();
    await ttsHandler(job(id), context(), { speech: speechStub(), music: null });

    const { rows } = await pool.query<{ qc: { audio?: Record<string, unknown> } }>(
      'select qc_results as qc from content_items where id = $1',
      [id],
    );
    const audio = rows[0]!.qc.audio!;
    expect(audio).toBeDefined();
    expect(typeof audio.wordErrorRate).toBe('number');
    // The loudness the summary promised but could never include, because
    // AudioProbe had no field for it.
    expect(String(audio.summary)).toMatch(/LUFS/);
    expect(Number(audio.lufs)).toBeLessThan(0);
  }, 180_000);

  it('normalises the script through the lexicon before synthesis, not after', async () => {
    /**
     * The gate can only catch a mispronunciation once it has happened. The
     * lexicon exists so the next synthesis does not repeat it, which only works
     * if normalisation runs on the way in.
     */
    await pool.query(
      `insert into voice_lexicon (product_id, term, phonetic) values ('recipefix','RecipeFix','recipe fix')`,
    );
    const id = await seedItem({ script: 'RecipeFix adapts the recipe.' });
    const speech = speechStub();

    await ttsHandler(job(id), context(), { speech, music: null });

    expect(speech.calls[0]).toContain('recipe fix');
    expect(speech.calls[0]).not.toContain('RecipeFix');
  }, 180_000);

  it('mixes a bed in when music is available', async () => {
    const id = await seedItem();
    await ttsHandler(job(id), context(), { speech: speechStub(), music: musicStub() });

    const { rows } = await pool.query<{ qc: { audio: { hadMusic: boolean } } }>(
      'select qc_results as qc from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.qc.audio.hadMusic).toBe(true);
  }, 180_000);

  it('records why the bed is missing rather than quietly shipping without one', async () => {
    /**
     * An unlicensed or failing music service must not stop the voiceover — but
     * the operator has to be able to tell the difference between "no bed by
     * choice" and "the bed silently vanished".
     */
    const id = await seedItem();
    const refusing: MusicClient = {
      async compose() {
        throw new SpeechUnavailableError('not licensed for advertising', 'not_licensed');
      },
    };

    await ttsHandler(job(id), context(), { speech: speechStub(), music: refusing });

    const { rows } = await pool.query<{ qc: { audio: { hadMusic: boolean; musicSkipped: string } } }>(
      'select qc_results as qc from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.qc.audio.hadMusic).toBe(false);
    expect(rows[0]!.qc.audio.musicSkipped).toBe('not_licensed');
  }, 180_000);

  it('skips a text_only item instead of inventing a voiceover for it', async () => {
    const id = await seedItem({ audioMode: 'text_only' });
    const ctx = context();
    await ttsHandler(job(id), ctx, { speech: speechStub(), music: null });

    expect(ctx.logs.map(([m]) => m)).toContain('tts skipped, item is text_only');
    const { rows } = await pool.query('select vo_asset_id from content_items where id = $1', [id]);
    expect(rows[0]!.vo_asset_id).toBeNull();
  }, 60_000);

  it('fails loudly when an item claims a voiceover but carries no script', async () => {
    const id = await seedItem({ script: null });
    await expect(
      ttsHandler(job(id), context(), { speech: speechStub(), music: null }),
    ).rejects.toThrow(/no vo_script/);
  }, 60_000);

  it('fails rather than attaching silence when the key is missing', async () => {
    /**
     * The outcome this whole module is arranged to prevent. Without a key the
     * job must fail; it must not write a zero-length asset and let a silent
     * video march on to the queue looking finished.
     */
    const id = await seedItem();
    const noKey: SpeechClient = {
      async synthesize() {
        throw new SpeechUnavailableError('ELEVENLABS_API_KEY is not set', 'no_key');
      },
    };

    await expect(ttsHandler(job(id), context(), { speech: noKey, music: null })).rejects.toThrow(
      /ELEVENLABS_API_KEY/,
    );

    const { rows } = await pool.query('select vo_asset_id from content_items where id = $1', [id]);
    expect(rows[0]!.vo_asset_id).toBeNull();
  }, 60_000);

  it('releases the render it was gating, so a video item cannot stall silently', async () => {
    /**
     * Generation creates the Remotion render row without enqueueing it, because
     * the video's length and audio both come from this mix. If this handler did
     * not release it, a video item would sit in `queued` forever with no error
     * to explain why — the queue would simply never finish it.
     */
    const id = await seedItem();
    const render = await pool.query<{ id: string }>(
      `insert into renders (content_item_id, template_id, renderer, input_props, quality)
       values ($1,'ChefNoteCard','remotion','{}'::jsonb,'final') returning id`,
      [id],
    );

    const ctx = context();
    await ttsHandler(job(id), ctx, { speech: speechStub(), music: null });

    expect(ctx.enqueued).toContainEqual(['render', { renderId: render.rows[0]!.id }]);
  }, 180_000);

  it('does not release a render that is already done', async () => {
    const id = await seedItem();
    await pool.query(
      `insert into renders (content_item_id, template_id, renderer, input_props, quality, status)
       values ($1,'ChefNoteCard','remotion','{}'::jsonb,'final','done')`,
      [id],
    );

    const ctx = context();
    await ttsHandler(job(id), ctx, { speech: speechStub(), music: null });

    expect(ctx.enqueued.filter(([kind]) => kind === 'render')).toEqual([]);
  }, 180_000);

  it('stores caption cues as whole clauses, not two-word karaoke', async () => {
    const id = await seedItem();
    await ttsHandler(job(id), context(), { speech: speechStub(), music: null });

    const { rows } = await pool.query<{ qc: { audio: { captions: Array<{ text: string }> } } }>(
      'select qc_results as qc from content_items where id = $1',
      [id],
    );
    const cues = rows[0]!.qc.audio.captions;
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0]!.text.split(/\s+/).length).toBeGreaterThan(2);
  }, 180_000);
});
