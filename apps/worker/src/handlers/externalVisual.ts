/**
 * External visual production for explicitly opted-in launch items.
 *
 * Blotato is a replaceable visual producer here, not Halyard's brain. Halyard
 * writes and verifies the content first; this job turns that approved draft
 * brief into media, stores the returned public assets, and returns the piece to
 * the ordinary media-review / human-approval boundary.
 */
import { McpClient } from '@halyard/core';
import type { HandlerContext, Job } from '../poller.js';

const BLOTATO_MCP_URL = 'https://mcp.blotato.com/mcp';
// Verified against blotato_list_visual_templates on 2026-09-27.
const CAROUSEL_TEMPLATE =
  process.env.BLOTATO_CAROUSEL_TEMPLATE_ID ??
  '/base/v2/tutorial-carousel/2491f97b-1b47-4efa-8b96-8c651fa7b3d5/v1';
const VIDEO_TEMPLATE =
  process.env.BLOTATO_VIDEO_TEMPLATE_ID ??
  '/base/v2/ai-story-video/5903fe43-514d-40ee-a060-0d6628c5f8fd/v1';
const PIN_TEMPLATE =
  process.env.BLOTATO_PIN_TEMPLATE_ID ??
  'ae868019-820d-434c-8fe1-74c9da99129a'; // Whiteboard Infographic

interface ItemRow {
  id: string;
  product_id: string;
  platform: string;
  format: string;
  category: string;
  body: string;
  title: string | null;
  alt_text: string | null;
  generation_meta: Record<string, unknown>;
  attached_asset_ids: string[];
  product_name: string;
  brand_tokens: Record<string, unknown> | null;
}

interface VisualCreate {
  id?: string;
  status?: string;
  data?: { id?: string; status?: string };
}

interface VisualStatus {
  status?: string;
  mediaUrl?: string | null;
  imageUrls?: string[];
  error?: string | null;
  errorMessage?: string | null;
  data?: VisualStatus;
}

interface VisualTemplateList {
  items?: Array<{ id?: string; description?: string; inputs?: unknown[] }>;
  data?: VisualTemplateList;
}

function unwrap<T extends object>(value: T): T {
  const nested = (value as { data?: T }).data;
  return nested && typeof nested === 'object' ? nested : value;
}

function visualTemplate(format: string): string | null {
  if (format === 'carousel') return CAROUSEL_TEMPLATE;
  if (format === 'video') return VIDEO_TEMPLATE;
  if (format === 'pin') return PIN_TEMPLATE;
  return null;
}

