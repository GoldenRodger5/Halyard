'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  addLocalCalendarDays,
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
  localDateString,
  planLaunchBatch,
  routeProduction,
  type LaunchBatchPlan,
  type PlatformId,
  type SlotWindow,
} from '@halyard/core';
import { stageCreativeVariantRecord } from '@halyard/db';
import { one, pool, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

const LAUNCH_SOURCE = 'launch_batch';

interface AccountRow {
  id: string;
  platform: PlatformId;
  persona: 'brand' | 'founder';
  supported_formats: string[] | null;
}

/**
 * Everything the planner needs, read from the database. Milestone 51.
 *
 * Exported because the page renders a preview from exactly the same inputs the
 * commit uses. A preview computed differently from the thing it previews is
 * worse than no preview.
 */
export async function buildLaunchPlan(
  productId: string,
  days: number,
  requestedStartDate?: string,
): Promise<{ plan: LaunchBatchPlan; accounts: AccountRow[]; startDate: string; timeZone: string }> {
  // A server action is a public POST endpoint, whatever its signature. The
  // `(dashboard)` layout guards rendering and never runs for an invocation.
  await requireOperator();

  const product = await one<{ audience_timezone: string }>(
    'select audience_timezone from products where id = $1',
    [productId],
  );
  const timeZone = product?.audience_timezone ?? 'UTC';
  const now = new Date();
  let startDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedStartDate ?? '')
    ? requestedStartDate!
    : localDateString(now, timeZone);

  const accounts = await query<AccountRow>(
    /*
     * Plan against an identity Halyard can actually reach, not the state of one
     * transport. A Blotato-mapped Threads account can carry a draft even while
     * the bespoke Threads OAuth row is `pending_auth`; conversely, a row marked
     * `live` with neither a direct credential nor a provider mapping is not a
     * usable identity and must not consume launch slots.
     *
     * Publication remains separately fail-closed. This query only decides what
     * content is worth preparing for review.
     */
    `select id, platform, persona, supported_formats from social_accounts
      where ((persona = 'brand' and product_id = $1) or persona = 'founder')
        and capability_state <> 'disabled'
        and (access_token_enc is not null or provider_account_id is not null)
      order by (persona = 'brand') desc, platform`,
    [productId],
  );

  const slotRows = await query<{
    platform: string;
    name: string;
    window_start: string;
    window_end: string;
    weekdays: number[] | null;
  }>(
    `select platform, name, window_start, window_end, weekdays
       from slots where product_id = $1 and enabled
       order by platform, window_start`,
    [productId],
  );

  const slots: Record<string, SlotWindow[]> = {};
  for (const row of slotRows) {
    (slots[row.platform] ??= []).push({
      name: row.name,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      weekdays: row.weekdays ?? undefined,
    });
  }

  const voice = await one<{ mix_targets: Record<string, number> | null }>(
    `select mix_targets from brand_voices where product_id = $1 and persona = 'brand'`,
    [productId],
  );

  /**
   * Anything already on the calendar in the window, so the batch works around it
   * rather than double-booking a day that already has posts.
   *
   * A previous batch's *untouched* slots are excluded, because replanning
   * deletes them moments later. Counting them would make the plan collide with
   * the thing it is replacing: the second run would see a full fortnight,
   * defer almost every candidate, and stage five posts where there had been
   * forty-two. An edited draft is not excluded — that one survives a replan, so
   * the new plan genuinely has to work around it.
   */
  const existing = await query<{
    id: string;
    platform: string;
    persona: 'brand' | 'founder';
    scheduled_at: string;
  }>(
    `select id, platform, persona, scheduled_at from content_items
      where product_id = $1 and scheduled_at is not null
        and status not in ('rejected', 'failed')
        and not (body = '' and status = 'draft' and generation_meta->>'source' = $3)
        and scheduled_at between now() and now() + ($2 || ' days')::interval`,
    [productId, String(days + 1), LAUNCH_SOURCE],
  );

  const launchBrief = () => ({
    startDate,
    days,
    audienceTimeZone: timeZone,
    accounts: accounts.map((account) => ({
      id: account.id,
      platform: account.platform,
      persona: account.persona,
      supportedFormats: account.supported_formats ?? [],
    })),
    slots,
    mixTargets: voice?.mix_targets ?? {},
    existing: existing.map((row) => ({
      id: row.id,
      platform: row.platform,
      persona: row.persona,
      ideaId: null,
      scheduledAt: new Date(row.scheduled_at),
    })),
  });

  let plan = planLaunchBatch(launchBrief());
  const notBefore = now.getTime() + 60 * 60 * 1000;
  // An opening run is a coordinated first impression. If even one of today's
  // day-one placements is already behind us (or leaves <1h to generate/review),
  // move the whole run forward rather than launching half the accounts today
  // and introducing the rest tomorrow. Bounded for malformed slot calendars.
  for (let attempts = 0; attempts < 7; attempts += 1) {
    const placed = plan.slots.filter((slot) => !slot.deferred && slot.scheduledAt);
    const hasTooSoon = placed.some((slot) => slot.scheduledAt!.getTime() < notBefore);
    if (!hasTooSoon) break;
    startDate = addLocalCalendarDays(startDate, 1, timeZone);
    plan = planLaunchBatch(launchBrief());
  }

  return { plan, accounts, startDate, timeZone };
}

