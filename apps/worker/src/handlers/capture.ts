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
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  diagnoseAuth,
  diagnoseCapture,
  FLOWS,
  assetStaleness,
  footageDurationMs,
  footageSpansFor,
  looksBlank,
  type FlowId,
} from '@halyard/core';
import type { Job, HandlerContext } from '../poller.js';
import { runFlowChain, type FlowRunResult } from '../capture/runFlow.js';
import { uploadAsset } from '../storage.js';
import { cutFootage } from '../capture/cutFootage.js';
import { invalidateBundle, PUBLIC_DIR } from '../video.js';

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
    capture_credentials: Record<string, string> | null;
  }>(
    'select destinations, website_url, capture_credentials from products where id = $1',
    [productId],
  );

  /**
   * §305. The credentials a `fillSecret` step names.
   *
   * Read here and passed straight to the runner. They are never logged, never
   * put in a job payload and never returned — migration 0060 says so on the
   * column, and `fillSecret` exists so that a flow definition can name a secret
   * without containing one.
   */
  const secrets = productRows[0]?.capture_credentials ?? undefined;
  const baseUrl =
    process.env.RECIPEFIX_WEB_URL ??
    productRows[0]?.destinations?.web ??
    productRows[0]?.website_url ??
    'https://recipefix.app';

  // The weekly gate verifies without recording: it proves the selectors still
  // resolve, which is the whole point of running it on a schedule.
  const verifyOnly = job.payload.verifyOnly === true;

  const outDir = `${CAPTURE_ROOT}/${Date.now()}`;
  const browser = await chromium.launch({ headless: true });

  try {
    // ── Verify, then record ────────────────────────────────────────────────
    const verification = await runFlowChain(flow, {
      baseUrl,
      outDir: `${outDir}/verify`,
      mode: 'verify',
      browser,
      ...(secrets ? { secrets } : {}),
      /* §329. A retry's substituted input, chosen from the flow's own list. */
      ...(typeof job.payload.inputOverride === 'string'
        ? { inputOverride: job.payload.inputOverride }
        : {}),
    });

    for (const result of verification) {
      await recordRun(ctx, productId, result, baseUrl, null, []);
    }

    /**
     * §163. The gate is per flow, not per chain.
     *
     * This refused to record anything when *any* flow in the chain failed
     * verification. The reason it gives is sound — "recording against a page
     * whose markup has moved produces footage of an error state" — but it
     * applies to the flow that drifted, not to its siblings.
     *
     * Live consequence: `swap_toggle`'s control no longer exists on the page,
     * and that alone blocked recording `adapt_and_reveal`, which verified
     * perfectly and is the stronger demonstration of the product. Good footage
     * was being discarded for an unrelated reason.
     *
     * The root still gates its own dependents — `runFlowChain` already refuses
     * to run one against a page that never reached a result — so a broken root
     * still records nothing.
     */
    const rootFailed = verification.find((r) => r.flow === flow.id && !r.ok);
    const failed = rootFailed ?? verification.find((r) => !r.ok);
    if (failed && !rootFailed) {
      // A dependent drifted. Say so loudly, then record what does work.
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
      ctx.log('a dependent flow has drifted; recording the flows that still verify', {
        drifted: failed.flow,
        recording: flow.id,
      });
    }
    if (rootFailed) {
      await ctx.pool.query(
        `insert into notifications (kind, severity, title, body, dedupe_key)
         values ('render_failure', 'warning', $1, $2, $3)
         on conflict (dedupe_key) do nothing`,
        [
          `Capture flow ${rootFailed.flow} no longer runs`,
          rootFailed.summary,
          `flow_broken:${rootFailed.flow}:${new Date().toISOString().slice(0, 10)}`,
        ],
      );
      /**
       * §329. Diagnose it, write it down, and try the obvious thing.
       *
       * The error string names the symptom — a selector that did not resolve —
       * and three unrelated causes produced that same string on 2026-08-29. A
       * person told them apart by reading step timings; nobody will be reading
       * step timings when this runs unattended, so the reading happens here and
       * is recorded whether or not anyone looks.
       */
      const diagnosis =
        diagnoseAuth(rootFailed.steps as never[]) ??
        diagnoseCapture({
          steps: rootFailed.steps as never[],
          totalSeconds: rootFailed.totalSeconds,
        });

      let retried: { step: string; value: string } | null = null;
      if (diagnosis?.automatic && diagnosis.recovery === 'retry_with_different_input') {
        /*
         * The flow declares its own alternatives, so nothing here knows what a
         * recipe is. `attempt` walks the list across retries rather than always
         * trying the first one, which would loop on a value that already failed.
         */
        const step = flow.steps.find((s) => (s.alternatives?.length ?? 0) > 0);
        const attempt = Number(job.payload.inputAttempt ?? 0);
        const next = step?.alternatives?.[attempt];
        if (step && next) {
          retried = { step: step.name, value: next };
          await ctx.enqueue(
            'capture',
            { ...job.payload, inputOverride: next, inputAttempt: attempt + 1 },
            { priority: 4 },
          );
        }
      }

      await ctx.pool.query(
        `insert into capture_audit
           (product_id, flow_id, kind, finding, recovery, acted, action_taken)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          productId,
          rootFailed.flow,
          diagnosis?.kind ?? 'unknown',
          diagnosis?.finding ?? rootFailed.summary,
          diagnosis?.recovery ?? 'escalate',
          retried !== null,
          retried ? JSON.stringify(retried) : null,
        ],
      );

      ctx.log('capture diagnosed', {
        flow: rootFailed.flow,
        kind: diagnosis?.kind,
        recovery: diagnosis?.recovery,
        finding: diagnosis?.finding,
        retriedWith: retried?.value,
      });

      throw new FlowVerificationFailed(
        rootFailed.flow,
        /* The finding, not the symptom — this string is what reaches the UI. */
        diagnosis ? `${diagnosis.finding}${retried ? ` Retrying with a different input.` : ''}` : rootFailed.summary,
      );
    }

    const appVersion = await detectAppVersion(baseUrl);

    if (verifyOnly) {
      // A release since the last capture is worth saying out loud: every asset
      // taken against the old build is now stale.
      await ctx.pool.query(
        `update products set observed_app_version = $2, observed_app_version_at = now()
          where id = $1 and $2::text is not null`,
        [productId, appVersion],
      );
      ctx.log('verified flows', { flow: flow.id, appVersion });
      return;
    }
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
      ...(secrets ? { secrets } : {}),
      ...(typeof job.payload.inputOverride === 'string'
        ? { inputOverride: job.payload.inputOverride }
        : {}),
    });

    let videoAssetId: string | null = null;
    let footageFile: string | null = null;
    let footageMs = 0;
    const blankStills: Array<{ name: string; reason: string }> = [];

    for (const result of captures) {
      const assetIds: string[] = [];

      for (const [name, file] of Object.entries(result.stills)) {
        const bytes = await readFile(file);

        // Never file a black frame. A verification pass proves the selectors
        // resolved; it does not prove the page painted, and an unpainted
        // screenshot is exactly what a post should never contain.
        const size = pngDimensions(bytes) ?? flow.viewport;
        const blank = looksBlank(bytes.byteLength, size.width, size.height);
        if (blank.blank) {
          blankStills.push({ name, reason: blank.reason! });
          continue;
        }

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
      /**
       * §163. The cut, written where a render can reach it.
       *
       * The raw recording spans the whole session — fifty seconds in the first
       * real capture, of which ten were the product doing anything. A creative
       * beat needs footage, so the spans worth watching are cut here, once, and
       * left in the render package's public directory under a name derived from
       * the flow. `footageSpansFor` returning nothing means no footage, and the
       * beat renders nothing rather than showing dead air.
       */
      if (result.videoPath) {
        const spans = footageSpansFor(result.steps as never[]);
        if (spans.length > 0) {
          const file = `capture/${result.flow}.mp4`;
          const target = path.join(PUBLIC_DIR, file);
          await mkdir(path.dirname(target), { recursive: true });
          const cut = await cutFootage(result.videoPath, spans, target, {
            focusRegion: FLOWS[result.flow as FlowId]?.focusRegion,
          });
          if (cut) {
            invalidateBundle();
            /*
             * §246. The cut footage becomes a real asset.
             *
             * It used to exist only in this container's `public/` directory,
             * so a redeploy destroyed it and every later render that planned
             * on it failed with a 404. Stored under the same bundle-relative
             * path the beat references, which is what `stageFootage` joins on.
             */
            await uploadAsset(ctx, {
              bytes: await readFile(target),
              mimeType: 'video/mp4',
              kind: 'video',
              source: 'capture',
              /*
               * Tagged with the bundle-relative path the beat references.
               * `uploadAsset` chooses its own hashed storage path, so the tag
               * is the join — one string, in one place, rather than a second
               * identifier on the beat that could drift from the first.
               */
              tags: ['capture_cut', file],
              caption: `Captured product footage: ${result.flow}`,
            }).catch((err: Error) => {
              /* Non-fatal: the file is on disk and this render will work. The
                 next container is the one that suffers, so it is worth a log
                 rather than losing the capture entirely. */
              ctx.log('could not persist cut footage', { file, error: err.message });
            });
            footageFile = file;
            // Carried so a beat can be exactly as long as its footage rather
            // than holding a frozen last frame to fill an emphasis.
            footageMs = footageDurationMs(spans);
            ctx.log('cut capture footage for creative use', {
              flow: result.flow,
              spans: spans.length,
              keptMs: footageDurationMs(spans),
              file,
            });
          }
        }
      }

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
            /*
             * §163. How a creative plan finds this footage.
             *
             * The cut itself lives in the render bundle's public directory,
             * not in storage — Remotion serves it from there. What is recorded
             * here is the pointer plus the timestamp, so `generate` can ask for
             * the newest footage and know how old it is. A tag rather than a
             * new table because assets already carry exactly this: a thing that
             * was captured, when, from which flow.
             */
            ...(footageFile ? [`footage:${footageMs}:${footageFile}`] : []),
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

    if (blankStills.length > 0) {
      await ctx.pool.query(
        `insert into notifications (kind, severity, title, body, dedupe_key)
         values ('render_failure', 'warning', $1, $2, $3)
         on conflict (dedupe_key) do nothing`,
        [
          `${blankStills.length} blank frame${blankStills.length === 1 ? '' : 's'} discarded from ${flow.id}`,
          `${blankStills.map((b) => b.name).join(', ')}. ${blankStills[0]!.reason}`,
          `blank_frames:${flow.id}:${new Date().toISOString().slice(0, 10)}`,
        ],
      );
    }

    ctx.log('captured flow', {
      flow: flow.id,
      appVersion,
      supersededAssets: superseded.rows.length,
      blankStillsDiscarded: blankStills.length,
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
                               started_at, duration_ms, steps, elisions, asset_ids,
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
      JSON.stringify(result.elisions),
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

/** PNG dimensions live in the IHDR chunk, at a fixed offset. */
function pngDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
