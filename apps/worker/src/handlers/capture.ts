/**
 * The capture handler. Milestone 41.
 *
 * Runs a flow against the live product, records video and stills, and files
 * everything in the asset library tagged with the flow, the date, and the app
 * version it was captured against. The version is the part that matters: it is
 * what makes staleness detectable rather than a guess about how long ago
 * something was taken.
 *
 * Verification runs first, in the same process, because a capture against a page
 * whose markup has moved does not fail — it quietly records a spinner.
 */
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { FLOWS, assetStaleness, type FlowId } from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';
import { runFlowChain, type FlowRunResult } from '../capture/runFlow.js';
import { uploadAsset } from '../storage.js';

const CAPTURE_ROOT = process.env.HALYARD_CAPTURE_DIR ?? '/tmp/halyard-captures';

export class FlowVerificationFailed extends Error {
  constructor(flowId: string, summary: string) {
    super(
      `Refusing to record ${flowId}: ${summary} ` +
        'Recording against a page whose markup has moved produces footage of an error state that nobody notices until it is in a post.',
    );
    this.name = 'FlowVerificationFailed';
  }
}

export async function captureHandler(job: Job, ctx: HandlerContext): Promise<void> {
  const flowId = String(job.payload.flowId ?? '') as FlowId;
  const productId = String(job.payload.productId ?? 'recipefix');
  const flow = FLOWS[flowId];
  if (!flow) throw new Error(`capture job names an unknown flow '${flowId}'`);
  if (flow.dependsOn) {
    throw new Error(
      `${flowId} acts on a result card, so it is captured as part of ${flow.dependsOn}'s chain rather than on its own.`,
    );
  }

  const { rows: productRows } = await ctx.pool.query<{
    destinations: { web?: string };
    website_url: string | null;
  }>('select destinations, website_url from products where id = $1', [productId]);
  const baseUrl =
    process.env.RECIPEFIX_WEB_URL ??
    productRows[0]?.destinations?.web ??
    productRows[0]?.website_url ??
    'https://recipefix.app';

  const outDir = `${CAPTURE_ROOT}/${Date.now()}`;
  const browser = await chromium.launch({ headless: true });

  try {
    // ── Verify, then record ────────────────────────────────────────────────
    const verification = await runFlowChain(flow, {
      baseUrl,
      outDir: `${outDir}/verify`,
      mode: 'verify',
      browser,
    });

    for (const result of verification) {
      await recordRun(ctx, productId, result, baseUrl, null, []);
    }

    const failed = verification.find((r) => !r.ok);
    if (failed) {
      await ctx.pool.query(
        `insert into notifications (kind, severity, title, body, dedupe_key)
         values ('render_failure', 'warning', $1, $2, $3)
         on conflict (dedupe_key) do nothing`,
        [
          `Capture flow ${failed.flow} no longer runs`,
          failed.summary,
          `flow_broken:${failed.flow}:${new Date().toISOString().slice(0, 10)}`,
        ],
      );
      throw new FlowVerificationFailed(failed.flow, failed.summary);
    }

    const appVersion = await detectAppVersion(baseUrl);
    await ctx.pool.query(
      `update products set observed_app_version = $2, observed_app_version_at = now()
        where id = $1 and ($2::text is not null)`,
      [productId, appVersion],
    );

    // ── Record ─────────────────────────────────────────────────────────────
    const captures = await runFlowChain(flow, {
      baseUrl,
      outDir: `${outDir}/capture`,
      mode: 'capture',
      browser,
    });

    let videoAssetId: string | null = null;

    for (const result of captures) {
      const assetIds: string[] = [];

      for (const [name, file] of Object.entries(result.stills)) {
        const bytes = await readFile(file);
        const asset = await uploadAsset(ctx, {
          bytes,
          mimeType: 'image/png',
          kind: 'screenshot',
          productId,
          source: 'capture',
          flowId: result.flow,
          appVersion,
          sourceUrl: baseUrl + flow.path,
          caption: `${flow.title} — ${name.replace(/-/g, ' ')}`,
          altText: `Screenshot of ${flow.title.toLowerCase()} in RecipeFix`,
          // Auto-tagged with flow, date and version, which is what makes the
          // library searchable without anyone tagging by hand.
          tags: [
            'capture',
            result.flow,
            name,
            `captured:${new Date().toISOString().slice(0, 10)}`,
            ...(appVersion ? [`app:${appVersion}`] : []),
          ],
          usableFor: ['carousel', 'image', 'video'],
        });
        assetIds.push(asset.id);
      }

      // The whole chain shares one video file; it is filed once.
      if (result.videoPath && !videoAssetId) {
        const bytes = await readFile(result.videoPath);
        const asset = await uploadAsset(ctx, {
          bytes,
          mimeType: 'video/webm',
          kind: 'capture',
          productId,
          source: 'capture',
          flowId: flow.id,
          appVersion,
          sourceUrl: baseUrl + flow.path,
          durationSeconds: captures.reduce((total, r) => total + r.totalSeconds, 0),
          caption: `${flow.title} — screen recording`,
          tags: [
            'capture',
            'video',
            flow.id,
            `captured:${new Date().toISOString().slice(0, 10)}`,
            ...(appVersion ? [`app:${appVersion}`] : []),
          ],
          usableFor: ['video'],
        });
        videoAssetId = asset.id;
        assetIds.push(asset.id);
      }

      await recordRun(ctx, productId, result, baseUrl, appVersion, assetIds, videoAssetId);
    }

    // Older captures of the same flow are superseded, not deleted: one may
    // already be inside a published post.
    const superseded = await ctx.pool.query<{ id: string }>(
      `update assets
          set archived_at = now(),
              archived_reason = 'Superseded by a fresher capture of the same flow.'
        where flow_id = $1 and product_id = $2 and archived_at is null
          and captured_at < now() - interval '1 minute'
        returning id`,
      [flow.id, productId],
    );

    ctx.log('captured flow', {
      flow: flow.id,
      appVersion,
      supersededAssets: superseded.rows.length,
    });
  } finally {
    await browser.close();
  }
}

