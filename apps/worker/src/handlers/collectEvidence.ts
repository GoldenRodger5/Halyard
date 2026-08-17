/**
 * Collect a product's public surfaces into `product_evidence`.
 *
 * There is no model in this file, on purpose. Collection and reasoning are
 * separate jobs so that evidence which was slow to gather survives a failure in
 * the reasoning over it — and so that a bad prompt can be re-run without
 * re-fetching someone's website.
 *
 * ## Why re-collection does not raise confidence
 *
 * Evidence is keyed on a hash of its content. Running this twice against an
 * unchanged site collides with the existing rows and touches `collected_at`
 * instead of inserting. Without that, a nightly collector would corroborate
 * every fact in the Brain with itself and everything would read `verified`
 * within a week — the exact "green means nothing" failure the Auditor exists to
 * catch, arriving through the front door.
 */
import {
  collectAppStoreEvidence,
  collectBriefEvidence,
  collectConnectorSurface,
  collectWebEvidence,
  createConnector,
  hashContent,
  type CollectedEvidence,
} from '@halyard/core';
import type { HandlerContext, Job } from '../poller.js';

interface ProductRow {
  id: string;
  name: string;
  brief_markdown: string | null;
  connector_type: 'mcp' | 'rest' | 'github' | 'none';
  connector_config: Record<string, unknown>;
  destinations: { web?: string; app_store?: string } | null;
  website_url: string | null;
  app_store_url: string | null;
}

/**
 * Insert, or record that the same content was seen again.
 *
 * `on conflict do update` on the identity index is what makes the whole thing
 * idempotent. `collected_at` moves so staleness reflects when the source was
 * last confirmed to still say this; nothing else changes, because nothing else
 * can have changed without producing a different hash.
 */
export async function upsertEvidence(
  ctx: HandlerContext,
  productId: string,
  evidence: CollectedEvidence,
): Promise<{ id: string; fresh: boolean }> {
  const { rows } = await ctx.pool.query<{ id: string; fresh: boolean }>(
    `insert into product_evidence
       (product_id, kind, source_url, content_hash, title, body, meta, collector)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (product_id, kind, coalesce(source_url, ''), content_hash)
       do update set collected_at = now()
     returning id, (xmax = 0) as fresh`,
    [
      productId,
      evidence.kind,
      evidence.sourceUrl,
      evidence.contentHash,
      evidence.title,
      evidence.body,
      JSON.stringify(evidence.meta),
      evidence.collector,
    ],
  );
  return rows[0]!;
}

/**
 * Mark older observations of the same source superseded.
 *
 * The old row is kept rather than deleted. A fact citing it is not a broken
 * reference — it is the accurate statement "this was true of the page as it was
 * then", which is what provenance is for.
 */
async function supersedeOlder(
  ctx: HandlerContext,
  productId: string,
  kind: string,
  sourceUrl: string | null,
  currentId: string,
): Promise<void> {
  if (!sourceUrl) return;
  await ctx.pool.query(
    `update product_evidence
        set superseded_by = $4
      where product_id = $1 and kind = $2 and source_url = $3
        and id <> $4 and superseded_by is null`,
    [productId, kind, sourceUrl, currentId],
  );
}

export async function collectEvidenceHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const productId = String(job.payload.productId ?? '');
  if (!productId) throw new Error('collect_product_evidence job has no productId');

  const { rows } = await ctx.pool.query<ProductRow>(
    `select id, name, brief_markdown, connector_type, connector_config,
            destinations, website_url, app_store_url
       from products where id = $1`,
    [productId],
  );
  const product = rows[0];
  if (!product) throw new Error(`product ${productId} not found`);

  const collected: CollectedEvidence[] = [];

  // ── Web ──────────────────────────────────────────────────────────────────
  const web = product.destinations?.web ?? product.website_url;
  if (web) {
    collected.push(...(await collectWebEvidence({ rootUrl: web })));
  } else {
    // Not a failure: a product with no web presence is a real configuration,
    // and saying so is more use than an empty run that looks like a bug.
    ctx.log('no web surface to collect', { productId });
  }

  // ── App Store ────────────────────────────────────────────────────────────
  const listing = product.destinations?.app_store ?? product.app_store_url;
  if (listing) {
    collected.push(...(await collectAppStoreEvidence({ listingUrl: listing })));
  }

  // ── The product's own API surface ────────────────────────────────────────
  //
  // Wrapped, because a connector being unreachable is an operational state
  // already surfaced by the health check — not a reason to lose the web
  // evidence collected a moment ago.
  try {
    const connector = createConnector({
      id: product.id,
      connector_type: product.connector_type,
      connector_config: product.connector_config ?? {},
    });
    if (connector?.describeSurface) {
      collected.push(
        ...(await collectConnectorSurface({
          connectorId: productId,
          listTools: () => connector.describeSurface!(),
        })),
      );
    } else {
      // A product with no self-describing API is a real configuration, not a
      // failure. Saying which is more use than an empty run.
      ctx.log('no connector surface to read', {
        productId,
        why: connector ? 'connector does not describe its surface' : 'no connector configured',
      });
    }
  } catch (err) {
    ctx.log('connector surface unavailable', { productId, why: (err as Error).message });
  }

  // ── The operator's brief ─────────────────────────────────────────────────
  //
  // Evidence like any other, and deliberately not ground truth. Holding it to
  // the same corroboration rule is what lets the Brain report that the brief
  // and the site disagree, rather than silently preferring one.
  collected.push(...collectBriefEvidence({ productId, briefMarkdown: product.brief_markdown }));

  // ── Screenshots already captured ─────────────────────────────────────────
  //
  // Reuses `assets` rather than taking new screenshots: the capture system
  // exists, runs on release detection, and already knows which shots are stale.
  //
  // `alt_text` and `caption` are what an asset says about itself. An asset with
  // neither is a file with no description, and describing it here would mean
  // inventing one.
  const { rows: shots } = await ctx.pool.query<{
    id: string;
    alt_text: string | null;
    caption: string | null;
    storage_path: string;
    app_version: string | null;
  }>(
    `select id, alt_text, caption, storage_path, app_version
       from assets
      where product_id = $1
        and kind = 'screenshot'
        and archived_at is null
        and coalesce(alt_text, caption) is not null
      order by created_at desc limit 8`,
    [productId],
  );
  for (const shot of shots) {
    const description = [shot.alt_text, shot.caption].filter(Boolean).join(' — ');
    collected.push({
      kind: 'screenshot',
      sourceUrl: `asset://${shot.id}`,
      contentHash: hashContent(shot.id, description),
      title: shot.storage_path,
      body: description,
      meta: { assetId: shot.id, appVersion: shot.app_version },
      collector: 'assets',
    });
  }

  let fresh = 0;
  for (const evidence of collected) {
    const { id, fresh: isNew } = await upsertEvidence(ctx, productId, evidence);
    if (isNew) fresh += 1;
    await supersedeOlder(ctx, productId, evidence.kind, evidence.sourceUrl, id);
  }

  ctx.log('collected product evidence', {
    productId,
    observed: collected.length,
    fresh,
    unchanged: collected.length - fresh,
  });

  /**
   * Reasoning follows collection, as a separate job.
   *
   * Chained rather than inlined so a model failure does not roll back the
   * evidence, and so the Brain can be rebuilt from stored evidence without
   * touching the product again.
   */
  if (collected.length > 0) {
    await ctx.enqueue(
      'build_product_brain',
      { productId },
      { dedupeKey: `build_brain:${productId}:${new Date().toISOString().slice(0, 10)}`, priority: 40 },
    );
  }
}