function promptFor(item: ItemRow): string {
  const colors = item.brand_tokens ?? {};
  const visualDirection =
    item.format === 'video'
      ? [
          'Create a 9:16 faceless educational short, about 20–30 seconds.',
          'Use tasteful illustrative kitchen/cooking scenes and readable captions.',
          'The imagery is illustrative only: NEVER fabricate product UI, customer results, testimonials, ratings, metrics, or a fake before/after.',
          'Do not make health or medical outcome claims. Do not show a person using a fake app screen.',
          'Use AI voiceover, with concise natural sentences. Mention the product only where the supplied copy does.',
        ].join(' ')
      : item.format === 'pin'
        ? [
            'Create one vertical Pinterest infographic/pin with a strong readable headline and 2–4 concise supporting points.',
            'Use the supplied brand colors and simple diagram-like or editorial imagery; prioritize save-worthy utility over decoration.',
            'NEVER fabricate product UI, customer quotes, metrics, ratings, testimonials, or fake proof.',
            'Keep the CTA restrained and consistent with the supplied copy.',
          ].join(' ')
        : [
            'Create a polished 4:5 educational Instagram carousel with 4–6 concise slides.',
            'Prefer typography, simple domain-relevant motifs, and diagram-like explanation over photorealistic fake product proof.',
            'NEVER fabricate product UI, customer quotes, metrics, ratings, testimonials, or a fake before/after result.',
            'End with a restrained CTA consistent with the supplied copy.',
          ].join(' ');

  return [
    `Brand: ${item.product_name}.`,
    visualDirection,
    `Primary brand color: ${String(colors.primary ?? '#C4714A')}.`,
    `Background: ${String(colors.background ?? '#FAF8F2')}.`,
    `Ink/text: ${String(colors.ink ?? '#2A2320')}.`,
    '',
    'Use ONLY the factual content in this approved Halyard draft. Do not add claims:',
    item.title ? `Title: ${item.title}` : '',
    item.body.replace(/\n\nSome imagery in this post is AI generated\. #AIgenerated\s*$/i, ''),
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 7_500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollVisual(
  client: McpClient,
  id: string,
  format: string,
): Promise<{ urls: string[]; status: VisualStatus }> {
  // Blotato's live MCP contract says not to poll visual jobs more often than
  // every 15 seconds, for images as well as video.
  const delay = 15_000;
  const maxPolls = format === 'video' ? 40 : 30;

  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
    const raw = await client.callToolJson<VisualStatus>('blotato_get_visual_status', { id });
    const result = unwrap(raw);
    const state = String(result.status ?? '').toLowerCase();
    const error = result.error ?? result.errorMessage ?? null;

    // The live 2026-09-27 tool contract names these terminal states explicitly,
    // and also says any non-empty `error` stops the job even if status is an
    // intermediate value such as `script-ready`. Waiting after that only burns
    // poll requests and can never recover.
    if (
      error ||
      ['failed', 'creation-from-template-failed', 'insufficient-credits', 'draft'].includes(state)
    ) {
      throw new Error(
        error ??
          (state === 'insufficient-credits'
            ? 'Blotato has insufficient visual-generation credits.'
            : `Blotato visual generation stopped in terminal state '${state || 'unknown'}'.`),
      );
    }

    if (state === 'done') {
      const urls = [
        ...(Array.isArray(result.imageUrls) ? result.imageUrls : []),
        ...(result.mediaUrl ? [result.mediaUrl] : []),
      ].filter(Boolean);
      if (urls.length === 0) {
        throw new Error('Blotato visual reached done but returned no media URL.');
      }
      return { urls, status: result };
    }

    if (attempt < maxPolls) await sleep(delay);
  }

  throw new Error(
    `Blotato visual ${id} did not settle inside the Halyard polling window. The id is stored; a retry will poll it rather than create another.`,
  );
}

async function attachAssets(
  ctx: HandlerContext,
  item: ItemRow,
  visualId: string,
  urls: string[],
): Promise<string[]> {
  const ids: string[] = [];

  for (const [index, url] of urls.entries()) {
    const existing = await ctx.pool.query<{ id: string }>(
      `select id from assets
        where product_id = $1 and source = 'blotato_create_visual'
          and public_url = $2 and archived_at is null
        limit 1`,
      [item.product_id, url],
    );
    if (existing.rows[0]) {
      ids.push(existing.rows[0].id);
      continue;
    }

    const mime = item.format === 'video' ? 'video/mp4' : 'image/png';
    const kind = item.format === 'video' ? 'video' : 'generated';
    const inserted = await ctx.pool.query<{ id: string }>(
      `insert into assets
         (product_id, kind, storage_path, mime_type, tags, caption, source,
          usable_for, public_url, source_url, original_filename, alt_text)
       values ($1,$2,$3,$4,$5,$6,'blotato_create_visual',$7,$8,$8,$9,$10)
       returning id`,
      [
        item.product_id,
        kind,
        `blotato/${visualId}/${index}`,
        mime,
        ['blotato', 'ai-generated', 'launch'],
        item.title ?? item.body.slice(0, 140),
        [item.platform],
        url,
        `blotato-${visualId}-${index}.${item.format === 'video' ? 'mp4' : 'png'}`,
        item.alt_text ?? item.title ?? `${item.product_name} social media visual`,
      ],
    );
    ids.push(inserted.rows[0]!.id);
  }

  return ids;
}

async function assertTemplateAvailable(client: McpClient, templateId: string): Promise<void> {
  const raw = await client.callToolJson<VisualTemplateList>('blotato_list_visual_templates', {
    id: templateId,
  });
  const result = unwrap(raw);
  const found = (result.items ?? []).some((item) => item.id === templateId);
  if (!found) {
    throw new Error(
      `Blotato visual template ${templateId} is no longer in the live catalog. ` +
        'Choose a replacement before spending generation credits.',
    );
  }
}

export async function generateExternalVisualHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const contentItemId = String(job.payload.contentItemId ?? '');
  if (!contentItemId) throw new Error('generate_external_visual needs contentItemId');

  const { rows } = await ctx.pool.query<ItemRow>(
    `select c.id, c.product_id, c.platform, c.format, c.category, c.body, c.title,
            c.alt_text, c.generation_meta, c.attached_asset_ids,
            p.name as product_name, p.brand_tokens
       from content_items c join products p on p.id = c.product_id
      where c.id = $1`,
    [contentItemId],
  );
  const item = rows[0];
  if (!item) return;

  if (item.generation_meta?.visual_provider !== 'blotato') {
    ctx.log('external visual skipped', { contentItemId, why: 'visual_provider is not blotato' });
    return;
  }

  const templateId = visualTemplate(item.format);
  if (!templateId) {
    await ctx.pool.query(
      `update content_items
          set status = 'failed',
              generation_meta = generation_meta || $2::jsonb
        where id = $1`,
      [contentItemId, JSON.stringify({ visual_error: `No Blotato visual template for ${item.format}` })],
    );
    return;
  }

  const apiKey = process.env.BLOTATO_API_KEY;
  if (!apiKey) throw new Error('BLOTATO_API_KEY is not set for external visual generation.');

  const client = new McpClient({
    url: BLOTATO_MCP_URL,
    token: apiKey,
    clientName: 'halyard-visual-producer',
    timeoutMs: 120_000,
  });

  let visualId = String(item.generation_meta?.blotato_visual_id ?? '');
  try {
    if (!visualId) {
      // Read-only preflight: fail before a paid generation call if a template was
      // retired or renamed since the last Halyard release.
      await assertTemplateAvailable(client, templateId);
      const raw = await client.callToolJson<VisualCreate>('blotato_create_visual', {
        templateId,
        inputs: {},
        prompt: promptFor(item),
        render: true,
        title: `${item.product_name} · ${item.platform} · ${item.category}`.slice(0, 120),
      });
      const created = unwrap(raw);
      visualId = String(created.id ?? '');
      if (!visualId) throw new Error('Blotato create_visual returned no visual id.');

      await ctx.pool.query(
        `update content_items
            set generation_meta = generation_meta || $2::jsonb
          where id = $1`,
        [
          contentItemId,
          JSON.stringify({
            visual_provider: 'blotato',
            blotato_visual_id: visualId,
            blotato_template_id: templateId,
            visual_status: created.status ?? 'submitted',
          }),
        ],
      );
    }

    const settled = await pollVisual(client, visualId, item.format);
    const assetIds = await attachAssets(ctx, item, visualId, settled.urls);
    const disclosure = 'Some imagery in this post is AI generated. #AIgenerated';

    await ctx.pool.query(
      `update content_items
          set attached_asset_ids = (
                select coalesce(array_agg(distinct x), '{}'::uuid[])
                  from unnest(attached_asset_ids || $2::uuid[]) x
              ),
              ai_components = (
                select coalesce(array_agg(distinct x), '{}'::text[])
                  from unnest(ai_components || array['imagery']::text[]) x
              ),
              requires_ai_label = true,
              disclosure_text = $3,
              body = case when body ~* '#AIgenerated\\b'
                          then body else rtrim(body) || E'\\n\\n' || $3 end,
              generation_meta = generation_meta || $4::jsonb,
              status = 'pending_approval'
        where id = $1`,
      [
        contentItemId,
        assetIds,
        disclosure,
        JSON.stringify({
          visual_provider: 'blotato',
          blotato_visual_id: visualId,
          blotato_template_id: templateId,
          visual_status: 'done',
          visual_urls: settled.urls,
        }),
      ],
    );

    await ctx.enqueue(
      'review_media',
      { contentItemId },
      { dedupeKey: `review_media:${contentItemId}:blotato`, priority: 40 },
    );

    ctx.log('external visual ready', {
      contentItemId,
      provider: 'blotato',
      visualId,
      assets: assetIds.length,
      format: item.format,
    });
  } catch (err) {
    await ctx.pool.query(
      `update content_items
          set status = 'failed',
              generation_meta = generation_meta || $2::jsonb
        where id = $1`,
      [
        contentItemId,
        JSON.stringify({
          visual_provider: 'blotato',
          ...(visualId ? { blotato_visual_id: visualId } : {}),
          visual_status: 'failed',
          visual_error: (err as Error).message.slice(0, 1000),
        }),
      ],
    );
    throw err;
  }
}
