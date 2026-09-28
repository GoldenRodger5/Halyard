'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  baselineProductionRequirements,
  baselineQualityBar,
  configuredProductionProviders,
  contentFamilyForCategory,
  defaultAspectRatioForVariant,
  defaultPresentationModeForFormat,
  defaultSubtypeFor,
  defaultTargetSecondsForVariant,
  defaultTreatmentForCategory,
  growthObjectiveForCategory,
  mediaRequiredForFormat,
  planCampaign,
  routeProduction,
  type CampaignKind,
  type PlatformId,
  type ProductionRequirement,
} from '@halyard/core';
import { stageCreativeVariantRecord } from '@halyard/db';
import { fromDatetimeLocalValue } from '@/lib/format';
import { one, pool, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

export async function createCampaign(formData: FormData): Promise<void> {
  await requireOperator();
  const productId = String(formData.get('product') ?? 'recipefix');
  const name = String(formData.get('name') ?? '').trim();
  const kind = String(formData.get('kind') ?? 'launch') as CampaignKind;
  const brief = String(formData.get('brief') ?? '').trim();
  const goal = String(formData.get('goal') ?? '').trim();
  const startsAt = String(formData.get('startsAt') ?? '');
  const days = Math.max(1, Math.min(30, Number(formData.get('days') ?? 5)));
  const ceiling = Math.max(0.15, Math.min(1, Number(formData.get('ceiling') ?? 0.6)));

  if (!name || !startsAt) {
    redirect('/rundown/campaigns?error=' + encodeURIComponent('A campaign needs a name and a start date.'));
  }

  // A date input carries a bare calendar day. `new Date('2026-09-18')` is UTC
  // midnight, which is the previous evening for anyone west of Greenwich, so
  // the campaign would start a day early on its own timeline.
  const product = await one<{ operator_timezone: string }>(
    'select operator_timezone from products where id = $1',
    [productId],
  );
  const timeZone = product?.operator_timezone ?? 'UTC';
  const start = fromDatetimeLocalValue(`${startsAt}T09:00`, timeZone);
  if (!start) {
    redirect('/rundown/campaigns?error=' + encodeURIComponent('That start date could not be read.'));
  }
  const end = new Date(start.getTime() + days * 86_400_000);

  const rows = await query<{ id: string }>(
    `insert into campaigns (product_id, name, kind, brief, goal, starts_at, ends_at,
                            product_mix_ceiling, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'planning')
     returning id`,
    [productId, name, kind, brief || null, goal || null, start, end, ceiling],
  );

  redirect(`/rundown/campaigns/${rows[0]!.id}`);
}

/**
 * Build the timeline. Nothing is generated here.
 *
 * The plan is a set of empty slots with a purpose each, staged as `draft`
 * content items so they can be rearranged, deleted and looked at before a single
 * token is spent writing into them.
 */
export async function planCampaignSlots(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));

  const campaign = await one<{
    id: string;
    product_id: string;
    name: string;
    kind: CampaignKind;
    brief: string | null;
    goal: string | null;
    starts_at: string;
    ends_at: string;
  }>('select * from campaigns where id = $1', [id]);
  if (!campaign) return;

  const accounts = await query<{
    id: string;
    platform: PlatformId;
    persona: 'brand' | 'founder';
    supported_formats: string[] | null;
  }>(
    // The outer parentheses are load-bearing: AND binds tighter than OR, so
    // without them the capability filter applies only to the founder branch and
    // a pending_auth brand account gets a slot it can never publish.
    `select id, platform, persona, supported_formats from social_accounts
      where ((persona = 'brand' and product_id = $1) or persona = 'founder')
        and capability_state <> 'disabled'
        and (access_token_enc is not null or provider_account_id is not null)
      order by (persona = 'brand') desc, platform`,
    [campaign.product_id],
  );

  const plan = planCampaign({
    description: campaign.brief ?? campaign.goal ?? '',
    kind: campaign.kind,
    startsAt: new Date(campaign.starts_at),
    endsAt: new Date(campaign.ends_at),
    goal: campaign.goal ?? undefined,
    now: new Date(),
    platforms: accounts.map((a) => ({
      platform: a.platform,
      persona: a.persona,
      supportedFormats: a.supported_formats ?? [],
    })),
  });

  // Re-planning replaces untouched scaffolding, but first marks its provider
  // recipes obsolete so a deleted draft never leaves a live-looking plan.
  await query(
    `update production_recipes set status='obsolete', updated_at=now()
      where content_item_id in (
        select id from content_items
         where campaign_id=$1 and status='draft' and body=''
      ) and status='planned'`,
    [id],
  );
  await query(
    `delete from content_items
      where campaign_id = $1 and status = 'draft' and body = ''`,
    [id],
  );

  // A written/edited slot survives replanning. Its stable key prevents the
  // planner from staging a second copy beside the preserved work.
  const preserved = await query<{ key: string | null }>(
    `select generation_meta->>'key' as key from content_items
      where campaign_id=$1 and body<>'' and generation_meta->>'key' is not null`,
    [id],
  );
  const preservedKeys = new Set(preserved.map((row) => row.key).filter((key): key is string => Boolean(key)));

  const slotsByConcept = new Map<string, typeof plan.slots>();
  for (const slot of plan.slots) {
    slotsByConcept.set(slot.conceptKey, [
      ...(slotsByConcept.get(slot.conceptKey) ?? []),
      slot,
    ]);
  }
  const configuredProviders = configuredProductionProviders(process.env);

  for (const slot of plan.slots) {
    if (preservedKeys.has(slot.key)) continue;
    const account = accounts.find(
      (a) => a.platform === slot.platform && a.persona === slot.persona,
    );
    if (!account) continue;

    const packageSlots = slotsByConcept.get(slot.conceptKey) ?? [slot];
    const packageRequirements = packageSlots.flatMap((entry) =>
      baselineProductionRequirements(
        entry.format as 'text' | 'image' | 'carousel' | 'video' | 'pin',
        entry.category,
      ),
    );
    // A campaign demo promises visible product behavior, so its package cannot
    // route around real product capture merely because the category is called
    // transformation rather than product.
    if (packageSlots.some((entry) => entry.purpose === 'demo')) {
      packageRequirements.push({
        id: 'campaign-demo-proof',
        capability: 'real_product_capture',
        required: true,
        truthCritical: true,
        subject: 'Real product workflow demonstrated by the campaign.',
      });
    }
    const uniquePackageRequirements = [...new Map(
      packageRequirements.map((requirement) => [`${requirement.id}:${requirement.capability}`, requirement]),
    ).values()];
    const variantRequirements: ProductionRequirement[] = [
      ...baselineProductionRequirements(
        slot.format as 'text' | 'image' | 'carousel' | 'video' | 'pin',
        slot.category,
      ),
      ...(slot.purpose === 'demo'
        ? [{
            id: 'campaign-demo-proof',
            capability: 'real_product_capture' as const,
            required: true,
            truthCritical: true,
            subject: 'Real product workflow demonstrated by the campaign.',
          }]
        : []),
    ];
    const qualityBar = baselineQualityBar(slot.format);
    const packageQuality = [...new Map(
      packageSlots.flatMap((entry) => baselineQualityBar(entry.format)).map((rule) => [rule.id, rule]),
    ).values()];
    const route = routeProduction(variantRequirements, {
      mode: 'calibration',
      configuredProviders,
      costPreference: 'quality_first',
    });
    const purposes = [...new Set(packageSlots.map((entry) => entry.purpose))];
    const platformIntent = [...new Set(packageSlots.map((entry) => entry.platform))];
    const evidenceRequirements = [
      ...(purposes.includes('demo')
        ? [{ kind: 'product_capture', detail: 'Real product footage must prove the demo.' }]
        : []),
      ...(purposes.includes('social_proof')
        ? [{ kind: 'external_source', detail: 'A real stored user quote must resolve before writing.' }]
        : []),
    ];
    const targetSeconds = defaultTargetSecondsForVariant(slot.format);

    await stageCreativeVariantRecord(pool(), {
      package: {
        productId: campaign.product_id,
        originKind: 'campaign',
        originRef: `${campaign.id}:${slot.conceptKey}`,
        family: contentFamilyForCategory(slot.category),
        objective: growthObjectiveForCategory(slot.category),
        title: `${campaign.name} · ${slot.conceptKey.replace(/[_:]/g, ' ')}`,
        premise: campaign.brief ?? campaign.goal ?? `${campaign.name} campaign`,
        audience: null,
        audienceProblem: campaign.brief ?? campaign.goal ?? slot.intent,
        audienceAwareness: 'mixed',
        whyCareBeforeProduct: slot.intent,
        payoff: campaign.goal ?? 'Earn the campaign objective with real evidence and a native execution.',
        storyStructure: {
          source: 'campaign_plan',
          campaignId: campaign.id,
          conceptKey: slot.conceptKey,
          purposes,
        },
        visualTreatment: {},
        audioDirection: {},
        ctaDirection: {
          kind: purposes.some((purpose) => ['launch_announcement', 'launch_support', 'demo'].includes(purpose))
            ? 'product'
            : 'none',
        },
        qualityBar: packageQuality,
        productionRequirements: uniquePackageRequirements,
        platformIntent,
        differentiation: [...new Set(packageSlots.map((entry) => entry.intent))].join(' '),
        evidenceRequirements,
        retentionStrategy: 'Every campaign post must have a distinct job; never repeat the launch announcement in different words.',
        status: 'selected',
      },
      brief: {
        productId: campaign.product_id,
        accountId: account.id,
        platform: slot.platform,
        treatment: defaultTreatmentForCategory(slot.category),
        presentationMode: defaultPresentationModeForFormat(slot.format),
        targetSeconds,
        aspectRatio: defaultAspectRatioForVariant(slot.platform, slot.format),
        beats: [],
        visualDirection: { language: 'unplanned', source: 'creative_package_v1' },
        audioDirection: { narration: 'unplanned', music: 'unplanned' },
        captionDirection: {
          job: slot.intent,
          campaign: campaign.brief ?? campaign.goal ?? campaign.name,
          platform: slot.platform,
        },
        evidence: [],
        rationale: `${slot.purpose}: ${slot.intent}`,
        format: slot.format,
        subtype: defaultSubtypeFor(slot.platform, slot.format),
        hook: null,
        captionBrief: slot.intent,
        productionRequirements: variantRequirements,
        qualityBar,
      },
      content: {
        productId: campaign.product_id,
        campaignId: id,
        accountId: account.id,
        platform: slot.platform,
        persona: slot.persona,
        format: slot.format,
        category: slot.category,
        scheduledAt: slot.scheduledAt,
        generationMeta: {
          source: 'campaign_plan',
          production_v2: true,
          production_media_required: mediaRequiredForFormat(slot.format),
          purpose: slot.purpose,
          intent: slot.intent,
          key: slot.key,
          concept_key: slot.conceptKey,
        },
      },
      variant: {
        aspectRatio: defaultAspectRatioForVariant(slot.platform, slot.format),
        targetSeconds,
        pacing: slot.format === 'video' ? 'fast' : 'measured',
        textDensity: slot.format === 'video' ? 'sparse' : slot.format === 'carousel' ? 'medium' : 'native',
        hookTreatment: 'native_hook_pending',
        cta: slot.category === 'community' ? 'conversation' : 'campaign_native',
        audioTreatment: slot.format === 'video' ? 'planned_later' : 'none',
        decision: 'produce',
        decisionReason: `${slot.purpose}: ${slot.intent}`,
      },
      recipe: {
        mode: 'calibration',
        status: route.ready ? 'planned' : 'failed',
        requirements: variantRequirements,
        steps: route.steps,
        refusals: route.refusals,
        reasons: route.reasons,
        humanReviewRequired: true,
      },
    });
  }

  await query(`update campaigns set status = 'staged' where id = $1`, [id]);
  revalidatePath(`/rundown/campaigns/${id}`);
}

