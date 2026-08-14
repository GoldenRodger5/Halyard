/**
 * Render handler. Satori/Sharp for images today; the Remotion path shells out
 * to the CLI inside the worker container, where Chromium already lives.
 *
 * A render that fails after its retries leaves the item `failed` with the error
 * visible in the queue and a Retry render button. It never publishes without
 * media (build pack §3).
 */
import { renderTemplate, type TemplateId } from '@halyard/render';
import type { Job, HandlerContext } from '../poller.js';
import { uploadAsset } from '../storage.js';

export async function renderHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const renderId = String(job.payload.renderId ?? '');
  if (!renderId) throw new Error('render job has no renderId');

  const { rows } = await ctx.pool.query<{
    id: string;
    content_item_id: string | null;
    template_id: string;
    renderer: string;
    input_props: Record<string, unknown>;
    quality: 'preview' | 'final';
    slide_index: number;
  }>('select * from renders where id = $1', [renderId]);

  const render = rows[0];
  if (!render) throw new Error(`render ${renderId} not found`);

  await ctx.pool.query(`update renders set status = 'rendering' where id = $1`, [renderId]);

  const started = Date.now();
  try {
    if (render.renderer !== 'satori') {
      throw new Error(
        `Renderer '${render.renderer}' is handled by the video pipeline, not the image handler.`,
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

    const result = await renderTemplate({
      templateId: render.template_id as TemplateId,
      props: render.input_props,
      brandTokens: product.rows[0]?.brand_tokens ?? null,
      aspectRatio: templateRow.aspect_ratio,
      quality: render.quality,
      wordmark: product.rows[0]?.name?.toLowerCase(),
    });

    const asset = await uploadAsset(ctx, {
      bytes: result.png,
      mimeType: 'image/png',
      kind: 'generated',
      width: result.width,
      height: result.height,
      caption: (render.input_props.alt_text as string | undefined) ?? null,
      contentItemId: render.content_item_id,
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
