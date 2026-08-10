'use server';

import { revalidatePath } from 'next/cache';
import { one, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

/**
 * Build pack §2 step 3 — the calibration batch.
 *
 * Twenty drafts across formats and platforms, with no intent to publish. The
 * job is enqueued rather than run inline: generation belongs to the worker, and
 * a thirty-second wizard step should not hold an HTTP request open.
 */
export async function startCalibrationBatch(formData: FormData): Promise<void> {
  await requireOperator();
  const productId = String(formData.get('productId'));

  const state = await one<{ calibration_target: number }>(
    'select calibration_target from onboarding_state where product_id = $1',
    [productId],
  );

  await query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ('generate', $1, 20, $2) on conflict do nothing`,
    [
      { productId, calibration: true, limit: state?.calibration_target ?? 20 },
      `calibration:${productId}`,
    ],
  );

  await query(
    `insert into notifications (kind, severity, title, body)
     values ('digest','info','Calibration batch queued',
             'Twenty drafts are being generated. They are never published; they exist to teach the copywriter your taste.')`,
  );

  revalidatePath('/onboarding');
}

/**
 * Record a verdict. Approvals seed the hooks table and the few-shot examples;
 * rejections become negative examples and, where the reason names a phrase, an
 * addition to the product's banned list.
 */
export async function reviewCalibrationDraft(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));
  const productId = String(formData.get('productId'));
  const verdict = String(formData.get('verdict'));
  const reason = String(formData.get('reason') ?? '').trim();

  if (verdict === 'rejected' && !reason) {
    // Every rejection asks why. A rejection without a reason teaches nothing.
    return;
  }

  const item = await one<{ body: string; platform: string; persona: string; category: string }>(
    'select body, platform, persona, category from content_items where id = $1',
    [id],
  );
  if (!item) return;

  await query(
    `insert into calibration_reviews (product_id, content_item_id, verdict, reason)
     values ($1,$2,$3,$4)
     on conflict (content_item_id) do update set verdict = excluded.verdict, reason = excluded.reason`,
    [productId, id, verdict, reason || null],
  );

  if (verdict === 'approved') {
    const opening = item.body.split(/[.!?]/)[0]?.trim();
    if (opening) {
      await query(
        `insert into hooks (product_id, pattern, platform, category, source)
         values ($1,$2,$3,$4,'calibration') on conflict do nothing`,
        [productId, opening, item.platform, item.category],
      );
    }
    await query(
      `update brand_voices
          set examples = examples || $3::jsonb
        where product_id = $1 and persona = $2`,
      [
        productId,
        item.persona,
        JSON.stringify([{ platform: item.platform, text: item.body, why_good: 'approved in calibration' }]),
      ],
    );
  } else {
    await query(
      `update brand_voices
          set anti_examples = anti_examples || $3::jsonb
        where product_id = $1 and persona = $2`,
      [productId, item.persona, JSON.stringify([{ text: item.body, why_bad: reason }])],
    );

    // If the reason names a phrase in quotes, add it to the banned list so the
    // filter catches it next time rather than the operator having to.
    const quoted = /["“']([^"”']{3,40})["”']/.exec(reason)?.[1];
    if (quoted) {
      await query(
        `update products
            set content_rules = jsonb_set(
              coalesce(content_rules, '{}'::jsonb),
              '{banned_phrases}',
              coalesce(content_rules -> 'banned_phrases', '[]'::jsonb) || to_jsonb($2::text))
          where id = $1`,
        [productId, quoted],
      );
    }
  }

  await query(`update content_items set status = 'archived' where id = $1`, [id]);

  const progress = await one<{ reviewed: string; target: number }>(
    `select (select count(*) from calibration_reviews where product_id = $1) as reviewed,
            (select calibration_target from onboarding_state where product_id = $1) as target`,
    [productId],
  );

  await query(
    `update onboarding_state
        set calibration_reviewed = $2,
            step_calibration_done = ($2 >= calibration_target)
      where product_id = $1`,
    [productId, Number(progress?.reviewed ?? 0)],
  );

  revalidatePath('/onboarding');
  revalidatePath('/');
}

export async function completeStep(formData: FormData): Promise<void> {
  await requireOperator();
  const productId = String(formData.get('productId'));
  const step = String(formData.get('step'));

  const column = {
    ingest: 'step_ingest_done',
    voice: 'step_voice_done',
    templates: 'step_templates_done',
    accounts: 'step_accounts_done',
  }[step];
  if (!column) return;

  await query(`update onboarding_state set ${column} = true where product_id = $1`, [productId]);

  await query(
    `update onboarding_state
        set completed_at = case
          when step_ingest_done and step_voice_done and step_calibration_done
               and step_templates_done and step_accounts_done
          then now() else null end
      where product_id = $1`,
    [productId],
  );

  revalidatePath('/onboarding');
  revalidatePath('/');
}
