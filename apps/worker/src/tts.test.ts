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

  /**
   * §119. The verdict used to live only at `qc_results.audio`, which the queue
   * does not render and which `review_media` later overwrote wholesale.
   */
  it('puts the audio verdict in the gate list the queue actually renders', async () => {
    const id = await seedItem();
    // The copy-time aggregate leaves an `audio: skipped` slot behind.
    await pool.query(
      `update content_items set qc_results = $2 where id = $1`,
      [
        id,
        JSON.stringify({
          passed: true,
          gates: [
            { gate: 'copy', status: 'passed', summary: 'fine', detail: null },
            { gate: 'audio', status: 'skipped', summary: 'no voiceover here', detail: null },
          ],
        }),
      ],
    );

    await ttsHandler(job(id), context(), { speech: speechStub(), music: null });

    const { rows } = await pool.query<{
      qc: { gates: Array<{ gate: string; status: string; summary: string }> };
    }>('select qc_results as qc from content_items where id = $1', [id]);
    const gates = rows[0]!.qc.gates;

    const audio = gates.find((g) => g.gate === 'audio')!;
    expect(audio.status).not.toBe('skipped');
    expect(audio.summary).toMatch(/LUFS/);
    // Exactly one audio entry — the placeholder is replaced, not duplicated.
    expect(gates.filter((g) => g.gate === 'audio')).toHaveLength(1);
    // Gates this stage does not own are left alone.
    expect(gates.find((g) => g.gate === 'copy')!.status).toBe('passed');
  }, 180_000);

  it('survives an item whose gate list does not exist yet', async () => {
    const id = await seedItem();
    await ttsHandler(job(id), context(), { speech: speechStub(), music: null });
    const { rows } = await pool.query<{ qc: { gates: Array<{ gate: string }> } }>(
      'select qc_results as qc from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.qc.gates.map((g) => g.gate)).toEqual(['audio']);
  }, 180_000);

  /**
   * §137. The pronunciation screen shows a "used" column and nothing ever
   * wrote it, so every term read zero regardless of how often it fired.
   */
  it('counts a lexicon term that the script actually used', async () => {
    await pool.query(`delete from voice_lexicon`);
    await pool.query(
      `insert into voice_lexicon (product_id, term, phonetic, hit_count)
       values ('recipefix','Vinegar','VIN-uh-gar', 0)`,
    );

    const id = await seedItem({ script: 'Vinegar firms the crumb.' });
    await ttsHandler(job(id), context(), { speech: speechStub(), music: null });

    const { rows } = await pool.query<{ hit_count: number }>(
      `select hit_count from voice_lexicon where term = 'Vinegar'`,
    );
    expect(rows[0]!.hit_count).toBe(1);
  }, 180_000);

  it('does not count a term the script never mentions', async () => {
    await pool.query(`delete from voice_lexicon`);
    await pool.query(
      `insert into voice_lexicon (product_id, term, phonetic, hit_count)
       values ('recipefix','quinoa','KEEN-wah', 0)`,
    );

    const id = await seedItem({ script: 'Vinegar firms the crumb.' });
    await ttsHandler(job(id), context(), { speech: speechStub(), music: null });

    const { rows } = await pool.query<{ hit_count: number }>(
      `select hit_count from voice_lexicon where term = 'quinoa'`,
    );
    // A count that goes up regardless would be worse than no count.
    expect(rows[0]!.hit_count).toBe(0);
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

  it('uses a bed from the operator library, rotating least-recently-used', async () => {
    /**
     * Beds are not generated. ElevenLabs Music is not licensed for advertising
     * and this is advertising, so the bed has to be a file the operator owns.
     * Rotation is least-recently-used rather than random: sixty posts a month
     * over a handful of beds collides constantly, and the same bed twice in a
     * row is the first thing a viewer notices.
     */
    const bytes = await realMp3(12, 1150);
    for (const [name, used] of [
      ['old', '2020-01-01'],
      ['recent', '2030-01-01'],
    ] as const) {
      await pool.query(
        `insert into assets (product_id, kind, mime_type, storage_path, public_url, tags, last_used_at, caption)
         values ('recipefix','audio','audio/mpeg',$1,$1,array['music_bed'],$2,'CC-BY test bed')`,
        [`bed-${name}.mp3`, used],
      );
    }

    const { selectBed } = await import('./bed.js');
    const chosen = await selectBed(context(), 'recipefix');
    expect(chosen?.storagePath).toBe('bed-old.mp3');
    expect(chosen?.licence).toBe('CC-BY test bed');
    expect(bytes.byteLength).toBeGreaterThan(0);

    await pool.query(`delete from assets where kind = 'audio'`);
  }, 60_000);

  it('says the library is empty rather than substituting something', async () => {
    const id = await seedItem();
    const ctx = context();
    // No `music` override, so the real library client runs against an empty library.
    await ttsHandler(job(id), ctx, { speech: speechStub() });

    const { rows } = await pool.query<{ qc: { audio: { hadMusic: boolean; musicSkipped: string } } }>(
      'select qc_results as qc from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.qc.audio.hadMusic).toBe(false);
    expect(rows[0]!.qc.audio.musicSkipped).toMatch(/No music bed is available/);
  }, 180_000);

  it('slop-checks what was said, not only what was written', async () => {
    /**
     * The script is gated before synthesis, which catches the writing. This
     * catches the synthesis: narration that never existed as text, because the
     * model read something differently from how it was written, and which no
     * earlier gate ever saw.
     */
    const { transcribeWords } = await import('./video.js');
    vi.mocked(transcribeWords).mockResolvedValueOnce([
      { text: 'Use', startSeconds: 0, endSeconds: 0.2 },
      { text: 'three', startSeconds: 0.2, endSeconds: 0.4 },
      { text: 'slash', startSeconds: 0.4, endSeconds: 0.6 },
      { text: 'four', startSeconds: 0.6, endSeconds: 0.8 },
      { text: 'cup', startSeconds: 0.8, endSeconds: 1.0 },
      { text: '#baking', startSeconds: 1.0, endSeconds: 1.4 },
    ]);

    const id = await seedItem();
    await ttsHandler(job(id), context(), { speech: speechStub(), music: null });

    const { rows } = await pool.query<{
      qc: { audio: { spokenSlop: { passed: boolean; violations: Array<{ rule: string }> } } };
    }>('select qc_results as qc from content_items where id = $1', [id]);

    const slop = rows[0]!.qc.audio.spokenSlop;
    expect(slop.passed).toBe(false);
    expect(slop.violations.map((v) => v.rule)).toContain('spoken.hashtag');
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
