'use server';

import { revalidatePath } from 'next/cache';
import { query, one } from '@/lib/db';
import { fromDatetimeLocalValue } from '@/lib/format';
import { requireOperator } from '@/lib/auth';
import { slopFilter, type SlopPlatform } from '@halyard/core';

async function audit(action: string, entityId: string, detail: Record<string, unknown>) {
  const operator = await requireOperator();
  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', $1, 'content_item', $2, $3)`,
    [action, entityId, { ...detail, operator: operator.email }],
  );
}

/**
 * Approve. v1 §8 — every human approve/edit/reject is written to audit_log.
 * Approval schedules a publish job; it does not publish inline, because publish
 * belongs to the worker and its idempotency guard.
 */
export async function approveItem(formData: FormData): Promise<void> {
  const id = String(formData.get('id'));
  const item = await one<{ status: string; scheduled_at: string | null }>(
    'select status, scheduled_at from content_items where id = $1',
    [id],
  );
  if (!item) return;

  await query(
    `update content_items
        set status = 'approved', approved_at = now()
      where id = $1 and status in ('pending_approval','failed')`,
    [id],
  );
  await audit('approve', id, { previousStatus: item.status });

  // If it is already due, hand it straight to the worker.
  if (item.scheduled_at && new Date(item.scheduled_at) <= new Date()) {
    await query(
      `insert into jobs (kind, payload, priority, dedupe_key)
       values ('publish', $1, 10, $2) on conflict do nothing`,
      [{ contentItemId: id }, `publish:${id}`],
    );
  }

  revalidatePath('/queue');
  revalidatePath('/');
}

/** Reject. The reason is the point — it feeds the copywriter's anti-examples. */
export async function rejectItem(formData: FormData): Promise<void> {
  const id = String(formData.get('id'));
  const reason = String(formData.get('reason') ?? '').trim();

  await query(`update content_items set status = 'rejected', reject_reason = $2 where id = $1`, [
    id,
    reason || null,
  ]);
  await audit('reject', id, { reason });

  if (reason) {
    // Feed the rejection back into the voice as a negative example, so the same
    // draft is not produced again tomorrow.
    const item = await one<{ product_id: string; persona: string; body: string }>(
      'select product_id, persona, body from content_items where id = $1',
      [id],
    );
    if (item) {
      await query(
        `update brand_voices
            set anti_examples = anti_examples || $3::jsonb
          where product_id = $1 and persona = $2`,
        [item.product_id, item.persona, JSON.stringify([{ text: item.body, why_bad: reason }])],
      );
    }
  }

  revalidatePath('/queue');
}

/**
 * Inline edit. Preserves original_body so the difference between what the model
 * wrote and what the operator sent is available for learning (v1 §8).
 */
export async function editItem(formData: FormData): Promise<void> {
  const id = String(formData.get('id'));
  const body = String(formData.get('body') ?? '');

  const item = await one<{
    body: string;
    original_body: string | null;
    platform: string;
    hashtags: string[];
  }>('select body, original_body, platform, hashtags from content_items where id = $1', [id]);
  if (!item) return;

  // The slop filter runs on operator edits too. It never blocks a human, but a
  // flagged edit is worth knowing about.
  const lint = slopFilter({
    body,
    platform: item.platform as SlopPlatform,
    hashtags: item.hashtags ?? [],
  });

  await query(
    `update content_items
        set body = $2,
            original_body = coalesce(original_body, $3),
            edited_by_human = true,
            qc_results = jsonb_set(coalesce(qc_results, '{}'::jsonb), '{human_edit_lint}', $4::jsonb)
      where id = $1`,
    [id, body, item.original_body ?? item.body, JSON.stringify({ passed: lint.passed, violations: lint.violations })],
  );
  await audit('edit', id, { flags: lint.violations.length });

  revalidatePath('/queue');
  revalidatePath(`/queue/${id}`);
}

/** Regenerate with a note. Blind retry is a wasted call (v1 §8). */
export async function regenerateItem(formData: FormData): Promise<void> {
  const id = String(formData.get('id'));
  const note = String(formData.get('note') ?? '').trim();

  await query(
    `update content_items
        set status = 'draft', regen_notes = array_append(regen_notes, $2)
      where id = $1`,
    [id, note || 'no note given'],
  );
  await query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ('generate', $1, 40, $2) on conflict do nothing`,
    [{ regenerateContentItemId: id, note }, `regen:${id}`],
  );
  await audit('regenerate', id, { note });

  revalidatePath('/queue');
}

/** Reschedule from the queue card dropdown. */
export async function rescheduleItem(formData: FormData): Promise<void> {
  const id = String(formData.get('id'));
  const when = String(formData.get('when'));

  const item = await one<{ product_id: string; platform: string }>(
    'select product_id, platform from content_items where id = $1',
    [id],
  );
  if (!item) return;

  let target: Date | null;
  if (when === 'next_slot') {
    const slot = await one<{ next_start: string }>(
      `select (date_trunc('day', now() at time zone p.audience_timezone) + s.window_start)
                at time zone p.audience_timezone as next_start
         from slots s join products p on p.id = s.product_id
        where s.product_id = $1 and s.platform = $2 and s.enabled
          and (date_trunc('day', now() at time zone p.audience_timezone) + s.window_start)
                at time zone p.audience_timezone > now()
        order by next_start limit 1`,
      [item.product_id, item.platform],
    );
    target = slot ? new Date(slot.next_start) : new Date(Date.now() + 3_600_000);
  } else if (when === 'custom') {
    const custom = String(formData.get('custom_at') ?? '');
    // Same trap as the campaign timeline: a datetime-local value is wall time
    // with no zone, and reading it as the server's local time is wrong wherever
    // the server is not the operator.
    const zone = await one<{ operator_timezone: string }>(
      'select operator_timezone from products where id = $1',
      [item.product_id],
    );
    target = custom ? fromDatetimeLocalValue(custom, zone?.operator_timezone ?? 'UTC') : null;
  } else {
    target = new Date(when);
  }

  if (!target || Number.isNaN(target.getTime())) return;

  await query('update content_items set scheduled_at = $2 where id = $1', [id, target]);
  await audit('reschedule', id, { to: target.toISOString() });
  revalidatePath('/queue');
  revalidatePath('/calendar');
}

/** Retry a failed render (build pack §3). */
export async function retryRender(formData: FormData): Promise<void> {
  const id = String(formData.get('id'));
  const renders = await query<{ id: string }>(
    `update renders set status = 'queued', error = null
      where content_item_id = $1 and status = 'failed' returning id`,
    [id],
  );
  for (const render of renders) {
    await query(
      `insert into jobs (kind, payload, priority, dedupe_key) values ('render', $1, 50, $2)
       on conflict do nothing`,
      [{ renderId: render.id }, `render:${render.id}`],
    );
  }
  await query(`update content_items set status = 'pending_approval' where id = $1`, [id]);
  await audit('retry_render', id, { renders: renders.length });
  revalidatePath('/queue');
}
