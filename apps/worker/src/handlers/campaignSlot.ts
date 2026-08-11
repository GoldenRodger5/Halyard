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
  createConnector,
  resolveDestination,
  runAllGates,
  writeDraft,
  type LlmClient,
  type ProductArtifact,
  type ProductDestinations,
  type SlopPlatform,
} from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';
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
  generation_meta: { purpose?: string; intent?: string };
}

export async function fillCampaignSlot(
  job: Job,
  ctx: HandlerContext,
  llm: LlmClient,
): Promise<void> {
  const contentItemId = String(job.payload.contentItemId);

  const { rows: slotRows } = await ctx.pool.query<SlotRow>(
    `select id, product_id, account_id, campaign_id, platform, persona, format, category, body,
            generation_meta
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
      productBrief: product.brief_summary ?? product.brief_markdown ?? product.name,
      contentRules: {
        forbiddenClaims: product.content_rules?.forbidden_claims,
        bannedPhrases: product.content_rules?.banned_phrases,
      },
    },
    llm,
  );

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
      // QC failures never reach the approval queue, here as anywhere else.
      qc.passed ? 'pending_approval' : 'failed',
      board?.boardId ?? null,
      board?.reason ?? null,
    ],
  );

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
