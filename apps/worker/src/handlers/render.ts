/**
 * Render handler. Satori/Sharp for images today; the Remotion path shells out
 * to the CLI inside the worker container, where Chromium already lives.
 *
 * A render that fails after its retries leaves the item `failed` with the error
 * visible in the queue and a Retry render button. It never publishes without
 * media (build pack §3).
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderTemplate, type TemplateId } from '@halyard/render';
import { durationInFrames, type CaptionCue } from '@halyard/render/timing';
import { muxAudioIntoVideo } from '../audio.js';
import type { Job, HandlerContext } from '../poller.js';
import { ASSET_BUCKET, uploadAsset, type UploadedAsset } from '../storage.js';
import { renderVideo } from '../video.js';

interface RenderRow {
  id: string;
  content_item_id: string | null;
  template_id: string;
  renderer: string;
  input_props: Record<string, unknown>;
  quality: 'preview' | 'final';
  slide_index: number;
}

async function renderImageAsset(
  render: RenderRow,
  ctx: HandlerContext,
  options: {
    aspectRatio: string;
    brandTokens: Record<string, unknown> | null;
    wordmark: string | undefined;
  },
): Promise<UploadedAsset> {
  const result = await renderTemplate({
    templateId: render.template_id as TemplateId,
    props: render.input_props,
    brandTokens: options.brandTokens,
    aspectRatio: options.aspectRatio,
    quality: render.quality,
    wordmark: options.wordmark,
  });

  return uploadAsset(ctx, {
    bytes: result.png,
    mimeType: 'image/png',
    kind: 'generated',
    width: result.width,
    height: result.height,
    caption: (render.input_props.alt_text as string | undefined) ?? null,
    contentItemId: render.content_item_id,
  });
}

/**
 * Render a Remotion composition, and attach the voiceover if one was produced.
 *
 * ## Audio-first timing
 *
 * The composition's own `durationInFrames` is a preview default. The real
 * length comes from the mixed audio, so the video ends when the narration
 * does — a fixed 28-second template against a 19-second read gives nine
 * seconds of nothing, which is the single most recognisable tell of a
 * template-generated video.
 *
 * With no voiceover, the composition default stands and the video is silent.
 * That is a legitimate state for a caption-led cut, and it is recorded rather
 * than presumed: the asset carries no audio stream and the QC gate says so.
 */
