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
import {
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
  checkThumbnail,
  thumbnailPasses,
} from '@halyard/core';
import { renderTemplate, resolveBrand, type TemplateId } from '@halyard/render';
import { calloutsFromSteps, motifFor } from '@halyard/render/video';
import {
  planAnnotations,
  runMediaIntegrity,
  calloutSourceFromCapture,
  footageSpansFor,
  type CapturedStep,
} from '@halyard/core';
import { stageFootage } from '../footage.js';
import { openStage } from '../stage.js';
import { durationInFrames, type CaptionCue } from '@halyard/render/timing';
import { hasFaststart, meanVolumeDb, muxAudioIntoVideo } from '../audio.js';
import { PermanentJobFailure } from '../poller.js';
import type { Job, HandlerContext } from '../poller.js';
import { readAssetBytes, uploadAsset, type UploadedAsset } from '../storage.js';
import { measureLowerLuminance, renderVideo } from '../video.js';

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
  /**
   * §268. Inline the photograph, if this slide has one.
   *
   * Satori cannot fetch a URL, so an image has to arrive as bytes. The props
   * carry an **asset id** rather than a data URI because `input_props` is
   * stored on the row and a megabyte of base64 per slide would be written to
   * Postgres six times per carousel and read back on every retry.
   *
   * A missing or unreadable asset is not fatal: the layout falls back to its
   * text form, which is what every card did before there were photographs.
   */
  const props = { ...render.input_props };

  /**
   * §273. Inline a real screenshot of the product, if this slide carries one.
   *
   * Same mechanism as the hero image and for the same reason — Satori cannot
   * fetch a URL, and the props hold an id rather than a megabyte of base64 that
   * would be written to Postgres and read back on every retry.
   */
  const shotAssetId = props.screenshotAssetId as string | undefined;
  if (shotAssetId) {
    const { rows } = await ctx.pool.query<{
      storage_path: string | null;
      public_url: string | null;
      mime_type: string | null;
    }>('select storage_path, public_url, mime_type from assets where id = $1', [shotAssetId]);
    const shot = rows[0];
    const bytes = shot ? await readAssetBytes(shot.storage_path, shot.public_url) : null;
    if (bytes) {
      props.screenshotDataUri = `data:${shot?.mime_type ?? 'image/png'};base64,${bytes.toString('base64')}`;
    } else {
      ctx.log('product screenshot could not be read, rendering without it', {
        renderId: render.id,
        assetId: shotAssetId,
      });
    }
  }

  const imageAssetId = props.imageAssetId as string | undefined;
  if (imageAssetId) {
    const { rows } = await ctx.pool.query<{
      storage_path: string | null;
      public_url: string | null;
      mime_type: string | null;
    }>('select storage_path, public_url, mime_type from assets where id = $1', [imageAssetId]);
    const asset = rows[0];
    const bytes = asset ? await readAssetBytes(asset.storage_path, asset.public_url) : null;
    if (bytes) {
      props.imageDataUri = `data:${asset?.mime_type ?? 'image/png'};base64,${bytes.toString('base64')}`;
    } else {
      ctx.log('slide image could not be read, rendering without it', {
        renderId: render.id,
        assetId: imageAssetId,
      });
    }
  }

  const result = await renderTemplate({
    templateId: render.template_id as TemplateId,
    props,
    brandTokens: options.brandTokens,
    aspectRatio: options.aspectRatio,
    quality: render.quality,
    wordmark: options.wordmark,
    /*
     * §224. A thumbnail has an exact canvas, not an aspect ratio. 16:9
     * resolves to 1920x1080 for a video frame, and a thumbnail is 1280x720 —
     * the same shape, a different picture, and the legible-size arithmetic is
     * calibrated against the real one.
     */
    ...(render.template_id === 'youtube_thumbnail'
      ? { size: { width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT } }
      : {}),
  });

  /*
   * §224. Checked against the bytes that actually exist, not the intent.
   *
   * `thumbnails.set` accepts anything valid under 2 MB, so a thumbnail nobody
   * can read uploads exactly as successfully as a good one. This is the only
   * point where the rendered size and the real byte count are both facts.
   */
  if (render.template_id === 'youtube_thumbnail') {
    const issues = checkThumbnail({
      overlayText: (render.input_props.overlayText as string) ?? '',
      fontSizePx: (render.input_props.fontSizePx as number) ?? 0,
      width: result.width,
      height: result.height,
      byteLength: result.png.byteLength,
    });
    if (!thumbnailPasses(issues)) {
      throw new Error(
        `Thumbnail failed its own checks: ${issues
          .filter((i) => i.severity === 'fail')
          .map((i) => `${i.rule} — ${i.detail}`)
          .join('; ')}`,
      );
    }
    for (const issue of issues) ctx.log('thumbnail warning', { rule: issue.rule, detail: issue.detail });
  }

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

  /**
   * §246. Put the product footage back before asking Remotion for it.
   *
   * A beat references footage as a path inside the bundle's `public/`
   * directory, and the capture handler writes it there and nowhere else. A
   * deployed container is ephemeral, so after any redeploy that file is gone
   * and the render fails with a 404 from the bundle's own dev server — three
   * retries, then `dead`, with nothing in the error saying the file did not
   * survive the deploy.
   */
  const beats = Array.isArray(render.input_props?.beats)
    ? (render.input_props.beats as Array<Record<string, unknown>>)
    : [];
  const footage = await stageFootage(ctx, beats, readAssetBytes);
  if (footage.missing.length > 0) {
    /*
     * Refused rather than rendered without it. A beat planned around product
     * footage that silently renders as a text card is worse than a failure:
     * it looks finished, and the evidence the piece was built on is simply
     * absent.
     */
    throw new PermanentJobFailure(
      `Captured footage is missing and cannot be staged: ${footage.missing
        .map((m) => `${m.file} — ${m.reason}`)
        .join(' ')}`,
      'Re-run the capture for this flow. Retrying the render cannot conjure a file that is not stored.',
    );
  }

  const work = await mkdtemp(path.join(tmpdir(), 'halyard-render-'));
  const silentPath = path.join(work, 'silent.mp4');
  const finalPath = path.join(work, 'final.mp4');

  /**
   * §294. The piece's own photograph, behind the video.
   *
   * Video renders had no background image path at all — the image path got one
   * in §268 and the video path was left flat, which is why every video was type
   * on cream while the carousels had photographs. Read from the item's attached
   * assets rather than the render props, because the hero is attached to the
   * *piece* and shared by every render it has.
   */
  let videoBackground: string | undefined;
  let videoBackgroundLuminance: number | null = null;
  if (render.content_item_id) {
    const { rows } = await ctx.pool.query<{
      storage_path: string | null;
      public_url: string | null;
      mime_type: string | null;
    }>(
      `select a.storage_path, a.public_url, a.mime_type
         from content_items ci
         join assets a on a.id = any(ci.attached_asset_ids)
        where ci.id = $1 and a.source = 'generated'
        order by a.created_at desc
        limit 1`,
      [render.content_item_id],
    );
    const asset = rows[0];
    const bytes = asset ? await readAssetBytes(asset.storage_path, asset.public_url) : null;
    if (bytes) {
      videoBackground = `data:${asset?.mime_type ?? 'image/png'};base64,${bytes.toString('base64')}`;

      /*
       * §301. Ask how bright it is where the type will sit, so the scrim can be
       * scaled to this photograph rather than to an average one. Written to a
       * file first because ffmpeg reads paths, not data URIs; measured over the
       * lower band only, because a whole-image mean says nothing about the part
       * a headline crosses. A failure here leaves it null and the composition
       * keeps its fixed scrim — unmeasured is not mid-grey.
       */
      const probePath = path.join(work, `bg-probe.${(asset?.mime_type ?? 'image/png').includes('jpeg') ? 'jpg' : 'png'}`);
      await writeFile(probePath, bytes);
      videoBackgroundLuminance = await measureLowerLuminance(probePath);
    }
  }

  /**
   * §303. Callouts a walkthrough can actually point at.
   *
   * `WalkthroughCallout.at` has existed since §298 and every callout ever built
   * passed `null`, which pins the text beside the device and never draws the
   * ring. Two hops were missing: the runner did not record where a tap landed,
   * and nothing turned a capture into callouts. This is the second.
   *
   * Read from `capture_runs` rather than from the render's own props, because
   * the capture is the record of what happened and the props are a plan. A
   * callout derived from the plan could name a step the capture skipped.
   *
   * The spans are recomputed from the same steps `cutFootage` used, so the
   * mapping into cut time cannot drift from the cut itself.
   */
  let walkthroughCallouts: unknown[] | undefined;
  if (render.template_id === 'Walkthrough') {
    const flowId = String(render.input_props.flowId ?? 'adapt_and_reveal');
    const { rows: runRows } = await ctx.pool.query<{ steps: CapturedStep[] }>(
      `select steps from capture_runs
        where flow_id = $1 and mode = 'capture' and ok
        order by started_at desc
        limit 1`,
      [flowId],
    );
    const steps = runRows[0]?.steps ?? [];
    if (steps.length > 0) {
      const source = calloutSourceFromCapture(steps, footageSpansFor(steps));

      /**
       * §331. The director decides which of these earn a mark.
       *
       * `calloutsFromSteps` produced one callout per step and capped the count,
       * which is a *quota* rather than a decision — it kept the first four
       * whether or not anybody was talking about them, and gave a chip and a
       * full-width row the same treatment.
       *
       * The director requires both halves: a line being spoken, and a region
       * the frame can locate *at that moment*. Its mark vocabulary comes from
       * the product's own pack (§330), derived from the brand, so RecipeFix and
       * Kinolog do not share a pen.
       */
      /* §323. The product's own tokens where it has them, resolved to a full set. */
      const motif = motifFor(resolveBrand(brandTokens));
      const durationSeconds =
        (render.input_props.footageSeconds as number | undefined) ??
        source[source.length - 1]?.atSeconds ??
        20;

      /*
       * §387. The annotation director's stage — where to point, how big, for
       * how long. Declared in `STAGE_AGENTS`, opened nowhere until now.
       */
      const marks = openStage(ctx, 'marks');

      const plan = planAnnotations({
        narration: source.map((s) => ({
          atSeconds: s.atSeconds,
          text: s.label,
          targetLabel: s.label,
        })),
        targets: source
          .filter((s) => s.at)
          .map((s) => ({
            label: s.label,
            box: {
              x: s.at!.x - s.at!.width / 2,
              y: s.at!.y - s.at!.height / 2,
              width: s.at!.width,
              height: s.at!.height,
            },
            atSeconds: s.atSeconds,
            /* §319. A tap position is true at the instant it was measured. */
            validForSeconds: 1.2,
          })),
        marks: motif.marks.filter(
          (m): m is 'arrow' | 'circle' | 'box' | 'underline' =>
            m === 'arrow' || m === 'circle' || m === 'box' || m === 'underline',
        ),
        durationSeconds,
      });

      marks.log('annotations planned', {
        renderId: render.id,
        register: motif.register,
        because: motif.reason,
        marks: plan.marks.map((m) => `${m.kind} on ${m.target.label}: ${m.reason}`),
        skipped: plan.skipped.map((s) => `${s.label} — ${s.because}`),
      });

      /*
       * A callout survives when the director marked its region, plus any with
       * no position at all — a remark about the whole step is still worth
       * saying and simply has nothing to point at.
       */
      const marked = new Set(plan.marks.map((m) => m.target.label));
      walkthroughCallouts = calloutsFromSteps(
        source.filter((s) => !s.at || marked.has(s.label)),
        { maxCallouts: 4 },
      );
    }
  }

  /*
   * §407. Each beat's own photograph, resolved from the asset it names.
   *
   * The worker stores an id on the beat because a render row holding four
   * base64 images would be megabytes of JSON in Postgres for data that already
   * exists in the asset store. Resolved here, at the last possible moment,
   * straight into the props Remotion receives.
   *
   * A beat whose asset cannot be read keeps no background of its own and falls
   * back to the piece's, which is what every render did before this — a flatter
   * beat, not a broken one.
   */
  const beatProps = (render.input_props as { beats?: Array<Record<string, unknown>> }).beats;
  if (Array.isArray(beatProps)) {
    let photographed = 0;
    for (const beat of beatProps) {
      const assetId = beat.backgroundAssetId as string | undefined;
      if (!assetId) continue;
      const { rows } = await ctx.pool.query<{
        storage_path: string | null;
        public_url: string | null;
        mime_type: string | null;
      }>('select storage_path, public_url, mime_type from assets where id = $1', [assetId]);
      const asset = rows[0];
      const bytes = asset ? await readAssetBytes(asset.storage_path, asset.public_url) : null;
      if (!bytes) continue;
      beat.backgroundDataUri = `data:${asset?.mime_type ?? 'image/png'};base64,${bytes.toString('base64')}`;
      const probe = path.join(work, `beat-${photographed}.png`);
      await writeFile(probe, bytes);
      /* §301. Measured per picture: §402 makes consecutive beats lit differently. */
      beat.backgroundLuminance = await measureLowerLuminance(probe);
      photographed += 1;
    }
    if (photographed > 0) {
      ctx.log('beats photographed', { renderId: render.id, photographed, of: beatProps.length });
    }
  }

  try {
    const result = await renderVideo({
      compositionId: render.template_id,
      props: {
        ...render.input_props,
        ...(videoBackground ? { backgroundDataUri: videoBackground } : {}),
        ...(videoBackgroundLuminance !== null
          ? { backgroundLuminance: videoBackgroundLuminance }
          : {}),
        ...(walkthroughCallouts ? { callouts: walkthroughCallouts } : {}),
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

    /**
     * §317. The checks that would have caught 2026-08-29, run on every video.
     *
     * `runVisualQC` asks about frames — aspect, resolution, safe area,
     * contrast. Every defect found that day was a property of the *piece*: a
     * quiz ending on "Question 3 of 4", four files with a silent audio track,
     * a narrator still speaking over the next card. All arithmetic, none of it
     * checked, and a person was the thing that found them.
     *
     * Failures are recorded and logged rather than thrown. A render that
     * produced a file is worth keeping — an operator can look at it — and the
     * approval gate is where a defective piece should be stopped, not here.
     */
    const integrity = runMediaIntegrity({
      durationSeconds: audio?.durationSeconds ?? result.durationInFrames / result.fps,
      meanVolumeDb: await meanVolumeDb(output),
      /* §320. Invisible to level measurement; asked separately. */
      moovBeforeMdat: await hasFaststart(output),
      hasNarration: Boolean(audio),
      ...(typeof render.input_props.requiredSeconds === 'number'
        ? { requiredSeconds: render.input_props.requiredSeconds }
        : {}),
    });
    if (!integrity.passed) {
      ctx.log('media integrity failed', {
        renderId: render.id,
        findings: integrity.findings.map((f) => `${f.rule}: ${f.message}`),
      });
    }
    if (render.content_item_id) {
      await ctx.pool.query(
        `update content_items
            set qc_results = coalesce(qc_results, '{}'::jsonb) || jsonb_build_object('media', $2::jsonb)
          where id = $1`,
        [render.content_item_id, JSON.stringify(integrity)],
      );
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

  /**
   * §161. An item that *has* a voiceover and cannot read it is broken, and says so.
   *
   * The coupling looked like a defect — captions vanished with the audio,
   * because this returned `null` and the caller reads `audio?.captions`. But
   * `readAssetBytes` already states the rule for the Supabase path: it throws,
   * because "rendering would otherwise produce a silent video from an item that
   * has audio". The local fallback returned `null` instead, so the same broken
   * state failed loudly in production and degraded quietly on a laptop.
   *
   * The fix is the consistency, not the coupling. A silent caption-led cut is
   * legitimate for an item with **no** voiceover — `row` is absent and this
   * returns `null` above. It is not legitimate for an item whose narration
   * exists and could not be fetched: that ships a video missing the half the
   * script was written for.
   */
  const bytes = await readAssetBytes(row.storage_path, row.public_url);
  if (!bytes) {
    throw new Error(
      `Voiceover asset ${row.storage_path ?? row.public_url ?? '(no path)'} could not be read. ` +
        'This item has audio, so rendering it now would ship a silent video of a narrated script. ' +
        'Re-run tts, or check HALYARD_LOCAL_ASSET_DIR / storage configuration.',
    );
  }

  return {
    bytes,
    durationSeconds: Number(row.duration_seconds ?? 0),
    captions: row.qc?.audio?.captions ?? null,
  };
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

    /*
     * §387. Turning the plan into frames — the edit bay. This is the last of
     * the seven stages that were declared and never opened.
     */
    openStage(ctx, 'render').log('rendered', {
      renderId,
      template: render.template_id,
      because: `${render.template_id} at ${render.quality}`,
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
        /*
         * §238. A render that succeeds clears a failure it caused.
         *
         * Only when the item was failed *by a render* — the marker written in
         * the catch below — and only when no final render for it is still
         * failed. An item failed for any other reason keeps its status,
         * because a render succeeding says nothing about a claim that could
         * not be verified.
         */
        const { rows: recovered } = await ctx.pool.query<{ id: string }>(
          `update content_items
              set status = 'pending_approval',
                  generation_meta = generation_meta - 'renderFailure'
            where id = $1
              and status = 'failed'
              and generation_meta ? 'renderFailure'
              and not exists (
                select 1 from renders
                 where content_item_id = $1 and quality = 'final' and status = 'failed'
              )
            returning id`,
          [render.content_item_id],
        );
        if (recovered.length > 0) {
          ctx.log('item recovered after a successful re-render', {
            contentItemId: render.content_item_id,
          });
        }

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
      /*
       * §238. Marked failed *and attributed*.
       *
       * The reason matters because it is the only thing that makes recovery
       * safe. Without it a later successful render cannot tell whether the
       * item is failed because of this render or because of something else
       * entirely, so it must leave it alone — and a production item was found
       * stuck at `failed` with both of its renders `done` and no error, which
       * no screen explains and no job retries.
       */
      await ctx.pool.query(
        `update content_items
            set status = 'failed',
                generation_meta = generation_meta || jsonb_build_object(
                  'renderFailure', jsonb_build_object(
                    'renderId', $2::text,
                    'at', now()::text,
                    'error', $3::text
                  ))
          where id = $1`,
        [render.content_item_id, renderId, (err as Error).message.slice(0, 400)],
      );
    }
    throw err;
  }
}
