/**
 * Filling one campaign slot. Milestone 44.
 *
 * The planner produces the shape of a launch sequence as empty slots, each with
 * a purpose. This writes into one of them. It is a separate path from daily
 * generation because the inputs are different: daily generation picks what to
 * post from the mix, while a campaign slot has already been told what it is for
 * and only needs the words.
 *
 * The slot's intent goes to the copywriter as a constraint, which is what stops
 * a five-day launch turning into five variations of "we launched".
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

interface SlotRow {
  id: string;
  product_id: string;
  campaign_id: string;
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
    `select id, product_id, campaign_id, platform, persona, format, category, body,
            generation_meta
       from content_items where id = $1`,
    [contentItemId],
  );
  const slot = slotRows[0];
  if (!slot) return;

  // Already written, by a previous run or by hand. Never overwrite.
  if (slot.body !== '') {
    ctx.log('campaign slot already written, skipping', { contentItemId });
    return;
  }

  const { rows: campaignRows } = await ctx.pool.query<{
    name: string;
    kind: string;
    brief: string | null;
    goal: string | null;
  }>('select name, kind, brief, goal from campaigns where id = $1', [slot.campaign_id]);
  const campaign = campaignRows[0];
  if (!campaign) return;

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
        intent: `${campaign.name}: ${slot.generation_meta?.intent ?? campaign.brief ?? ''}`,
        params: {},
      });
    } catch (err) {
      if (err instanceof ConnectorUnavailableError) {
        await notify(
          ctx,
          'connector_down',
          'critical',
          `${product.name} connector unreachable`,
          `${err.message} The campaign slot was left empty rather than written without real product output.`,
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
        title: `${campaign.name} — ${(slot.generation_meta?.purpose ?? 'post').replace(/_/g, ' ')}`,
        // The slot's purpose is the constraint. Without it every post in the
        // sequence regresses to the same announcement.
        angle: [
          slot.generation_meta?.intent,
          campaign.brief ? `The campaign: ${campaign.brief}` : null,
          campaign.goal ? `The goal: ${campaign.goal}` : null,
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
    },
  });

  await ctx.pool.query(
    `update content_items
        set body = $2, title = $3, alt_text = $4, hashtags = $5,
            product_artifact = $6, claims = $7, qc_results = $8,
            ai_components = array['copy'], generation_meta = generation_meta || $9::jsonb,
            destination_type = $10, destination_url = $11, destination_reason = $12,
            status = $13
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
    ],
  );

  ctx.log('campaign slot written', {
    contentItemId,
    purpose: slot.generation_meta?.purpose,
    qcPassed: qc.passed,
  });
}
