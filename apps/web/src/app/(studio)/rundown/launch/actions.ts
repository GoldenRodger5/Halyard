'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  localDateString,
  planLaunchBatch,
  type LaunchBatchPlan,
  type PlatformId,
  type SlotWindow,
} from '@halyard/core';
import { one, query } from '@/lib/db';
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
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedStartDate ?? '')
    ? requestedStartDate!
    : localDateString(new Date(), timeZone);

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

  const plan = planLaunchBatch({
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

  const { plan, accounts } = await buildLaunchPlan(productId, days, startDate);
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

  const staged: string[] = [];
  for (const slot of placed) {
    const account = accounts.find((a) => a.id === slot.accountId);
    if (!account) continue;

    const row = await one<{ id: string }>(
      `insert into content_items (product_id, account_id, platform, persona,
                                  format, category, body, status, scheduled_at, generation_meta)
       values ($1,$2,$3,$4,$5,$6,'','draft',$7,$8)
       returning id`,
      [
        productId,
        account.id,
        slot.platform,
        slot.persona,
        slot.format,
        slot.category,
        slot.scheduledAt,
        {
          source: LAUNCH_SOURCE,
          purpose: slot.purpose,
          key: slot.key,
          concept_key: slot.conceptKey,
          slot_name: slot.slotName,
          reason: slot.reason,
          ...((['instagram', 'tiktok', 'youtube'].includes(slot.platform) &&
          ['carousel', 'video'].includes(slot.format)) ||
          (slot.platform === 'pinterest' && slot.format === 'pin')
            ? { visual_provider: 'blotato' }
            : {}),
          // Several placements can share this intent. The copywriter still gets
          // the destination platform and format, so reuse means one coordinated
          // idea with native variants — never one caption pasted everywhere.
          intent: slot.conceptIntent,
        },
      ],
    );
    if (row) staged.push(row.id);
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