/**
 * Stage the batch, then queue the writing.
 *
 * The same two-step campaigns use: rows first with empty bodies, then one
 * generate job per row. Staging first means the operator sees the whole
 * fortnight on the calendar immediately, and a generation failure costs one
 * slot rather than the batch.
 *
 * Re-planning deletes only slots nobody has touched. A draft that has been
 * edited is not scaffolding.
 */
export async function generateLaunchBatch(formData: FormData): Promise<void> {
  await requireOperator();
  /*
   * §574. `productId`, which is what the form has always sent.
   *
   * This read `product`, so it always got an empty string: `buildLaunchPlan('')`
   * finds no accounts, nothing can be placed, and the action redirects with an
   * error the page does not render. The button therefore did nothing at all,
   * silently, for as long as the two names have disagreed — and the E2E test
   * that would have caught it was waiting for a sentence on a screen that had
   * been rebuilt, so it failed for the wrong reason first.
   */
  const productId = String(formData.get('productId') ?? formData.get('product') ?? '');
  const days = Math.min(28, Math.max(1, Number(formData.get('days') ?? 14)));
  const startDate = String(formData.get('startDate') ?? '').trim() || undefined;

  const { plan, accounts, startDate: resolvedStartDate } = await buildLaunchPlan(productId, days, startDate);
  const placed = plan.slots.filter((slot) => !slot.deferred && slot.scheduledAt);

  if (placed.length === 0) {
    redirect(
      '/rundown/launch?error=' +
        encodeURIComponent(
          plan.warnings[0] ??
            'Nothing could be scheduled. Connect an account on /accounts first.',
        ),
    );
  }

  await query(
    `delete from content_items
      where product_id = $1 and body = '' and status = 'draft'
        and generation_meta->>'source' = $2`,
    [productId, LAUNCH_SOURCE],
  );

  /*
   * CreativePackage v1 is persisted on the creative model Halyard already had:
   * concept = package core, creative_brief = one account/platform execution,
   * platform_variant = the delivery-shaped variant. The transaction below is
   * shared with Campaigns/future entry points, so partial lineage cannot survive
   * a failed insert.
   */
  const slotsByConcept = new Map<string, typeof placed>();
  for (const slot of placed) {
    slotsByConcept.set(slot.conceptKey, [
      ...(slotsByConcept.get(slot.conceptKey) ?? []),
      slot,
    ]);
  }

  const staged: string[] = [];
  const configuredProviders = configuredProductionProviders(process.env);
  for (const slot of placed) {
    const account = accounts.find((a) => a.id === slot.accountId);
    if (!account) continue;

    const packageSlots = slotsByConcept.get(slot.conceptKey) ?? [slot];
    const platformIntent = [...new Set(packageSlots.map((entry) => entry.platform))];
    const packageRequirements = packageSlots.flatMap((entry) =>
      baselineProductionRequirements(
        entry.format as 'text' | 'image' | 'carousel' | 'video' | 'pin' | 'story',
        entry.category,
      ),
    );
    const uniquePackageRequirements = [...new Map(
      packageRequirements.map((requirement) => [
        `${requirement.id}:${requirement.capability}`,
        requirement,
      ]),
    ).values()];
    const packageQuality = [...new Map(
      packageSlots
        .flatMap((entry) => baselineQualityBar(entry.format))
        .map((requirement) => [requirement.id, requirement]),
    ).values()];

    const variantRequirements = baselineProductionRequirements(
      slot.format as 'text' | 'image' | 'carousel' | 'video' | 'pin' | 'story',
      slot.category,
    );
    const qualityBar = baselineQualityBar(slot.format);
    const targetSeconds = defaultTargetSecondsForVariant(slot.format);
    const route = routeProduction(variantRequirements, {
      mode: 'calibration',
      configuredProviders,
      costPreference: 'quality_first',
    });

    const stagedVariant = await stageCreativeVariantRecord(pool(), {
      package: {
        productId,
        originKind: 'launch',
        // Same launch date can be replanned idempotently; a future opening run
        // gets new lineage instead of overwriting the old creative/performance.
        originRef: `${resolvedStartDate}:${slot.conceptKey}`,
        family: contentFamilyForCategory(slot.category),
        objective: growthObjectiveForCategory(slot.category),
        title:
          slot.purpose === 'introduction'
            ? `Account introduction · ${slot.persona}`
            : `${slot.category.replace(/_/g, ' ')} · ${slot.conceptKey}`,
        premise: slot.conceptIntent,
        audience: null,
        audienceProblem: slot.conceptIntent,
        audienceAwareness: 'mixed',
        whyCareBeforeProduct: slot.conceptIntent,
        payoff: 'Deliver the useful/provable value promised by the concept before asking for action.',
        storyStructure: {
          source: LAUNCH_SOURCE,
          purpose: slot.purpose,
          conceptKey: slot.conceptKey,
        },
        visualTreatment: {},
        audioDirection: {},
        ctaDirection: { kind: slot.category === 'community' ? 'conversation' : 'none' },
        qualityBar: packageQuality,
        productionRequirements: uniquePackageRequirements,
        platformIntent,
        differentiation: slot.conceptIntent,
        evidenceRequirements: [],
        retentionStrategy: 'Earn the next beat with specificity, movement or useful information; no filler intro.',
        status: 'selected',
      },
      brief: {
        productId,
        accountId: account.id,
        platform: slot.platform,
        treatment: defaultTreatmentForCategory(slot.category),
        presentationMode: defaultPresentationModeForFormat(slot.format),
        targetSeconds,
        aspectRatio: defaultAspectRatioForVariant(slot.platform, slot.format),
        beats: [],
        visualDirection: { language: 'unplanned', source: 'creative_package_v1' },
        audioDirection: { narration: 'unplanned', music: 'unplanned' },
        captionDirection: { job: slot.conceptIntent, platform: slot.platform },
        evidence: [],
        rationale: slot.reason,
        format: slot.format,
        subtype: defaultSubtypeFor(slot.platform, slot.format),
        hook: null,
        captionBrief: slot.conceptIntent,
        productionRequirements: variantRequirements,
        qualityBar,
      },
      content: {
        productId,
        accountId: account.id,
        platform: slot.platform,
        persona: slot.persona,
        format: slot.format,
        category: slot.category,
        scheduledAt: slot.scheduledAt,
        generationMeta: {
          source: LAUNCH_SOURCE,
          production_v2: true,
          production_media_required: mediaRequiredForFormat(slot.format),
          purpose: slot.purpose,
          key: slot.key,
          concept_key: slot.conceptKey,
          slot_name: slot.slotName,
          reason: slot.reason,
          intent: slot.conceptIntent,
        },
      },
      variant: {
        aspectRatio: defaultAspectRatioForVariant(slot.platform, slot.format),
        targetSeconds,
        pacing: slot.format === 'video' ? 'fast' : 'measured',
        textDensity: slot.format === 'video' ? 'sparse' : slot.format === 'carousel' ? 'medium' : 'native',
        hookTreatment: 'native_hook_pending',
        cta: slot.category === 'community' ? 'conversation' : 'none',
        audioTreatment: slot.format === 'video' ? 'planned_later' : 'none',
        decision: 'produce',
        decisionReason: `Launch package ${slot.conceptKey}; native ${slot.platform} finish.`,
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
    staged.push(stagedVariant.contentItemId);
  }

  // One job per slot, deduped, exactly as campaigns do it. A dedupe key means
  // clicking twice does not write the fortnight twice.
  for (const contentItemId of staged) {
    await query(
      // Bare `on conflict do nothing` on purpose: the dedupe index is partial
      // (`dedupe_key is not null and status in ('queued','running')`), so
      // naming the column would need the predicate repeated exactly to infer
      // it. Getting that subtly wrong raises at runtime, and there is only one
      // unique constraint that this insert can hit.
      `insert into jobs (kind, payload, priority, dedupe_key)
       values ('generate', $1, 30, $2)
       on conflict do nothing`,
      [{ productId, contentItemId }, `launch_generate:${contentItemId}`],
    );
  }

  /*
   * §574. The product id goes in `detail`, because `entity_id` is a uuid.
   *
   * This wrote `productId` — `recipefix` — into a `uuid` column, so the whole
   * action raised `invalid input syntax for type uuid` after staging every row.
   * It had never run: the name mismatch above meant nothing ever reached this
   * line. Two defects in one dead path, and the second only became visible once
   * the first was fixed.
   */
  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'launch_batch_generated', 'product', null, $1)`,
    [{ productId, days, staged: staged.length, warnings: plan.warnings }],
  );

  revalidatePath('/rundown/launch');
  revalidatePath('/rundown');
  revalidatePath('/gallery');
}

/** Throw away a staged batch nobody has started reviewing. */
export async function discardLaunchBatch(formData: FormData): Promise<void> {
  await requireOperator();
  /*
   * §574. `productId`, which is what the form has always sent.
   *
   * This read `product` too, so it always got an empty string — and the delete
   * below then matched no row, which is a quieter failure than its sibling's:
   * Discard reported success and threw nothing away.
   */
  const productId = String(formData.get('productId') ?? formData.get('product') ?? '');

  await query(
    `delete from content_items
      where product_id = $1 and status = 'draft'
        and generation_meta->>'source' = $2`,
    [productId, LAUNCH_SOURCE],
  );

  revalidatePath('/rundown/launch');
  revalidatePath('/rundown');
}
