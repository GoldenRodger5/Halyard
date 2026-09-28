'use server';

import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

/**
 * The operator actions that can start Product Brain work.
 *
 * Each enqueues work for the worker rather than doing it here. The web tier has
 * no browser, no long timeout and no business holding a request open while
 * someone's website is crawled.
 *
 * The dedupe key is bucketed to the minute so a double-click is one job. It is
 * *not* bucketed to the day: an operator who has just fixed a broken page
 * should be able to re-collect immediately, and telling them to wait until
 * tomorrow would be the system protecting its own tidiness.
 */
function minuteBucket(): string {
  return new Date().toISOString().slice(0, 16);
}

async function enqueue(kind: string, productId: string, priority: number): Promise<void> {
  // Bare `on conflict do nothing`, matching the idiom the launch batch already
  // uses: the dedupe index is partial (`dedupe_key is not null and status in
  // ('queued','running')`) and naming the column without repeating that
  // predicate does not match any index, so Postgres refuses the statement.
  await query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ($1, $2, $3, $4)
     on conflict do nothing`,
    [kind, JSON.stringify({ productId }), priority, `${kind}:${productId}:${minuteBucket()}`],
  );
}

/**
 * One deliberate full product rescan.
 *
 * This is the operator action the Product Brain was designed around: re-read
 * configured evidence (website, App Store, MCP/API, repository and screenshots),
 * walk the live product to rediscover replayable features, and check whether a
 * new deployed build invalidated captures. Collection chains the Brain rebuild;
 * exploration chains feature verification. Nothing generated here can publish.
 */
export async function rescanProduct(formData: FormData): Promise<void> {
  await requireOperator();
  const productId = String(formData.get('productId') ?? '');
  if (!productId) return;

  const bucket = minuteBucket();
  for (const [kind, priority] of [
    ['detect_release', 15],
    ['collect_product_evidence', 20],
    ['explore_product', 30],
  ] as const) {
    await query(
      `insert into jobs (kind, payload, priority, dedupe_key)
       values ($1, $2, $3, $4)
       on conflict do nothing`,
      [kind, JSON.stringify({ productId, reason: 'operator_rescan' }), priority, `rescan:${kind}:${productId}:${bucket}`],
    );
  }

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'product_rescan_started', 'product', null, $1)`,
    [{ productId, bucket }],
  );

  revalidatePath('/master/product');
  revalidatePath('/master/product/features');
}

export async function collectEvidence(formData: FormData): Promise<void> {
  await requireOperator();
  const productId = String(formData.get('productId') ?? '');
  if (!productId) return;

  await enqueue('collect_product_evidence', productId, 25);
  revalidatePath('/master/product');
}

/**
 * Rebuild the Brain from evidence already stored.
 *
 * Separate from collection on purpose: re-running the reasoning after a prompt
 * change should not re-crawl someone's site, and re-crawling should not be
 * blocked by a model outage.
 */
export async function rebuildBrain(formData: FormData): Promise<void> {
  await requireOperator();
  const productId = String(formData.get('productId') ?? '');
  if (!productId) return;

  await enqueue('build_product_brain', productId, 40);
  revalidatePath('/master/product');
}

/**
 * Walk the product and propose feature claims.
 *
 * **This is the trigger `explore_product` never had.** The job kind, the
 * handler, the timeout policy and the agent contract all shipped in an earlier
 * phase, and nothing in the entire system enqueued it — not the scheduler, not
 * a cron, not a screen. It was a complete feature with no ignition, which is
 * exactly the failure class the Auditor exists to name.
 *
 * Deliberately manual rather than scheduled: exploration spends model calls and
 * drives a browser through someone's live product, so it stays a deliberate act.
 */
export async function exploreProduct(formData: FormData): Promise<void> {
  await requireOperator();
  const productId = String(formData.get('productId') ?? '');
  if (!productId) return;

  await enqueue('explore_product', productId, 30);
  revalidatePath('/master/product/features');
}