/** Move one slot, before anything is generated into it. */
export async function moveSlot(formData: FormData): Promise<void> {
  await requireOperator();
  const itemId = String(formData.get('itemId'));
  const campaignId = String(formData.get('campaignId'));
  const scheduledAt = String(formData.get('scheduledAt') ?? '');
  // The input carries wall time with no zone. Reading it as the server's local
  // time — which on Vercel is UTC — moves every slot by the offset.
  const timeZone = String(formData.get('timeZone') || 'UTC');
  if (!scheduledAt) return;

  const target = fromDatetimeLocalValue(scheduledAt, timeZone);
  if (!target) return;

  await query(`update content_items set scheduled_at = $2 where id = $1`, [itemId, target]);
  revalidatePath(`/rundown/campaigns/${campaignId}`);
}

export async function removeSlot(formData: FormData): Promise<void> {
  await requireOperator();
  const itemId = String(formData.get('itemId'));
  const campaignId = String(formData.get('campaignId'));

  // Only an empty slot can be removed this way. Deleting written copy from a
  // timeline view would be a surprising amount of damage for one click.
  await query(`delete from content_items where id = $1 and status = 'draft' and body = ''`, [
    itemId,
  ]);
  revalidatePath(`/rundown/campaigns/${campaignId}`);
}

