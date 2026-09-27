'use server';

import { revalidatePath } from 'next/cache';
import { adjustmentById } from '@halyard/core';
import { acceptProductionCalibration, rejectProductionCalibration } from '@halyard/db';
import { query, one, pool } from '@/lib/db';
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
 * Opening-run review doubles as real voice calibration.
 *
 * The old onboarding flow generated twenty disposable drafts solely so the
 * operator could rate them, while the actual launch batch was reviewed again
 * later. A real approve/reject on a launch draft is stronger evidence: it is the
 * exact content the operator is deciding whether to represent the product with.
 * Only launch-batch items count here, and one content item can contribute at
 * most one review because `calibration_reviews.content_item_id` is unique.
 */
async function recordLaunchCalibrationDecision(
  id: string,
  decision: 'approved' | 'rejected',
  reason: string | null = null,
): Promise<void> {
  const item = await one<{
    product_id: string;
    platform: string;
    persona: string;
    category: string;
    body: string;
    original_body: string | null;
    generation_meta: Record<string, unknown> | null;
  }>(
    `select product_id, platform, persona, category, body, original_body, generation_meta
       from content_items where id = $1`,
    [id],
  );
  if (!item || item.generation_meta?.source !== 'launch_batch') return;

  const verdict =
    decision === 'approved' && item.original_body && item.original_body !== item.body
      ? 'edited'
      : decision;
  const inserted = await one<{ fresh: boolean }>(
    `insert into calibration_reviews
       (product_id, content_item_id, verdict, reason, edited_body)
     values ($1,$2,$3,$4,$5)
     on conflict (content_item_id) do update
       set verdict = excluded.verdict, reason = excluded.reason,
           edited_body = excluded.edited_body, reviewed_at = now()
     returning (xmax = 0) as fresh`,
    [
      item.product_id,
      id,
      verdict,
      reason,
      verdict === 'edited' ? item.body : null,
    ],
  );

  /* One positive example per item; repeated decisions update the verdict only. */
  if (inserted?.fresh && (verdict === 'approved' || verdict === 'edited')) {
    const opening = item.body.split(/[.!?]/)[0]?.trim();
    if (opening) {
      await query(
        `insert into hooks (product_id, pattern, platform, category, source)
         values ($1,$2,$3,$4,'calibration') on conflict do nothing`,
        [item.product_id, opening, item.platform, item.category],
      );
    }
    await query(
      `update brand_voices
          set examples = examples || $3::jsonb
        where product_id = $1 and persona = $2`,
      [
        item.product_id,
        item.persona,
        JSON.stringify([{
          platform: item.platform,
          text: item.body,
          why_good: verdict === 'edited' ? 'approved after operator edit in opening run' : 'approved in opening run',
        }]),
      ],
    );
  }

  await query(
    `update onboarding_state os
        set calibration_reviewed = x.reviewed,
            step_calibration_done = (x.reviewed >= os.calibration_target)
       from (
         select count(*)::int as reviewed
           from calibration_reviews where product_id = $1
       ) x
      where os.product_id = $1`,
    [item.product_id],
  );
  await query(
    `update onboarding_state
        set completed_at = case
          when step_ingest_done and step_voice_done and step_calibration_done
               and step_templates_done and step_accounts_done
          then coalesce(completed_at, now()) else null end
      where product_id = $1`,
    [item.product_id],
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
    format: string;
    tiktok_options: unknown;
    tiktok_creator_info: unknown;
    generation_meta: Record<string, unknown> | null;
    attached_asset_ids: string[];
    has_finished_render: boolean;
  }>(
    `select ci.status, ci.scheduled_at, ci.platform, ci.format,
            ci.tiktok_options, ci.tiktok_creator_info,
            ci.generation_meta, ci.attached_asset_ids,
            exists (
              select 1 from renders r
              join assets a on a.id = r.output_asset_id
              where r.content_item_id = ci.id
                and r.status = 'done' and r.quality = 'final'
                and a.archived_at is null
            ) as has_finished_render
       from content_items ci where ci.id = $1`,
    [id],
  );
  if (!item) return;

  /*
   * Paid external visual work is reviewed as the actual media, never as a
   * promise that media will exist later. The Gallery also disables its button,
   * but this server action is a public POST boundary and must enforce the same
   * invariant itself.
   */
  const productionMediaRequired = item.generation_meta?.production_media_required === true;
  if (
    productionMediaRequired &&
    !item.has_finished_render &&
    (item.attached_asset_ids ?? []).length === 0
  ) {
    await audit('approve_refused_missing_production_media', id, {
      format: item.format,
      productionV2: item.generation_meta?.production_v2 === true,
    });
    revalidatePath(`/gallery/${id}`);
    return;
  }

  if (
    item.generation_meta?.visual_provider === 'blotato' &&
    (item.generation_meta?.visual_status !== 'done' || (item.attached_asset_ids ?? []).length === 0)
  ) {
    await audit('approve_refused_missing_visual', id, {
      visualStatus: item.generation_meta?.visual_status ?? null,
    });
    revalidatePath(`/gallery/${id}`);
    return;
  }

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
      revalidatePath(`/gallery/${id}`);
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
  await recordLaunchCalibrationDecision(id, 'approved');

  // If it is already due, hand it straight to the worker.
  if (item.scheduled_at && new Date(item.scheduled_at) <= new Date()) {
    await query(
      `insert into jobs (kind, payload, priority, dedupe_key)
       values ('publish', $1, 10, $2) on conflict do nothing`,
      [{ contentItemId: id }, `publish:${id}`],
    );
  }

  revalidatePath('/gallery');
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
  await recordLaunchCalibrationDecision(id, 'rejected', reason || null);

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

  revalidatePath('/gallery');
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

  revalidatePath('/gallery');
  revalidatePath(`/gallery/${id}`);
}