async function recordRun(
  ctx: HandlerContext,
  productId: string,
  result: FlowRunResult,
  baseUrl: string,
  appVersion: string | null,
  assetIds: string[],
  videoAssetId: string | null = null,
): Promise<void> {
  await ctx.pool.query(
    `insert into capture_runs (product_id, flow_id, mode, ok, base_url, app_version,
                               started_at, duration_ms, steps, ramps, asset_ids,
                               video_asset_id, summary, failure_screenshot_path)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      productId,
      result.flow,
      result.mode,
      result.ok,
      baseUrl,
      appVersion,
      result.startedAt,
      Math.round(result.totalSeconds * 1000),
      JSON.stringify(result.steps),
      JSON.stringify(result.ramps),
      assetIds,
      videoAssetId,
      result.summary,
      result.steps.find((s) => !s.ok)?.failureScreenshot ?? null,
    ],
  );
}

/**
 * The app version, read off the live site.
 *
 * There is no version endpoint, so this fingerprints the deployed build instead.
 * recipefix.app is a Vite single-page app, and its entry bundle carries a
 * content hash — `/assets/index-DYhSuiDJ.js` — that changes on every deploy.
 * That is exactly the granularity staleness wants: a capture taken before a
 * deploy may not match what a viewer sees today, and nobody has to remember to
 * announce a release.
 *
 * The other two forms are there so this keeps working if RecipeFix moves to
 * Next.js or starts publishing a version.
 */
export async function detectAppVersion(baseUrl: string): Promise<string | null> {
  try {
    const response = await fetch(baseUrl, { redirect: 'follow' });
    if (!response.ok) return null;
    const html = await response.text();

    const declared = /"softwareVersion"\s*:\s*"([^"]+)"/.exec(html)?.[1];
    if (declared) return declared;

    const viteBundle = /\/assets\/index-([A-Za-z0-9_-]{6,})\.js/.exec(html)?.[1];
    if (viteBundle) return `build-${viteBundle}`;

    const nextBuildId =
      /"buildId"\s*:\s*"([^"]+)"/.exec(html)?.[1] ??
      /\/_next\/static\/([A-Za-z0-9_-]{8,})\/_buildManifest/.exec(html)?.[1];
    if (nextBuildId) return `build-${nextBuildId}`;

    return null;
  } catch {
    return null;
  }
}

/**
 * Mark assets stale rather than waiting for someone to notice.
 *
 * Runs daily. An asset goes stale on age or on a version change, and the reason
 * says which, because "60 days old" and "the app shipped since" call for
 * different responses.
 */
export async function markStaleAssetsHandler(_job: Job, ctx: HandlerContext): Promise<void> {
  const { rows } = await ctx.pool.query<{
    id: string;
    captured_at: string;
    app_version: string | null;
    flow_id: string | null;
    product_id: string;
    observed_app_version: string | null;
  }>(
    `select a.id, a.captured_at, a.app_version, a.flow_id, a.product_id,
            p.observed_app_version
       from assets a
       join products p on p.id = a.product_id
      where a.captured_at is not null and a.archived_at is null`,
  );

  let stale = 0;
  for (const row of rows) {
    const verdict = assetStaleness(
      new Date(row.captured_at),
      row.app_version,
      row.observed_app_version,
    );
    if (!verdict.stale) continue;
    stale++;
    await ctx.pool.query(
      `update assets set archived_reason = $2 where id = $1 and archived_at is null`,
      [row.id, verdict.reason],
    );
  }

  if (stale > 0) {
    await ctx.pool.query(
      `insert into notifications (kind, severity, title, body, dedupe_key)
       values ('render_failure', 'info', $1, $2, $3)
       on conflict (dedupe_key) do nothing`,
      [
        `${stale} captured asset${stale === 1 ? ' is' : 's are'} stale`,
        'Re-capture from /assets. A screenshot of a screen that no longer exists is worse than no screenshot.',
        `stale_assets:${new Date().toISOString().slice(0, 10)}`,
      ],
    );
  }

  ctx.log('checked asset staleness', { checked: rows.length, stale });
}