/** Hand the staged slots to the generator. */
export async function generateCampaign(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));

  const campaign = await one<{ product_id: string }>(
    'select product_id from campaigns where id = $1',
    [id],
  );
  if (!campaign) return;

  const slots = await query<{
    id: string;
    concept_id: string | null;
    account_id: string | null;
    platform: string;
  }>(
    `select id,concept_id,account_id,platform from content_items
      where campaign_id = $1 and status = 'draft' and body = ''`,
    [id],
  );

  for (const slot of slots) {
    if (!slot.concept_id || !slot.account_id) continue;
    await query(
      `insert into jobs (kind, payload, priority, dedupe_key)
       values ('generate', $1, 30, $2)
       on conflict do nothing`,
      [
        {
          productId: campaign.product_id,
          targetContentItemId: slot.id,
          calibration: true,
          conceptId: slot.concept_id,
          onlyPlatform: slot.platform,
          onlyAccountId: slot.account_id,
        },
        `campaign_generate:${slot.id}`,
      ],
    );
  }

  await query(`update campaigns set status = 'running' where id = $1`, [id]);
  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'campaign_generate', 'campaign', $1, $2)`,
    [id, { slots: slots.length }],
  );

  revalidatePath(`/rundown/campaigns/${id}`);
}

/**
 * The prominent pause control on the launch-day view.
 *
 * This pauses the campaign, not the system. The global kill switch on /settings
 * is a different, larger action, and conflating them means the operator either
 * over-reacts or hesitates.
 */
export async function pauseCampaign(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));

  await query(`update campaigns set status = 'planning' where id = $1`, [id]);
  const held = await query<{ id: string }>(
    `update content_items set status = 'draft'
      where campaign_id = $1 and status in ('approved', 'scheduled')
      returning id`,
    [id],
  );

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'campaign_paused', 'campaign', $1, $2)`,
    [id, { heldBack: held.length }],
  );

  revalidatePath(`/rundown/campaigns/${id}`);
}

export async function completeCampaign(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  await query(`update campaigns set status = 'complete' where id = $1`, [id]);
  revalidatePath(`/rundown/campaigns/${id}`);
}