/** Regenerate with a note. Blind retry is a wasted call (v1 §8). */
/**
 * §375. Regenerate, which used to regenerate nothing in particular.
 *
 * It set `status = 'draft'` — which removes the item from every queue filter,
 * so the piece vanished — and enqueued a `generate` job carrying
 * `regenerateContentItemId` and `note`. **Neither key was read by anything.**
 * The generate handler ran its ordinary path and drafted a *new* piece for
 * every account, so pressing Regenerate made the item disappear and an
 * unrelated one appear. Found by `payloadCoverage.test.ts`, which exists
 * because this is the third time a key has been written and never read.
 *
 * It now goes through the correction loop as what it always meant: revise the
 * copy, against this note, on this item. §373 built that path for the
 * adjustment buttons and Regenerate is the same request with the note doing
 * all the work.
 */
export async function regenerateItem(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const note = String(formData.get('note') ?? '').trim();

  await query(
    `update content_items set regen_notes = array_append(regen_notes, $2) where id = $1`,
    [id, note || 'no note given'],
  );
  await query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ('correct_content', $1, 40, $2) on conflict do nothing`,
    [
      {
        contentItemId: id,
        component: 'copy',
        action: 'revise_copy',
        label: 'Regenerate',
        note,
      },
      `regen:${id}`,
    ],
  );
  await audit('regenerate', id, { note });

  revalidatePath(`/gallery/${id}`);
  revalidatePath('/gallery');
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
  revalidatePath('/gallery');
  revalidatePath('/rundown');
}

interface ProductionCalibrationCandidate {
  product_id: string;
  production_recipe_id: string | null;
  recipe_mode: string | null;
  recipe_status: string | null;
  steps: Array<{ provider?: string; capability?: string }>;
  qc_results: { passed?: boolean; gates?: Array<{ status?: string }> } | null;
  attached_asset_ids: string[];
  has_finished_render: boolean;
}

async function productionCalibrationCandidate(id: string): Promise<ProductionCalibrationCandidate | null> {
  return one<ProductionCalibrationCandidate>(
    `select ci.product_id, ci.production_recipe_id,
            pr.mode as recipe_mode, pr.status as recipe_status,
            coalesce(pr.steps, '[]'::jsonb) as steps,
            ci.qc_results, ci.attached_asset_ids,
            exists (
              select 1 from renders r
              join assets a on a.id=r.output_asset_id
              where r.content_item_id=ci.id and r.status='done' and r.quality='final'
                and a.archived_at is null
            ) as has_finished_render
       from content_items ci
       left join production_recipes pr on pr.id=ci.production_recipe_id
      where ci.id=$1`,
    [id],
  );
}

function generativeCalibrationSteps(
  steps: ProductionCalibrationCandidate['steps'],
): Array<{ provider: string; capability: string }> {
  const generative = new Set(['higgsfield', 'blotato_visual']);
  const seen = new Set<string>();
  const result: Array<{ provider: string; capability: string }> = [];
  for (const step of steps ?? []) {
    const provider = String(step.provider ?? '');
    const capability = String(step.capability ?? '');
    const key = `${provider}:${capability}`;
    if (!provider || !capability || !generative.has(provider) || seen.has(key)) continue;
    seen.add(key);
    result.push({ provider, capability });
  }
  return result;
}

/**
 * Accept a visually reviewed calibration recipe for future automation.
 *
 * This is deliberately separate from approving the current social post. One
 * decision says "this asset may publish"; this says "Halyard may use this
 * production capability unattended again for this product." The latter is the
 * stronger permission and therefore requires finished media + passing media QC.
 */
export async function acceptProductionRecipe(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const candidate = await productionCalibrationCandidate(id);
  if (!candidate?.production_recipe_id) return;

  const hasMedia = candidate.has_finished_render || (candidate.attached_asset_ids ?? []).length > 0;
  const failedGate = (candidate.qc_results?.gates ?? []).some((gate) => gate.status === 'failed');
  const mediaPassed = candidate.qc_results?.passed === true && !failedGate;
  if (
    candidate.recipe_mode !== 'calibration' ||
    candidate.recipe_status !== 'review_required' ||
    !hasMedia ||
    !mediaPassed
  ) {
    await audit('production_recipe_accept_refused', id, {
      recipeId: candidate.production_recipe_id,
      mode: candidate.recipe_mode,
      recipeStatus: candidate.recipe_status,
      hasMedia,
      mediaPassed,
    });
    revalidatePath(`/gallery/${id}`);
    return;
  }

  const steps = generativeCalibrationSteps(candidate.steps);
  for (const step of steps) {
    await acceptProductionCalibration(pool(), {
      productId: candidate.product_id,
      provider: step.provider,
      capability: step.capability,
      sourceRecipeId: candidate.production_recipe_id,
      notes: `Accepted from Gallery item ${id} after finished-media QC.`,
    });
  }
  await query(
    `update production_recipes
        set status='accepted', human_review_required=false, updated_at=now()
      where id=$1 and mode='calibration' and status='review_required'`,
    [candidate.production_recipe_id],
  );
  await audit('production_recipe_accepted', id, {
    recipeId: candidate.production_recipe_id,
    calibrated: steps,
  });
  revalidatePath(`/gallery/${id}`);
}

export async function rejectProductionRecipe(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  if (!id || !note) return;
  const candidate = await productionCalibrationCandidate(id);
  if (!candidate?.production_recipe_id || candidate.recipe_mode !== 'calibration') return;

  const steps = generativeCalibrationSteps(candidate.steps);
  for (const step of steps) {
    await rejectProductionCalibration(pool(), {
      productId: candidate.product_id,
      provider: step.provider,
      capability: step.capability,
      sourceRecipeId: candidate.production_recipe_id,
      notes: note,
    });
  }
  await query(
    `update production_recipes
        set status='rejected', human_review_required=true, updated_at=now()
      where id=$1 and mode='calibration' and status not in ('accepted','obsolete')`,
    [candidate.production_recipe_id],
  );
  await audit('production_recipe_rejected', id, {
    recipeId: candidate.production_recipe_id,
    rejectedCapabilities: steps,
    note,
  });
  revalidatePath(`/gallery/${id}`);
}

/**
 * Spend Blotato visual credits only after the operator has seen the copy brief.
 *
 * Launch generation deliberately stops at this boundary: the expensive visual
 * is downstream of editorial acceptance, not a side effect of drafting. This
 * action only queues the ordinary worker handler; it never generates media
 * inline and it never publishes.
 */
export async function generateBlotatoVisual(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const item = await one<{
    status: string;
    generation_meta: Record<string, unknown> | null;
    attached_asset_ids: string[];
  }>(
    `select status, generation_meta, attached_asset_ids from content_items where id = $1`,
    [id],
  );
  if (!item || item.generation_meta?.visual_provider !== 'blotato') return;
  if (item.generation_meta?.visual_status === 'done' && (item.attached_asset_ids ?? []).length > 0) {
    return;
  }
  if (['published', 'publishing', 'approved', 'scheduled'].includes(item.status)) return;

  await query(
    `update content_items
        set generation_meta = generation_meta || $2::jsonb,
            status = case when status = 'failed' then 'pending_approval' else status end
      where id = $1`,
    [id, { visual_status: 'queued', visual_error: null, visual_approved_at: new Date().toISOString() }],
  );
  await query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ('generate_external_visual', $1, 45, $2) on conflict do nothing`,
    [{ contentItemId: id }, `generate_external_visual:${id}`],
  );
  await audit('blotato_visual_generation_approved', id, {});
  revalidatePath(`/gallery/${id}`);
  revalidatePath('/gallery');
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
  revalidatePath('/gallery');
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

  revalidatePath('/gallery');
  revalidatePath(`/gallery/${id}`);
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

  revalidatePath('/gallery');
  revalidatePath(`/gallery/${id}`);
}

