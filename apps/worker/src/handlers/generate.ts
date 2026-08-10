/**
 * The daily generation job. v1 §4.2 and §4.3, v2 Part G.
 *
 *   signals → ideas (scored, mix-debt driven) → per-platform drafts → renders
 *
 * Two rules the loop must not lose:
 *   · Content is built from a real artifact. If the connector is unreachable,
 *     generation for that product pauses rather than inventing (build pack §3).
 *   · One model call per platform. Never one call producing every platform.
 *   · Nothing that fails a QC gate reaches the queue.
 *
 * Until the first-run wizard is complete, this job refuses to run and says so,
 * rather than producing generic content silently (build pack §2).
 */
import {
  AnthropicLlmClient,
  ConnectorUnavailableError,
  DraftRejectedError,
  createConnector,
  selectIdeas,
  writeDraft,
  type IdeaCandidate,
  type LlmClient,
  type ProductArtifact,
  type SlopPlatform,
} from '@halyard/core';
import { carouselProps, transformationDiffProps } from '@halyard/render';
import type { Job, HandlerContext } from '../poller.js';
import { notify } from './publish.js';

export async function generateHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const productId = String(job.payload.productId ?? 'recipefix');
  const llm: LlmClient = (job.payload.llm as LlmClient) ?? new AnthropicLlmClient();

  // ── Cold-start guard (build pack §2) ─────────────────────────────────────
  const onboarding = await ctx.pool.query<{
    step_ingest_done: boolean;
    step_voice_done: boolean;
    step_calibration_done: boolean;
    step_templates_done: boolean;
  }>('select * from onboarding_state where product_id = $1', [productId]);

  const state = onboarding.rows[0];
  const incomplete = !state
    ? ['ingest', 'voice', 'calibration', 'templates']
    : [
        !state.step_ingest_done && 'ingest',
        !state.step_voice_done && 'voice',
        !state.step_calibration_done && 'calibration',
        !state.step_templates_done && 'templates',
      ].filter(Boolean);

  if (incomplete.length > 0) {
    ctx.log('generation blocked: first-run wizard incomplete', { productId, incomplete });
    await notify(
      ctx,
      'connector_down',
      'info',
      'Daily generation did not run',
      `The first-run wizard is not finished: ${incomplete.join(', ')} still outstanding. ` +
        'Halyard will not produce content until the voice is calibrated.',
    );
    return;
  }

  const settings = await ctx.pool.query<{ generation_enabled: boolean }>(
    'select generation_enabled from settings where id = true',
  );
  if (!settings.rows[0]?.generation_enabled) {
    ctx.log('generation disabled in settings', { productId });
    return;
  }

  // ── Product context ──────────────────────────────────────────────────────
  const productRows = await ctx.pool.query<{
    id: string;
    name: string;
    brief_summary: string | null;
    brief_markdown: string | null;
    content_rules: { forbidden_claims?: string[]; banned_phrases?: string[] };
    connector_type: 'mcp' | 'rest' | 'none';
    connector_config: Record<string, unknown>;
  }>('select * from products where id = $1', [productId]);

  const product = productRows.rows[0];
  if (!product) throw new Error(`product ${productId} not found`);

  const proposed = await ctx.pool.query<{
    id: string;
    title: string;
    angle: string;
    category: IdeaCandidate['category'];
    embedding: number[] | null;
  }>(
    `select id, title, angle, category, embedding from ideas
      where product_id = $1 and status = 'proposed'
        and (snoozed_until is null or snoozed_until < now())
        and (expires_at is null or expires_at > now())`,
    [productId],
  );

  if (proposed.rows.length === 0) {
    ctx.log('no proposed ideas to draft', { productId });
    return;
  }

  // ── Mix state, straight from the database functions ──────────────────────
  const mixActual = await ctx.pool.query<{ category: string; published: number; share: string }>(
    'select * from content_mix_actual($1, $2, 21)',
    [productId, 'brand'],
  );
  const productShare = await ctx.pool.query<{ product_content_share: string }>(
    'select product_content_share($1, $2, 14)',
    [productId, 'brand'],
  );
  const voice = await ctx.pool.query<{
    display_name: string;
    description: string;
    do_rules: string[];
    dont_rules: string[];
    examples: Array<{ platform?: string; text: string; why_good?: string }>;
    anti_examples: Array<{ text: string; why_bad?: string }>;
    mix_targets: Record<string, number>;
  }>(`select * from brand_voices where product_id = $1 and persona = 'brand'`, [productId]);

  const voiceRow = voice.rows[0];
  if (!voiceRow) throw new Error(`no brand voice configured for ${productId}`);

  const templates = await ctx.pool.query<{ id: string; format: string }>(
    'select id, format from templates where (product_id = $1 or product_id is null) and enabled',
    [productId],
  );
  const enabledTemplates = templates.rows.map((t) => t.id);

  const recentEmbeddings = (
    await ctx.pool.query<{ embedding: number[] | null }>(
      `select embedding from ideas
        where product_id = $1 and status = 'used' and created_at > now() - interval '60 days'`,
      [productId],
    )
  ).rows
    .map((r) => r.embedding)
    .filter((e): e is number[] => Array.isArray(e));

  const { selected, rejected } = selectIdeas(
    proposed.rows.map((row) => ({
      id: row.id,
      title: row.title,
      angle: row.angle,
      category: row.category,
      availableTemplates: enabledTemplates,
      embedding: row.embedding ?? undefined,
    })),
    {
      targets: voiceRow.mix_targets as Record<IdeaCandidate['category'], number>,
      actual: Object.fromEntries(
        mixActual.rows.map((r) => [r.category, Number(r.share)]),
      ) as Record<IdeaCandidate['category'], number>,
      productShare14d: Number(productShare.rows[0]?.product_content_share ?? 0),
      postsPerCategory: Object.fromEntries(
        mixActual.rows.map((r) => [r.category, Number(r.published)]),
      ) as Record<IdeaCandidate['category'], number>,
    },
    { recentEmbeddings, limit: Number(job.payload.limit ?? 3) },
  );

  for (const idea of rejected) {
    ctx.log('idea not selected', { id: idea.id, reason: idea.blockedReason });
  }
  if (selected.length === 0) return;

  // ── Accounts to draft for ────────────────────────────────────────────────
  const accounts = await ctx.pool.query<{
    id: string;
    platform: SlopPlatform;
    persona: 'brand' | 'founder';
    supported_formats: string[];
  }>(
    `select id, platform, persona, supported_formats from social_accounts
      where product_id = $1 and capability_state in ('live','draft_only')`,
    [productId],
  );

  if (accounts.rows.length === 0) {
    ctx.log('no connected accounts, nothing to draft', { productId });
    return;
  }

  const connector = createConnector(product);

  for (const idea of selected) {
    let artifact: ProductArtifact | null = null;

    if (connector) {
      try {
        artifact = await connector.generateSample({
          intent: `${idea.title}. ${idea.angle}`,
          params: (job.payload.sampleParams as Record<string, unknown>) ?? {},
        });
      } catch (err) {
        if (err instanceof ConnectorUnavailableError) {
          // Generation pauses. The existing queue is unaffected.
          await notify(
            ctx,
            'connector_down',
            'critical',
            `${product.name} connector unreachable`,
            `${err.message} Generation is paused for this product; the queue is unaffected.`,
          );
          return;
        }
        throw err;
      }
    }

    await ctx.pool.query(`update ideas set status = 'selected' where id = $1`, [idea.id]);

    for (const account of accounts.rows) {
      if (account.persona !== 'brand') continue; // founder posts are composed, not generated

      try {
        // One call per platform. Never one call producing all platforms.
        const draft = await writeDraft(
          {
            platform: account.platform,
            format: account.platform === 'pinterest' ? 'pin' : 'image',
            category: idea.category,
            persona: account.persona,
            idea: { title: idea.title, angle: idea.angle },
            artifact,
            voice: {
              displayName: voiceRow.display_name,
              description: voiceRow.description,
              doRules: voiceRow.do_rules,
              dontRules: voiceRow.dont_rules,
              examples: voiceRow.examples ?? [],
              antiExamples: voiceRow.anti_examples ?? [],
            },
            productBrief: product.brief_summary ?? product.brief_markdown ?? product.name,
            contentRules: {
              forbiddenClaims: product.content_rules?.forbidden_claims,
              bannedPhrases: product.content_rules?.banned_phrases,
            },
          },
          llm,
        );

        const inserted = await ctx.pool.query<{ id: string }>(
          `insert into content_items
             (product_id, idea_id, account_id, platform, persona, format, category,
              body, title, alt_text, hashtags, product_artifact, claims, qc_results,
              ai_components, status, generation_meta)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending_approval',$16)
           returning id`,
          [
            productId,
            idea.id,
            account.id,
            account.platform,
            account.persona,
            account.platform === 'pinterest' ? 'pin' : 'image',
            idea.category,
            draft.body,
            draft.title ?? null,
            draft.altText ?? null,
            draft.hashtags,
            artifact?.raw ?? null,
            JSON.stringify(draft.claims),
            JSON.stringify(draft.qc),
            ['copy'],
            draft.generationMeta,
          ],
        );

        const contentItemId = inserted.rows[0]!.id;

        // Enqueue renders from the artifact, if it supports the template.
        if (artifact) {
          const props = transformationDiffProps(artifact);
          if (props && enabledTemplates.includes('transformation_diff_4x5')) {
            const render = await ctx.pool.query<{ id: string }>(
              `insert into renders (content_item_id, template_id, renderer, input_props, quality)
               values ($1, 'transformation_diff_4x5', 'satori', $2, 'final') returning id`,
              [contentItemId, { ...props, alt_text: draft.altText }],
            );
            await ctx.enqueue('render', { renderId: render.rows[0]!.id }, { priority: 50 });
          }

          if (account.platform === 'instagram' && enabledTemplates.includes('carousel_6')) {
            for (const slide of carouselProps(artifact)) {
              const render = await ctx.pool.query<{ id: string }>(
                `insert into renders (content_item_id, template_id, renderer, input_props, slide_index, quality)
                 values ($1, 'carousel_6', 'satori', $2, $3, 'final') returning id`,
                [contentItemId, slide, slide.index - 1],
              );
              await ctx.enqueue('render', { renderId: render.rows[0]!.id }, { priority: 50 });
            }
          }
        }

        if (draft.hookPattern) {
          await ctx.pool.query(
            `insert into hooks (product_id, pattern, platform, category, source, uses)
             values ($1,$2,$3,$4,'approved_post',1)
             on conflict do nothing`,
            [productId, draft.hookPattern, account.platform, idea.category],
          );
        }

        ctx.log('drafted', { contentItemId, platform: account.platform, attempts: draft.attempts });
      } catch (err) {
        if (err instanceof DraftRejectedError) {
          // Never queued. That is the point of the gates.
          ctx.log('draft rejected by QC, nothing queued', {
            platform: account.platform,
            idea: idea.id,
            attempts: err.attempts,
          });
          continue;
        }
        throw err;
      }
    }

    await ctx.pool.query(`update ideas set status = 'used' where id = $1`, [idea.id]);
  }
}