async function renderVideoAsset(
  render: RenderRow,
  ctx: HandlerContext,
  brandTokens: Record<string, unknown> | null,
): Promise<UploadedAsset> {
  const audio = render.content_item_id ? await loadVoiceover(ctx, render.content_item_id) : null;

  const work = await mkdtemp(path.join(tmpdir(), 'halyard-render-'));
  const silentPath = path.join(work, 'silent.mp4');
  const finalPath = path.join(work, 'final.mp4');

  try {
    const result = await renderVideo({
      compositionId: render.template_id,
      props: {
        ...render.input_props,
        ...(brandTokens ? { brand: brandTokens } : {}),
        // Captions are burned in from data. The audio is muxed afterwards
        // rather than played by the renderer, so the composition gets none.
        ...(audio?.captions ? { captions: audio.captions } : {}),
        audioSrc: null,
      },
      outputPath: silentPath,
      ...(audio ? { durationInFrames: durationInFrames(audio.durationSeconds) } : {}),
    });

    let output = silentPath;
    if (audio) {
      await writeFile(path.join(work, 'mix.mp3'), audio.bytes);
      await muxAudioIntoVideo(silentPath, path.join(work, 'mix.mp3'), finalPath);
      output = finalPath;
    }

    return await uploadAsset(ctx, {
      bytes: await readFile(output),
      mimeType: 'video/mp4',
      kind: 'video',
      width: result.width,
      height: result.height,
      durationSeconds: audio?.durationSeconds ?? result.durationInFrames / result.fps,
      caption: (render.input_props.alt_text as string | undefined) ?? null,
      contentItemId: render.content_item_id,
    });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

interface Voiceover {
  bytes: Buffer;
  durationSeconds: number;
  captions: CaptionCue[] | null;
}

/**
 * The mixed voiceover for an item, read back from storage.
 *
 * Returns null rather than throwing when there is no voiceover: whether a
 * silent video is acceptable is the caller's decision, not this function's.
 */
async function loadVoiceover(
  ctx: HandlerContext,
  contentItemId: string,
): Promise<Voiceover | null> {
  const { rows } = await ctx.pool.query<{
    storage_path: string | null;
    public_url: string | null;
    duration_seconds: string | null;
    qc: { audio?: { captions?: CaptionCue[] } } | null;
  }>(
    `select a.storage_path, a.public_url, a.duration_seconds, ci.qc_results as qc
       from content_items ci
       join assets a on a.id = ci.vo_asset_id
      where ci.id = $1`,
    [contentItemId],
  );

  const row = rows[0];
  if (!row) return null;

  const bytes = await readAssetBytes(row.storage_path, row.public_url);
  if (!bytes) return null;

  return {
    bytes,
    durationSeconds: Number(row.duration_seconds ?? 0),
    captions: row.qc?.audio?.captions ?? null,
  };
}

/**
 * Read an asset's bytes back, by whichever route `uploadAsset` used to store
 * them — the bucket in production, the web app's public directory locally.
 *
 * A `file://local/...` URL means storage was not configured *and* no local
 * directory was set, so the bytes were never written anywhere. That returns
 * null: there is genuinely nothing to read, and pretending otherwise would
 * produce a video muxed against a file that does not exist.
 */
async function readAssetBytes(
  storagePath: string | null,
  publicUrl: string | null,
): Promise<Buffer | null> {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey && storagePath) {
    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/${ASSET_BUCKET}/${storagePath}`,
      { headers: { authorization: `Bearer ${serviceKey}` } },
    );
    if (!response.ok) {
      throw new Error(
        `Could not read the voiceover back from storage (${storagePath}): HTTP ${response.status}. ` +
          'Rendering would otherwise produce a silent video from an item that has audio.',
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  // The local fallback flattens the storage path into one filename, so the
  // basename of the URL is the filename on disk.
  const localDir = process.env.HALYARD_LOCAL_ASSET_DIR;
  if (localDir && publicUrl?.startsWith('/dev-assets/')) {
    return readFile(path.join(localDir, path.basename(publicUrl))).catch(() => null);
  }

  return null;
}

export async function renderHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const renderId = String(job.payload.renderId ?? '');
  if (!renderId) throw new Error('render job has no renderId');

  const { rows } = await ctx.pool.query<RenderRow>('select * from renders where id = $1', [
    renderId,
  ]);

  const render = rows[0];
  if (!render) throw new Error(`render ${renderId} not found`);

  await ctx.pool.query(`update renders set status = 'rendering' where id = $1`, [renderId]);

  const started = Date.now();
  try {
    /**
     * The video branch, which this handler has been promising and refusing in
     * the same breath since it was written.
     *
     * The message below said video was "handled by the video pipeline" — and
     * `renderVideo` did exist, complete and working, called by nothing but a
     * demo script. Four Remotion templates sit in the `templates` table marked
     * `enabled`, so they are offered by the UI and countable in the mix, and no
     * production path could produce a single frame of any of them.
     */
    if (render.renderer !== 'satori' && render.renderer !== 'remotion') {
      throw new Error(
        `Renderer '${render.renderer}' has no path in this handler. ` +
          `Known renderers: satori (images), remotion (video).`,
      );
    }

    const template = await ctx.pool.query<{ aspect_ratio: string; enabled: boolean }>(
      'select aspect_ratio, enabled from templates where id = $1',
      [render.template_id],
    );
    const templateRow = template.rows[0];
    if (!templateRow) throw new Error(`template ${render.template_id} not found`);
    if (!templateRow.enabled) throw new Error(`template ${render.template_id} is disabled`);

    const product = render.content_item_id
      ? await ctx.pool.query<{ brand_tokens: Record<string, unknown>; name: string }>(
          `select p.brand_tokens, p.name
             from content_items ci join products p on p.id = ci.product_id
            where ci.id = $1`,
          [render.content_item_id],
        )
      : { rows: [] as Array<{ brand_tokens: Record<string, unknown>; name: string }> };

    const asset =
      render.renderer === 'remotion'
        ? await renderVideoAsset(render, ctx, product.rows[0]?.brand_tokens ?? null)
        : await renderImageAsset(render, ctx, {
            aspectRatio: templateRow.aspect_ratio,
            brandTokens: product.rows[0]?.brand_tokens ?? null,
            wordmark: product.rows[0]?.name?.toLowerCase(),
          });

    await ctx.pool.query(
      `update renders set status = 'done', output_asset_id = $2, duration_ms = $3, error = null
        where id = $1`,
      [renderId, asset.id, Date.now() - started],
    );

    ctx.log('rendered', {
      renderId,
      template: render.template_id,
      ms: Date.now() - started,
      quality: render.quality,
    });

    /**
     * When the last render for an item lands, look at what was produced.
     *
     * Enqueued here rather than run inline because describing frames is slow
     * and this handler holds a render slot. Deduped per item so a carousel's
     * six slides do not queue six reviews.
     *
     * Only for final renders: a preview is a 480px draft nobody publishes.
     */
    if (render.content_item_id && render.quality === 'final') {
      const { rows: outstanding } = await ctx.pool.query<{ n: string }>(
        `select count(*) as n from renders
          where content_item_id = $1 and quality = 'final' and status not in ('done','failed')`,
        [render.content_item_id],
      );
      if (Number(outstanding[0]?.n ?? 0) === 0) {
        await ctx.enqueue(
          'review_media',
          { contentItemId: render.content_item_id },
          { dedupeKey: `review_media:${render.content_item_id}`, priority: 40 },
        );
      }
    }
  } catch (err) {
    await ctx.pool.query(`update renders set status = 'failed', error = $2 where id = $1`, [
      renderId,
      (err as Error).message.slice(0, 2000),
    ]);
    if (render.content_item_id && job.attempts >= job.max_attempts) {
      await ctx.pool.query(`update content_items set status = 'failed' where id = $1`, [
        render.content_item_id,
      ]);
    }
    throw err;
  }
}
