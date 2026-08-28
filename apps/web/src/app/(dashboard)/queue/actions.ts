'use server';

import { revalidatePath } from 'next/cache';
import { query, one } from '@/lib/db';
import { fromDatetimeLocalValue } from '@/lib/format';
import { requireOperator } from '@/lib/auth';
import {
  emptyTikTokOptions,
  gatesAfterEdit,
  slopFilter,
  validateTikTokPost,
  type GateResult,
  type SlopPlatform,
} from '@halyard/core';

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
  /**
   * A server action is a public POST endpoint.
   *
   * The `(dashboard)` layout calls `getOperator()` and redirects — but a layout
   * guards *rendering*, and it never runs for an action invocation. Middleware
   * does no auth either. So every action in this file was reachable without an
   * authenticated operator, including the approval gate and the direct publish
   * trigger — the exact boundary §90 and §92 exist to hold, bypassed at the
   * transport layer rather than the logic layer.
   */
  await requireOperator();
  const id = String(formData.get('id'));
  const item = await one<{
    status: string;
    scheduled_at: string | null;
    platform: string;
    tiktok_options: unknown;
    tiktok_creator_info: unknown;
  }>(
    `select status, scheduled_at, platform, tiktok_options, tiktok_creator_info
       from content_items where id = $1`,
    [id],
  );
  if (!item) return;

  /*
   * §179. TikTok cannot be approved on someone's behalf.
   *
   * Every other platform's approval is a single decision: this copy is good, send
   * it. TikTok's Content Posting API additionally requires the *creator* to have
   * chosen visibility, the comment/Duet/Stitch settings, any commercial-content
   * disclosure, and to have given the Music Usage Confirmation.
   *
   * Approval is where scheduling begins, so it is the honest place to stop:
   * letting an incomplete item through would mean the worker either refuses it
   * hours later, out of sight, or supplies the answers itself — which is exactly
   * the behaviour this pass removed.
   */
  if (item.platform === 'tiktok') {
    const problems = validateTikTokPost({
      options: (item.tiktok_options as never) ?? emptyTikTokOptions(),
      creatorInfo: (item.tiktok_creator_info as never) ?? null,
    });
    if (problems.length > 0) {
      await query('update content_items set tiktok_last_error = $2 where id = $1', [
        id,
        `TikTok settings are incomplete: ${problems.map((p) => p.message).join(' ')}`.slice(0, 500),
      ]);
      revalidatePath(`/queue/${id}`);
      return;
    }
  }

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
  await requireOperator();
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
  await requireOperator();
  const id = String(formData.get('id'));
  const body = String(formData.get('body') ?? '');

  const item = await one<{
    body: string;
    original_body: string | null;
    platform: string;
    hashtags: string[];
    status: string;
  }>('select body, original_body, platform, hashtags, status from content_items where id = $1', [
    id,
  ]);
  if (!item) return;

  /**
   * Editing what is already out, or on its way out, changes nothing real.
   *
   * `publishing` means a worker holds the claim; the body it is sending was
   * read before this ran. `published` means the platform has it. In both cases
   * an edit would silently desynchronise Halyard's record from what actually
   * exists, which is worse than refusing.
   */
  if (item.status === 'publishing' || item.status === 'published') return;

  // The slop filter runs on operator edits too. It never blocks a human, but a
  // flagged edit is worth knowing about.
  const lint = slopFilter({
    body,
    platform: item.platform as SlopPlatform,
    hashtags: item.hashtags ?? [],
  });

  /**
   * An edit after approval withdraws the approval.
   *
   * This used to leave `status` alone. So: approve an item, edit the body, and
   * the publish job already sitting in the queue sends text **nobody
   * approved** — the one thing the approval gate exists to prevent, reached
   * without touching the gate.
   *
   * Demoting to `pending_approval` also neutralises the queued job without
   * hunting for it: `publishHandler` returns at
   * `if (!['approved','scheduled','publishing'].includes(item.status))` before
   * any account lookup or network call. So a re-approval is what re-arms it,
   * which is the correct sequence.
   *
   * `scheduled` demotes for the same reason. No new state and no versioning
   * mechanism — the existing status machine already expresses "a human has not
   * signed off on this".
   */
  const withdrawsApproval = item.status === 'approved' || item.status === 'scheduled';

  /**
   * §157. The gates that were about the old text stop claiming to be about
   * this one.
   *
   * `qc_results.gates` is what the queue renders, and an edit left every entry
   * in it untouched — so a human could rewrite the body and the screen would go
   * on showing `copy: passed (0 flags)` and `claims: 2/2 verified against
   * artifact` for words that had never been examined. That is §143 again, with
   * the operator rather than the hook generator doing the rewriting.
   *
   * The two gates are treated differently because only one of them can be
   * settled here. The copy gate is the slop filter, which is deterministic and
   * has already run on the new text a few lines above — so it is *re-run*, not
   * invalidated. The claims gate cannot be: the claims were extracted from the
   * old wording and verified against the artifact, and whether they survive an
   * edit is a question only a re-verification answers. So it is marked
   * unverified, in the operator's own words, rather than left reading green.
   *
   * Gates this action did not touch — visual, audio, coherence, retention —
   * are left exactly as they were. Editing a caption does not un-measure a
   * render.
   */
  const bodyChanged = body.trim() !== item.body.trim();

  await query(
    `update content_items
        set body = $2,
            original_body = coalesce(original_body, $3),
            edited_by_human = true,
            status = case when $5 then 'pending_approval' else status end,
            approved_at = case when $5 then null else approved_at end,
            qc_results = jsonb_set(coalesce(qc_results, '{}'::jsonb), '{human_edit_lint}', $4::jsonb)
      where id = $1`,
    [
      id,
      body,
      item.original_body ?? item.body,
      JSON.stringify({ passed: lint.passed, violations: lint.violations }),
      withdrawsApproval,
    ],
  );

  if (bodyChanged) {
    /*
     * Read, recompute, write. The gate list is small and this action is the
     * only writer of a human edit, so a transaction would be ceremony.
     */
    const current = await one<{ gates: GateResult[] | null }>(
      `select coalesce(qc_results->'gates', '[]'::jsonb) as gates from content_items where id = $1`,
      [id],
    );
    const recomputed = gatesAfterEdit(current?.gates ?? [], lint);

    await query(
      `update content_items
          set qc_results = coalesce(qc_results, '{}'::jsonb)
                           || jsonb_build_object('gates', $2::jsonb, 'passed', $3::boolean)
        where id = $1`,
      [id, JSON.stringify(recomputed.gates), recomputed.passed],
    );
  }

  await audit('edit', id, {
    flags: lint.violations.length,
    // Recorded, because "why did this stop being approved" needs an answer.
    ...(withdrawsApproval ? { withdrewApproval: true, previousStatus: item.status } : {}),
  });

  revalidatePath('/queue');
  revalidatePath(`/queue/${id}`);
}

