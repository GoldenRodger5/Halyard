/**
 * Filling one staged slot. Milestone 44, generalised in 51.
 *
 * A planner produces the shape of a sequence as empty slots, each with a
 * purpose. This writes into one of them. It is a separate path from daily
 * generation because the inputs are different: daily generation picks what to
 * post from the mix, while a staged slot has already been told what it is for
 * and only needs the words.
 *
 * The slot's intent goes to the copywriter as a constraint, which is what stops
 * a five-day launch turning into five variations of "we launched".
 *
 * **A slot need not belong to a campaign.** Milestone 51's launch batch stages
 * slots with no campaign at all, and this handler used to `return` silently
 * when the campaign lookup came back empty — which would have staged a
 * fortnight and written none of it, with nothing anywhere saying so. The
 * campaign is optional context now; the slot's own intent is what drives it.
 */
import {
  ConnectorUnavailableError,
  configuredProductionProviders,
  createConnector,
  planPackageStory,
  resolveDestination,
  routeProduction,
  runAllGates,
  writeDraft,
  type LlmClient,
  type ProductArtifact,
  type ProductDestinations,
  type SlopPlatform,
} from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';
import { buildProductMarketingContext, verifyClaimsAgainstProductBrain } from '../productContext.js';
import { notify } from './publish.js';
import { routeToBoard } from './boards.js';

interface SlotRow {
  id: string;
  product_id: string;
  account_id: string | null;
  campaign_id: string | null;
  platform: SlopPlatform;
  persona: 'brand' | 'founder';
  format: string;
  category: string;
  body: string;
  generation_meta: {
    purpose?: string;
    intent?: string;
    visual_provider?: string;
    production_v2?: boolean;
    production_media_required?: boolean;
  };
  concept_id: string | null;
  brief_id: string | null;
  production_recipe_id: string | null;
}