/**
 * §373. An adjustment: what to rebuild, and why.
 *
 * `regenerateItem` sends a free-text note and rebuilds everything from the
 * copy down, which is right when the words are wrong and wasteful when they
 * are not — and it is the only route an operator has had. "The picture is
 * wrong" reached the copywriter and rewrote the words.
 *
 * This names the component instead. The correction loop already knows what a
 * change to `creative_plan` invalidates and what it does not, so asking for a
 * different picture rebuilds the ground and leaves the writing alone.
 *
 * The note travels too. A button says what to rebuild; only a sentence says
 * why, and the reason is what makes the second attempt different from the
 * first rather than another roll of the same dice.
 */
/**
 * §573. The adjustment comes from the button, bound — not from the FormData.
 *
 * Every one of these buttons was dead. They are `<button name="adjustment"
 * value="rewrite">` inside a `<form action={adjustItem}>`, which is correct
 * HTML and correct React, and the value did not arrive: the action received
 * `adjustment` as an empty string and threw `There is no "" adjustment.`, so
 * asking for any change at all answered 500. Nothing caught it because no test
 * had ever pressed one — the E2E suite was still clicking a Regenerate button
 * on a screen that had been replaced.
 *
 * Rather than depend on the submitter being serialised into the action's
 * FormData, each button binds its own id. That is unambiguous, it is the
 * documented way to pass a fixed argument to a server action, and it cannot
 * silently become empty again.
 *
 * The `formData` read is kept as a belt-and-braces default, but nothing can
 * currently reach it: no control sends an `adjustment` field any more, and
 * `rewrite` and `reground` carry no `needs*` condition, so `available` is never
 * empty and implicit submission (Enter in the note field) activates the first
 * button — which binds its own id like every other one.
 */