/** Regenerate with a note. Blind retry is a wasted call (v1 §8). */
export async function regenerateItem(formData: FormData): Promise<void> {
  await requireOperator();
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
  await requireOperator();
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
  await requireOperator();
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

/**
 * Post it now, rather than at the slot it was scheduled for.
 *
 * Approval and posting were the same decision: `approveItem` enqueues a publish
 * job only if the slot has already passed, so approving something scheduled for
 * Thursday means waiting until Thursday with no way to say "actually, now".
 *
 * They are different decisions. Approving says the post is good; posting says
 * it should go out. Keeping them separate is what makes the queue reviewable in
 * one sitting and postable on your own timing.
 *
 * The job is still the worker's to run — this does not publish inline. The
 * publish handler owns the idempotency guard, the kill switch and the
 * cross-product routing check, and a second path around it would be a second
 * path around all three.
 */
export async function publishNow(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const item = await one<{ status: string }>('select status from content_items where id = $1', [id]);
  if (!item) return;

  // Only from a state a human has already blessed. Publishing straight from
  // `pending_approval` would route around the review this whole screen is for.
  if (!['approved', 'scheduled'].includes(item.status)) return;

  await query(
    `update content_items set scheduled_at = now(), status = 'approved' where id = $1`,
    [id],
  );
  await query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ('publish', $1, 5, $2) on conflict do nothing`,
    [{ contentItemId: id }, `publish:${id}`],
  );
  await audit('publish_now', id, { previousStatus: item.status });

  revalidatePath('/queue');
  revalidatePath(`/queue/${id}`);
}

/**
 * Record a post that was made by hand.
 *
 * Some accounts have no API path at all — Facebook has no adapter here, and any
 * account whose platform review has not landed sits in `draft_only`. Those
 * items are handed over rather than failed, and this is where they come back.
 *
 * The URL is required and is not decoration: without it there is no way to
 * collect metrics for the post, no way to verify it actually went out, and the
 * item would claim `published` on nothing but an assertion. That is the same
 * shape as every "it looked done" bug in this codebase, so it is refused.
 */
export async function markManuallyPublished(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const url = String(formData.get('url') ?? '').trim();

  if (!url) throw new Error('The URL of the post is required. Without it nothing can verify it.');
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`"${url}" is not a link. Paste the URL of the post you made.`);
  }

  const item = await one<{ account_id: string; platform: string; status: string }>(
    'select account_id, platform, status from content_items where id = $1',
    [id],
  );
  if (!item) return;
  if (item.status !== 'awaiting_manual_publish') return;

  await query(
    `insert into publications
       (content_item_id, account_id, platform, publish_mode, manual_publish_url,
        permalink, published_at)
     values ($1, $2, $3, 'draft', $4, $4, now())
     on conflict do nothing`,
    [id, item.account_id, item.platform, url],
  );
  await query(
    `update content_items set status = 'published', published_at = now() where id = $1`,
    [id],
  );
  await audit('manual_publish_recorded', id, { url, platform: item.platform });

  revalidatePath('/queue');
  revalidatePath(`/queue/${id}`);
}