export async function fillCampaignSlot(
  job: Job,
  ctx: HandlerContext,
  llm: LlmClient,
): Promise<void> {
  const contentItemId = String(job.payload.contentItemId);

  const { rows: slotRows } = await ctx.pool.query<SlotRow>(
    `select id, product_id, account_id, campaign_id, platform, persona, format, category, body,
            generation_meta, concept_id, brief_id, production_recipe_id
       from content_items where id = $1`,
    [contentItemId],
  );
  const slot = slotRows[0];
  if (!slot) return;

  // Already written, by a previous run or by hand. Never overwrite.
  if (slot.body !== '') {
    ctx.log('slot already written, skipping', { contentItemId });
    return;
  }

  // Null for a launch-batch slot, which belongs to no campaign.
  let campaign: { name: string; kind: string; brief: string | null; goal: string | null } | null =
    null;
  if (slot.campaign_id) {
    const { rows } = await ctx.pool.query<{
      name: string;
      kind: string;
      brief: string | null;
      goal: string | null;
    }>('select name, kind, brief, goal from campaigns where id = $1', [slot.campaign_id]);
    campaign = rows[0] ?? null;
    if (!campaign) {
      // A campaign id that resolves to nothing is a deleted campaign, not a
      // standalone slot. Writing anyway would attach copy to a plan that no
      // longer exists.
      ctx.log('slot references a campaign that no longer exists', {
        contentItemId,
        campaignId: slot.campaign_id,
      });
      return;
    }
  }

  /**
   * What this post is about, when it is not a campaign slot.
   *
   * A launch-batch introduction carries its own intent. A regular launch slot
   * carries only a category, so it takes a proposed idea of that category the
   * same way daily generation does — the idea engine stays in the loop rather
   * than being bypassed by a second, dumber path.
   */
  let idea: { id: string; title: string; angle: string } | null = null;
  if (!campaign && !slot.generation_meta?.intent) {
    const { rows } = await ctx.pool.query<{ id: string; title: string; angle: string }>(
      `select id, title, angle from ideas
        where product_id = $1 and category = $2 and status = 'proposed'
        order by created_at limit 1`,
      [slot.product_id, slot.category],
    );
    idea = rows[0] ?? null;
  }

  const { rows: productRows } = await ctx.pool.query<{
    id: string;
    name: string;
    brief_summary: string | null;
    brief_markdown: string | null;
    content_rules: { forbidden_claims?: string[]; banned_phrases?: string[] };
    connector_type: 'mcp' | 'rest' | 'none';
    connector_config: Record<string, unknown>;
    destinations: ProductDestinations;
  }>('select * from products where id = $1', [slot.product_id]);
  const product = productRows[0];
  if (!product) return;
  const productContext = await buildProductMarketingContext(
    ctx.pool,
    slot.product_id,
    product.brief_summary ?? product.brief_markdown,
  );

  const { rows: voiceRows } = await ctx.pool.query<{
    display_name: string;
    description: string;
    do_rules: string[];
    dont_rules: string[];
    examples: Array<{ platform?: string; text: string; why_good?: string }> | null;
    anti_examples: Array<{ text: string; why_bad?: string }> | null;
  }>('select * from brand_voices where product_id = $1 and persona = $2', [
    slot.product_id,
    slot.persona,
  ]);
  const voice = voiceRows[0];
  if (!voice) throw new Error(`no ${slot.persona} voice configured for ${slot.product_id}`);

  // A demo or transformation slot needs something real to show; the rest do not.
  let artifact: ProductArtifact | null = null;
  const wantsArtifact = slot.category === 'transformation' || slot.category === 'product';
  const connector = createConnector(product);

  if (wantsArtifact && connector) {
    try {
      artifact = await connector.generateSample({
        intent: campaign
          ? `${campaign.name}: ${slot.generation_meta?.intent ?? campaign.brief ?? ''}`
          : (slot.generation_meta?.intent ?? idea?.angle ?? slot.category),
        params: {},
      });
    } catch (err) {
      if (err instanceof ConnectorUnavailableError) {
        await notify(
          ctx,
          'connector_down',
          'critical',
          `${product.name} connector unreachable`,
          `${err.message} The slot was left empty rather than written without real product output.`,
        );
        return;
      }
      throw err;
    }
  }

  const draft = await writeDraft(
    {
      platform: slot.platform,
      format: slot.format as 'image',
      category: slot.category,
      persona: slot.persona,
      idea: {
        title: campaign
          ? `${campaign.name} — ${(slot.generation_meta?.purpose ?? 'post').replace(/_/g, ' ')}`
          : (idea?.title ??
            `${slot.category.replace(/_/g, ' ')} post for ${slot.platform}`),
        // The slot's purpose is the constraint. Without it every post in the
        // sequence regresses to the same announcement.
        angle: [
          slot.generation_meta?.intent,
          campaign?.brief ? `The campaign: ${campaign.brief}` : null,
          campaign?.goal ? `The goal: ${campaign.goal}` : null,
          !campaign ? idea?.angle : null,
        ]
          .filter(Boolean)
          .join(' '),
      },
      artifact,
      voice: {
        displayName: voice.display_name,
        description: voice.description,
        doRules: voice.do_rules,
        dontRules: voice.dont_rules,
        examples: voice.examples ?? [],
        antiExamples: voice.anti_examples ?? [],
      },
      productBrief: productContext || product.name,
      contentRules: {
        forbiddenClaims: product.content_rules?.forbidden_claims,
        bannedPhrases: product.content_rules?.banned_phrases,
      },
    },
    llm,
  );

  /*
   * CreativePackage v1 write-back. Copy is now real, so the package can move
   * from "a scheduled intent" to an actual creative direction. The bounded
   * story planner names what each beat must do and which media may carry it;
   * ProductionRouter is then re-run against those richer requirements.
   */
  if (slot.generation_meta?.production_v2 && slot.concept_id && slot.brief_id) {
    const opening = draft.body
      .split(/\n+/)[0]
      ?.split(/(?<=[.!?])\s+/)[0]
      ?.trim()
      .slice(0, 240) ?? draft.title ?? slot.generation_meta.intent ?? slot.category;
    const evidence = artifact
      ? [...new Set((artifact.highlights ?? []).map((highlight) => highlight.sourcePath).filter(Boolean))]
      : [];
    const { rows: packageRows } = await ctx.pool.query<{
      family: 'proof_demo' | 'transformation' | 'teach' | 'story_pov' | 'entertainment_social' | 'creator_style' | null;
      premise: string;
      payoff: string | null;
    }>(
      `select family, premise, payoff from concepts where id=$1`,
      [slot.concept_id],
    );
    const pkg = packageRows[0];
    const family = pkg?.family ?? 'teach';
    const mediaFormat = slot.format as 'text' | 'image' | 'carousel' | 'video' | 'pin' | 'story';
    const story = planPackageStory({
      family,
      format: mediaFormat,
      hook: opening,
      premise: pkg?.premise ?? slot.generation_meta.intent ?? slot.category,
      payoff: pkg?.payoff ?? draft.title ?? opening,
      hasProductArtifact: Boolean(artifact),
      requiresProductCapture:
        family === 'proof_demo' || slot.generation_meta?.purpose === 'demo',
      targetSeconds: slot.format === 'video' ? 15 : null,
    });

    await ctx.pool.query(
      `update creative_briefs
          set hook = coalesce($2, hook),
              title_brief = coalesce($3, title_brief),
              evidence = case when cardinality($4::text[]) > 0 then $4::text[] else evidence end,
              beats = $5::jsonb,
              visual_direction = $6::jsonb,
              audio_direction = $7::jsonb,
              production_requirements = $8::jsonb,
              caption_direction = caption_direction || $9::jsonb
        where id = $1`,
      [
        slot.brief_id,
        opening,
        draft.title ?? null,
        evidence,
        JSON.stringify(story.beats),
        JSON.stringify(story.visual),
        JSON.stringify(story.audio),
        JSON.stringify(story.productionRequirements),
        JSON.stringify({
          written: true,
          hookPattern: draft.hookPattern ?? null,
          promptVersion: draft.generationMeta.promptVersion,
        }),
      ],
    );
    await ctx.pool.query(
      `update concepts
          set hook = coalesce(hook, $2),
              story_structure = story_structure || $3::jsonb,
              visual_treatment = $4::jsonb,
              audio_direction = $5::jsonb,
              production_requirements = $6::jsonb,
              evidence_requirements = case
                when cardinality($7::text[]) > 0
                then jsonb_build_array(jsonb_build_object(
                  'kind','product_artifact',
                  'detail','Real product artifact paths attached to the platform brief.'
                ))
                else evidence_requirements
              end,
              updated_at = now()
        where id = $1`,
      [
        slot.concept_id,
        opening,
        JSON.stringify({ beats: story.beats }),
        JSON.stringify(story.visual),
        JSON.stringify(story.audio),
        JSON.stringify(story.productionRequirements),
        evidence,
      ],
    );

    if (slot.production_recipe_id) {
      const route = routeProduction(story.productionRequirements, {
        mode: 'calibration',
        configuredProviders: configuredProductionProviders(process.env),
        costPreference: 'quality_first',
      });
      await ctx.pool.query(
        `update production_recipes
            set status=$2,
                requirements=$3::jsonb,
                steps=$4::jsonb,
                refusals=$5::jsonb,
                reasons=$6::jsonb,
                human_review_required=true,
                provider_versions=provider_versions || $7::jsonb,
                updated_at=now()
          where id=$1`,
        [
          slot.production_recipe_id,
          route.ready ? 'planned' : 'failed',
          JSON.stringify(story.productionRequirements),
          JSON.stringify(route.steps),
          JSON.stringify(route.refusals),
          JSON.stringify(route.reasons),
          JSON.stringify({ storyPlanner: 'creative_package_v1' }),
        ],
      );
      await ctx.pool.query(
        `update content_items
            set generation_meta = generation_meta || $2::jsonb
          where id=$1`,
        [
          slot.id,
          JSON.stringify({
            production_story_ready: true,
            production_route_ready: route.ready,
            production_media_required: slot.generation_meta.production_media_required ?? slot.format !== 'text',
          }),
        ],
      );
    }
  }

  const destination = resolveDestination({
    category: slot.category,
    destinations: product.destinations ?? {},
    artifact: artifact ? { raw: artifact.raw } : null,
  });

  // A pin needs a board, and the gate below turns a missing one into a failed
  // draft with a readable reason rather than a publish-time surprise.
  const board =
    slot.platform === 'pinterest' && slot.account_id
      ? await routeToBoard(ctx, slot.account_id, {
          hashtags: draft.hashtags,
          body: draft.body,
          title: draft.title ?? undefined,
          artifact: artifact?.raw,
        })
      : null;

  const qc = runAllGates({
    copy: {
      body: draft.body,
      platform: slot.platform,
      hashtags: draft.hashtags,
      extraBannedPhrases: product.content_rules?.banned_phrases,
      forbiddenClaims: product.content_rules?.forbidden_claims,
    },
    claims: artifact ? { claims: draft.claims, artifact: artifact.raw } : undefined,
    destination: {
      category: slot.category,
      destinationType: destination.type,
      destinationUrl: destination.url,
      webUrl: product.destinations?.web ?? null,
      hasShareToken: Boolean(artifact),
      hasShareTemplate: Boolean(product.destinations?.share_url_template),
      board,
    },
  });

  /*
   * Non-artifact product claims are grounded in the Product Brain rather than
   * silently skipped. The writer cites stable FACT:<category>:<key> tokens;
   * code resolves those tokens to fresh verified rows. Editorial promises are
   * warnings, unresolved/invented fact sources are failures.
   */
  if (!artifact && draft.claims.length > 0) {
    const brainClaims = await verifyClaimsAgainstProductBrain(
      ctx.pool,
      product.id,
      draft.claims,
    );
    const needsReview = brainClaims.checks.some((check) => check.verdict === 'needs_review');
    const claimGate = {
      gate: 'claims' as const,
      status: !brainClaims.passed ? ('failed' as const) : needsReview ? ('warning' as const) : ('passed' as const),
      summary: brainClaims.summary,
      detail: brainClaims,
      examined: brainClaims.checks.length,
    };
    qc.gates = qc.gates.map((gate) => (gate.gate === 'claims' ? claimGate : gate));
    if (!brainClaims.passed) qc.passed = false;
  }

  await ctx.pool.query(
    `update content_items
        set body = $2, title = $3, alt_text = $4, hashtags = $5,
            product_artifact = $6, claims = $7, qc_results = $8,
            ai_components = array['copy'], generation_meta = generation_meta || $9::jsonb,
            destination_type = $10, destination_url = $11, destination_reason = $12,
            status = $13, board_id = $14, board_reason = $15
      where id = $1`,
    [
      slot.id,
      draft.body,
      draft.title ?? null,
      draft.altText ?? null,
      draft.hashtags,
      artifact?.raw ?? null,
      JSON.stringify(draft.claims),
      JSON.stringify(qc),
      JSON.stringify(draft.generationMeta),
      destination.type,
      destination.url,
      destination.blockedBy
        ? `${destination.reason} ${destination.blockedBy}`
        : destination.reason,
      /*
       * Blotato visual generation spends credits. Put the *copy* in Holding so
       * the operator can reject/edit the idea before any paid media call. The
       * Gallery disables final approval until the visual exists and offers the
       * explicit Generate visual action instead.
       */
      qc.passed ? 'pending_approval' : 'failed',
      board?.boardId ?? null,
      board?.reason ?? null,
    ],
  );

  if (qc.passed && slot.generation_meta?.visual_provider === 'blotato') {
    await ctx.pool.query(
      `update content_items
          set generation_meta = generation_meta || $2::jsonb
        where id = $1`,
      [slot.id, JSON.stringify({ visual_status: 'awaiting_operator_approval' })],
    );
  }

  // The idea is consumed only once something was actually written from it.
  if (idea) {
    await ctx.pool.query(`update ideas set status = 'used' where id = $1`, [idea.id]);
  }

  ctx.log('slot written', {
    contentItemId,
    campaignId: slot.campaign_id,
    purpose: slot.generation_meta?.purpose,
    usedIdea: idea?.id ?? null,
    qcPassed: qc.passed,
  });
}
