'use server';

import { revalidatePath } from 'next/cache';
import { query, one } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

/**
 * Rejection clusters. Milestone 43, item 2.
 *
 * `rejectionClusters.ts` has been naming the pattern across rejections since
 * round 2, and nothing ever displayed one — so the operating model's promise
 * that "my taste should become legible to me, not just to it" was only half
 * built. Accepting a cluster turns it into a real slop rule.
 */
export async function acceptCluster(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));

  const cluster = await one<{
    product_id: string;
    pattern: string;
    suggested_rule: string | null;
  }>('select product_id, pattern, suggested_rule from rejection_clusters where id = $1', [id]);
  if (!cluster?.suggested_rule) return;

  // The rule joins the product's own content rules, which the copywriter reads
  // on every draft and the slop filter enforces on every gate run.
  await query(
    `update products
        set content_rules = jsonb_set(
              content_rules,
              '{operator_rules}',
              coalesce(content_rules -> 'operator_rules', '[]'::jsonb) || $2::jsonb)
      where id = $1`,
    [cluster.product_id, JSON.stringify([cluster.suggested_rule])],
  );

  await query(
    `update rejection_clusters
        set status = 'accepted', accepted_rule = suggested_rule, accepted_at = now()
      where id = $1`,
    [id],
  );

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'rejection_rule_accepted', 'rejection_cluster', $1, $2)`,
    [id, { pattern: cluster.pattern, rule: cluster.suggested_rule }],
  );

  revalidatePath('/');
}

/**
 * Dismiss for thirty days rather than forever.
 *
 * A pattern dismissed once may be worth acting on after another ten rejections,
 * so this suppresses rather than deletes.
 */
export async function dismissCluster(formData: FormData): Promise<void> {
  await requireOperator();
  const id = String(formData.get('id'));

  await query(
    `update rejection_clusters
        set status = 'dismissed', dismissed_until = now() + interval '30 days'
      where id = $1`,
    [id],
  );
  revalidatePath('/');
}
