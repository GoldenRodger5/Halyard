'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { planCampaign, type CampaignKind, type PlatformId } from '@halyard/core';
import { fromDatetimeLocalValue } from '@/lib/format';
import { one, query } from '@/lib/db';
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
    redirect('/campaigns?error=' + encodeURIComponent('A campaign needs a name and a start date.'));
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
    redirect('/campaigns?error=' + encodeURIComponent('That start date could not be read.'));
  }
  const end = new Date(start.getTime() + days * 86_400_000);

  const rows = await query<{ id: string }>(
    `insert into campaigns (product_id, name, kind, brief, goal, starts_at, ends_at,
                            product_mix_ceiling, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'planning')
     returning id`,
    [productId, name, kind, brief || null, goal || null, start, end, ceiling],
  );

  redirect(`/campaigns/${rows[0]!.id}`);
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
  }>(
    // The outer parentheses are load-bearing: AND binds tighter than OR, so
    // without them the capability filter applies only to the founder branch and
    // a pending_auth brand account gets a slot it can never publish.
    `select id, platform, persona from social_accounts
      where ((persona = 'brand' and product_id = $1) or persona = 'founder')
        and capability_state in ('live', 'draft_only')
      order by (persona = 'brand') desc, platform`,
    [campaign.product_id],
  );

  const plan = planCampaign({
    description: campaign.brief ?? campaign.goal ?? '',
    kind: campaign.kind,
    startsAt: new Date(campaign.starts_at),
    endsAt: new Date(campaign.ends_at),
    goal: campaign.goal ?? undefined,
    platforms: accounts.map((a) => ({ platform: a.platform, persona: a.persona })),
  });

  // Re-planning replaces the staged slots but never touches anything already
  // written into: a draft the operator has edited is not scaffolding.
  await query(
    `delete from content_items
      where campaign_id = $1 and status = 'draft' and body = ''`,
    [id],
  );

  for (const slot of plan.slots) {
    const account = accounts.find(
      (a) => a.platform === slot.platform && a.persona === slot.persona,
    );
    if (!account) continue;

    await query(
      `insert into content_items (product_id, campaign_id, account_id, platform, persona,
                                  format, category, body, status, scheduled_at, generation_meta)
       values ($1,$2,$3,$4,$5,$6,$7,'','draft',$8,$9)`,
      [
        campaign.product_id,
        id,
        account.id,
        slot.platform,
        slot.persona,
        slot.format,
        slot.category,
        slot.scheduledAt,
        { source: 'campaign_plan', purpose: slot.purpose, intent: slot.intent, key: slot.key },
      ],
    );
  }

  await query(`update campaigns set status = 'staged' where id = $1`, [id]);
  revalidatePath(`/campaigns/${id}`);
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
  revalidatePath(`/campaigns/${campaignId}`);
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
  revalidatePath(`/campaigns/${campaignId}`);
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

  const slots = await query<{ id: string }>(
    `select id from content_items where campaign_id = $1 and status = 'draft' and body = ''`,
    [id],
  );

  for (const slot of slots) {
    await query(
      `insert into jobs (kind, payload, priority, dedupe_key)
       values ('generate', $1, 30, $2)
       on conflict do nothing`,
      [
        /*
         * §375. No `campaignId`. It was sent and read by nothing:
         * `fillCampaignSlot` dispatches on `contentItemId` and takes the
         * campaign from `slot.campaign_id`, which is the row it is already
         * holding. A second copy in the payload is a promise to the handler
         * that the handler does not keep.
         */
        { productId: campaign.product_id, contentItemId: slot.id },
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

  revalidatePath(`/campaigns/${id}`);
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

  revalidatePath(`/campaigns/${id}`);
}

export async function completeCampaign(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  await query(`update campaigns set status = 'complete' where id = $1`, [id]);
  revalidatePath(`/campaigns/${id}`);
}
