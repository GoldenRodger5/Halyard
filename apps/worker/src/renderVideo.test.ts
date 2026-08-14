/**
 * The video render path, end to end, against a real Remotion render.
 *
 * Slow on purpose. The whole point of this file is that four Remotion
 * templates sat in the `templates` table marked `enabled` while no production
 * path could produce a single frame of any of them, and a test that stubbed the
 * renderer would have been just as green as the missing code was.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { renderHandler } from './handlers/render.js';
import type { HandlerContext, Job } from './poller.js';

const execFileAsync = promisify(execFile);
const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let assetDir: string;

const ACCOUNT = '22222222-2222-2222-2222-222222222222';

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('rendervideo', 6);
  assetDir = await mkdtemp(path.join(tmpdir(), 'halyard-assets-'));
  process.env.HALYARD_LOCAL_ASSET_DIR = assetDir;

  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')`,
  );
  await pool.query(
    `insert into social_accounts (id, product_id, platform, persona, handle)
     values ($1,'recipefix','tiktok','brand','@recipefix')`,
    [ACCOUNT],
  );
  await pool.query(
    `insert into templates (id, renderer, format, aspect_ratio, enabled)
     values ('ChefNoteCard','remotion','video','9:16',true)
     on conflict (id) do update set enabled = true`,
  );
}, 300_000);

afterAll(async () => {
  if (!available) return;
  await pool.end();
  await rm(assetDir, { recursive: true, force: true });
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from renders');
  await pool.query('delete from content_items');
});

function context(): HandlerContext & { logs: Array<[string, unknown]> } {
  const logs: Array<[string, unknown]> = [];
  return {
    pool,
    workerId: 'test',
    logs,
    log: (m: string, det?: unknown) => logs.push([m, det]),
    enqueue: async () => undefined,
  } as unknown as HandlerContext & { logs: Array<[string, unknown]> };
}

async function seedRender(): Promise<{ renderId: string; contentItemId: string }> {
  const item = await pool.query<{ id: string }>(
    `insert into content_items
       (product_id, account_id, platform, persona, format, category, status, body)
     values ('recipefix',$1,'tiktok','brand','video','educational','draft','Body') returning id`,
    [ACCOUNT],
  );
  const contentItemId = item.rows[0]!.id;

  const render = await pool.query<{ id: string }>(
    `insert into renders (content_item_id, template_id, renderer, input_props, quality)
     values ($1,'ChefNoteCard','remotion',$2,'final') returning id`,
    [
      contentItemId,
      {
        quote: 'The vinegar is doing structural work, not flavour work.',
        attribution: "Sally's Artisan Bread, gluten-free",
        wordmark: 'recipefix',
      },
    ],
  );
  return { renderId: render.rows[0]!.id, contentItemId };
}

const job = (renderId: string): Job =>
  ({ id: 'j', kind: 'render', payload: { renderId }, attempts: 1, max_attempts: 3 }) as unknown as Job;

/** Stream count and duration, straight from the file. */
async function probe(file: string): Promise<{ streams: string[]; seconds: number }> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type:format=duration',
    '-of',
    'json',
    file,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams: Array<{ codec_type: string }>;
    format: { duration: string };
  };
  return {
    streams: parsed.streams.map((s) => s.codec_type),
    seconds: Number(parsed.format.duration),
  };
}

d('renderHandler, remotion path', () => {
  it('renders a real video and marks the render done', async () => {
    const { renderId } = await seedRender();
    await renderHandler(job(renderId), context());

    const { rows } = await pool.query<{ status: string; output_asset_id: string | null }>(
      'select status, output_asset_id from renders where id = $1',
      [renderId],
    );
    expect(rows[0]!.status).toBe('done');
    expect(rows[0]!.output_asset_id).not.toBeNull();

    const { rows: asset } = await pool.query<{
      kind: string;
      mime_type: string;
      width: number;
      height: number;
      public_url: string;
    }>('select kind, mime_type, width, height, public_url from assets where id = $1', [
      rows[0]!.output_asset_id,
    ]);

    expect(asset[0]!.kind).toBe('video');
    expect(asset[0]!.mime_type).toBe('video/mp4');
    // 9:16 at the composition's declared size, not whatever Remotion defaulted to.
    expect(asset[0]!.width).toBe(1080);
    expect(asset[0]!.height).toBe(1920);

    const file = path.join(assetDir, path.basename(asset[0]!.public_url));
    const { streams } = await probe(file);
    expect(streams).toContain('video');
  }, 600_000);

  it('refuses a renderer it has no path for, instead of claiming another owns it', async () => {
    /**
     * The original message said video was "handled by the video pipeline",
     * which read as a delegation and was actually a dead end — the video
     * pipeline existed and nothing called it. An error should say what is
     * missing, not point at somewhere else.
     */
    const { contentItemId } = await seedRender();
    const render = await pool.query<{ id: string }>(
      `insert into renders (content_item_id, template_id, renderer, input_props, quality)
       values ($1,'ChefNoteCard','playwright','{}'::jsonb,'final') returning id`,
      [contentItemId],
    );

    await expect(renderHandler(job(render.rows[0]!.id), context())).rejects.toThrow(
      /no path in this handler/,
    );
  }, 60_000);

  it('takes its length from the voiceover rather than the template default', async () => {
    /**
     * ChefNoteCard defaults to 16 seconds. A 4-second read against that default
     * is twelve seconds of nothing, which is the most recognisable tell of a
     * template-generated video.
     */
    const { renderId, contentItemId } = await seedRender();

    const audioBytes = (
      await execFileAsync(
        'ffmpeg',
        [
          '-hide_banner',
          '-nostats',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=300:duration=4',
          '-ar',
          '44100',
          '-f',
          'mp3',
          '-',
        ],
        { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 },
      )
    ).stdout as unknown as Buffer;

    const { uploadAsset } = await import('./storage.js');
    const asset = await uploadAsset(context(), {
      bytes: audioBytes,
      mimeType: 'audio/mpeg',
      kind: 'audio',
      durationSeconds: 4,
      contentItemId,
      productId: 'recipefix',
    });
    await pool.query('update content_items set vo_asset_id = $2 where id = $1', [
      contentItemId,
      asset.id,
    ]);

    await renderHandler(job(renderId), context());

    const { rows } = await pool.query<{ output_asset_id: string }>(
      'select output_asset_id from renders where id = $1',
      [renderId],
    );
    const { rows: out } = await pool.query<{ public_url: string }>(
      'select public_url from assets where id = $1',
      [rows[0]!.output_asset_id],
    );

    const file = path.join(assetDir, path.basename(out[0]!.public_url));
    const { streams, seconds } = await probe(file);

    // The audio actually made it in.
    expect(streams).toContain('audio');
    // Four seconds of narration plus the held tail, not the sixteen-second default.
    expect(seconds).toBeGreaterThan(4);
    expect(seconds).toBeLessThan(8);
  }, 600_000);
});