export async function adjustItem(boundAdjustmentId: string, formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const adjustmentId = (boundAdjustmentId || String(formData.get('adjustment') ?? '')).trim();
  const note = String(formData.get('note') ?? '').trim();

  const adjustment = adjustmentById(adjustmentId);
  if (!adjustment) {
    /*
     * Refused rather than falling back to a full regenerate. An unknown
     * adjustment silently becoming "rewrite everything" is how a button ends
     * up doing something nobody asked for.
     */
    throw new Error(`There is no "${adjustmentId}" adjustment.`);
  }

  /*
   * The note is recorded and the status is left alone. Setting `status =
   * 'draft'` takes the item out of every queue filter, so an operator who asks
   * for a change watches the piece disappear — which is what `regenerateItem`
   * has always done and is why regeneration looked broken.
   */
  await query(
    `update content_items set regen_notes = array_append(regen_notes, $2) where id = $1`,
    [id, note ? `${adjustment.label}: ${note}` : adjustment.label],
  );

  await query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ('correct_content', $1, 40, $2) on conflict do nothing`,
    [
      {
        contentItemId: id,
        /* The loop's own vocabulary, so nothing has to interpret a label. */
        component: adjustment.component,
        action: adjustment.action,
        /* The button's own words, so the recorded reason reads as a sentence. */
        label: adjustment.label,
        note,
      },
      /*
       * Keyed on the adjustment as well as the item: asking for a different
       * picture and then for a slower cut are two requests, and deduping them
       * together would silently drop the second.
       */
      `adjust:${id}:${adjustment.id}`,
    ],
  );

  await audit('adjust', id, { adjustment: adjustment.id, component: adjustment.component, note });
  revalidatePath(`/gallery/${id}`);
  revalidatePath('/gallery');
}

/**
 * §380. Record that the overflow was posted by hand.
 *
 * `overflow_posted_at` has been a column with no writer. There is deliberately
 * no `reply()` on the adapter interface (v1 §13) — Halyard drafts and a person
 * sends — so this is the person saying they sent it, which is the only way that
 * column could ever be true.
 */
export async function markOverflowPosted(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  await query(`update content_items set overflow_posted_at = now() where id = $1`, [id]);
  await audit('overflow_posted', id, {});
  revalidatePath(`/gallery/${id}`);
}
