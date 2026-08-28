'use server';

import { revalidatePath } from 'next/cache';
import { one, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

/**
 * Creative Studio server actions. §235.
 *
 * Every one of these enqueues a job rather than doing the work inline. The
 * worker owns anything measured in minutes, and concept generation is a
 * strategy-grade model call — holding an HTTP request open for it is how a
 * Studio becomes a page that times out.
 */

/**
 * Ask for concepts.
 *
 * The brief may be empty: "give me ideas" is the more common request, and the
 * generator reads signals, account intelligence and content gaps when nobody
 * has said what they want. A brief narrows it rather than replacing it.
 */
export async function requestConcepts(formData: FormData): Promise<void> {
  await requireOperator();
  const productId = String(formData.get('productId') ?? 'recipefix');
  const brief = String(formData.get('brief') ?? '').trim();
  const platforms = formData.getAll('platforms').map(String).filter(Boolean);

  const batchId = crypto.randomUUID();
  await query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ('generate_concepts', $1, 30, $2) on conflict do nothing`,
    [
      {
        productId,
        batchId,
        ...(brief ? { operatorBrief: brief } : {}),
        ...(platforms.length > 0 ? { platforms } : {}),
        source: 'studio',
      },
      `studio_concepts:${batchId}`,
    ],
  );

  revalidatePath('/studio');
}

/**
 * Choose a concept and build from it.
 *
 * The selection is recorded on the concept itself before anything is queued,
 * so the record of what an operator chose survives a generation that fails.
 * `selected_at` is what makes "which concept produced this post" answerable.
 */
export async function selectConcept(formData: FormData): Promise<void> {
  await requireOperator();
  const conceptId = String(formData.get('conceptId'));
  const productId = String(formData.get('productId') ?? 'recipefix');

  const concept = await one<{ id: string; idea_id: string | null; status: string }>(
    'select id, idea_id, status from concepts where id = $1',
    [conceptId],
  );
  if (!concept) throw new Error('That concept no longer exists.');

  await query(
    `update concepts set status = 'selected', selected_at = now(), updated_at = now()
      where id = $1`,
    [conceptId],
  );

  /*
   * The rest of the batch is marked rejected rather than left `proposed`.
   *
   * A batch whose losers stay open reads as five live concepts forever, and
   * the reason a concept lost — that a person picked another one — is a real
   * signal the ranker should eventually learn from.
   */
  await query(
    `update concepts
        set status = 'rejected',
            rejected_reason = 'Another concept in the batch was selected',
            updated_at = now()
      where batch_id = (select batch_id from concepts where id = $1)
        and id <> $1
        and status = 'proposed'`,
    [conceptId],
  );

  await query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ('generate', $1, 25, $2) on conflict do nothing`,
    [
      { productId, conceptId, ...(concept.idea_id ? { ideaId: concept.idea_id } : {}), source: 'studio' },
      `studio_generate:${conceptId}`,
    ],
  );

  revalidatePath('/studio');
}

/**
 * Change the creative direction before generating.
 *
 * Written onto the concept's own record so the generator reads it as an
 * operator decision rather than a suggestion. Everything here is a *pin*: the
 * directors honour it absolutely, including over their own objection, and say
 * so in the reason they record.
 */
export async function pinDirection(formData: FormData): Promise<void> {
  await requireOperator();
  const conceptId = String(formData.get('conceptId'));

  const pins: Record<string, string> = {};
  for (const key of ['visualLanguage', 'typography', 'opening', 'voiceEnergy', 'cta'] as const) {
    const value = String(formData.get(key) ?? '').trim();
    if (value) pins[key] = value;
  }

  await query(
    `update concepts
        set visual_treatment = visual_treatment || $2::jsonb,
            updated_at = now()
      where id = $1`,
    [conceptId, JSON.stringify({ pins })],
  );

  revalidatePath('/studio');
}

/**
 * Reject a whole batch, with a reason.
 *
 * The reason is the point. A batch dismissed with no reason teaches nothing,
 * and `cluster_rejections` is the job that turns these into a pattern the
 * concept generator can be told about.
 */
export async function rejectBatch(formData: FormData): Promise<void> {
  await requireOperator();
  const batchId = String(formData.get('batchId'));
  const reason = String(formData.get('reason') ?? '').trim();
  if (!reason) throw new Error('A rejection needs a reason, or it teaches nothing.');

  await query(
    `update concepts
        set status = 'rejected', rejected_reason = $2, updated_at = now()
      where batch_id = $1 and status = 'proposed'`,
    [batchId, reason],
  );

  revalidatePath('/studio');
}
