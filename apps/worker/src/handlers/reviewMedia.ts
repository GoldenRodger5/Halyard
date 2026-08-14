/**
 * Look at what was actually rendered. Milestone 52.
 *
 * QC has always run at draft time, on text. The visual and audio gates were
 * written to read a probe of the finished file, and **no code path has ever
 * supplied one** — `runAllGates` takes them as optional inputs, the render
 * handler writes an asset row and stops. Two gates were structurally unable to
 * run, and an optional input nobody provides produces a gate that never
 * objects, which reads exactly like a gate that examined the media and approved
 * it.
 *
 * This job is the missing half. It probes the rendered file, samples frames,
 * has them described, and runs the media gates against what was produced rather
 * than against what was asked for.
 *
 * The describers are never told what the post was supposed to be — see
 * `generation/vision.ts` for why that matters, and `qc/coherence.ts` for the
 * comparison that happens in code afterwards.
 */
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  OpenAiVisionClient,
  runCoherenceQC,
  runVisualQC,
  type CoherenceIntent,
  type FrameObservation,
  type GateResult,
  type MediaProbe,
  type VisionClient,
  type VisualTarget,
} from '@halyard/core';
import { frameSampleTimes, probeVideo, sampleFrames } from '../video.js';
import type { HandlerContext, Job } from '../poller.js';

interface ItemRow {
  id: string;
  product_id: string;
  platform: string;
  format: string;
  body: string;
  title: string | null;
  hashtags: string[];
  category: string;
  qc_results: { gates?: GateResult[]; passed?: boolean; ranAt?: string } | null;
  product_artifact: Record<string, unknown> | null;
  status: string;
}

/**
 * What the post is about, as a handful of terms.
 *
 * Taken from structured data — the artifact, the category, the title — rather
 * than extracted from the body prose. A gate that derives its own expectations
 * from the same text it is checking is grading its own homework, and the whole
 * design of this gate is that the expectation comes from somewhere the
 * describer never saw.
 */
export function keyTermsFor(item: {
  title: string | null;
  category: string;
  hashtags: string[];
  product_artifact: Record<string, unknown> | null;
}): string[] {
  const terms = new Set<string>();

  // Hashtags are the operator's own summary of the subject, already normalised.
  for (const tag of item.hashtags ?? []) {
    const cleaned = tag.replace(/^#/, '').trim();
    if (cleaned.length > 2) terms.add(cleaned);
  }

  // The artifact names the concrete thing this post is about.
  const artifact = item.product_artifact ?? {};
  for (const field of ['recipeName', 'dish', 'diet', 'ingredient']) {
    const value = artifact[field];
    if (typeof value === 'string' && value.trim().length > 2) terms.add(value.trim());
  }

  // Fall back to the idea's title only if nothing structured exists, because a
  // title is prose and prose makes noisy expectations.
  if (terms.size === 0 && item.title) {
    for (const word of item.title.split(/\s+/)) {
      if (word.length > 4) terms.add(word.replace(/[^A-Za-z-]/g, ''));
    }
  }

  return [...terms].filter(Boolean).slice(0, 6);
}

/**
 * The nearest canonical aspect ratio, as the visual gate names them.
 *
 * The gate compares against a fixed set — a raw "1080:1920" would match none of
 * them and the aspect-ratio rule would fire on every correct render.
 */
export function aspectRatioOf(width: number, height: number): string {
  const ratio = width / height;
  const known: Array<[string, number]> = [
    ['1:1', 1],
    ['4:5', 0.8],
    ['9:16', 0.5625],
    ['16:9', 1.7778],
    ['2:3', 0.6667],
  ];
  let best = known[0]!;
  for (const candidate of known) {
    if (Math.abs(candidate[1] - ratio) < Math.abs(best[1] - ratio)) best = candidate;
  }
  return best[0];
}

export async function reviewMediaHandler(
  job: Job,
  ctx: HandlerContext,
  vision?: VisionClient,
): Promise<void> {
  const contentItemId = String(job.payload.contentItemId ?? '');
  if (!contentItemId) throw new Error('review_media job has no contentItemId');

  const { rows } = await ctx.pool.query<ItemRow>(
    `select id, product_id, platform, format, body, title, hashtags, category,
            qc_results, product_artifact, status
       from content_items where id = $1`,
    [contentItemId],
  );
  const item = rows[0];
  if (!item) return;

  // Renders that produced a file, newest first.
  const { rows: assets } = await ctx.pool.query<{
    public_url: string | null;
    storage_path: string | null;
    mime_type: string;
    kind: string;
  }>(
    `select a.public_url, a.storage_path, a.mime_type, a.kind
       from renders r join assets a on a.id = r.output_asset_id
      where r.content_item_id = $1 and r.status = 'done' and r.quality = 'final'
      order by r.slide_index`,
    [contentItemId],
  );

  const video = assets.find((a) => a.mime_type.startsWith('video/'));
  if (!video) {
    // Images are covered by the existing visual gate at draft time; the
    // coherence gate is about motion, narration and the hook window.
    ctx.log('no video to review', { contentItemId, assets: assets.length });
    return;
  }

  const localPath = await materialise(video.public_url, video.storage_path);
  if (!localPath) {
    ctx.log('video could not be fetched for review', { contentItemId });
    return;
  }

  try {
    const probe = await probeVideo(localPath);
    const times = frameSampleTimes(probe.durationSeconds);
    const sampled = await sampleFrames(localPath, times);

    let frames: FrameObservation[] = [];
    if (sampled.length > 0) {
      const client = vision ?? new OpenAiVisionClient();
      frames = await client.describeFrames(sampled);
    }

    const { rows: productRows } = await ctx.pool.query<{ name: string }>(
      'select name from products where id = $1',
      [item.product_id],
    );

    const intent: CoherenceIntent = {
      body: item.body,
      script: null,
      keyTerms: keyTermsFor(item),
      format: item.format,
      durationSeconds: probe.durationSeconds,
      brandTerms: productRows[0]?.name ? [productRows[0].name] : [],
    };

    const coherence = runCoherenceQC({ intent, frames });
    // Built as the real types rather than cast into them. An `as never` here
    // would have hidden the two fields the gate actually needs — `kind`, which
    // selects the video-only rules, and `platform`, which selects the aspect
    // ratio it is checked against.
    const mediaProbe: MediaProbe = {
      kind: 'video',
      width: probe.width,
      height: probe.height,
      durationSeconds: probe.durationSeconds,
      frameLuminance: probe.frameLuminance,
      loudnessLufs: probe.loudnessLufs,
      truePeakDbtp: probe.truePeakDbtp,
    };
    const target: VisualTarget = {
      aspectRatio: aspectRatioOf(probe.width, probe.height),
      platform: item.platform,
      format: item.format,
    };
    const visual = runVisualQC(mediaProbe, target);

    // Merge into the stored verdict rather than replacing it: the copy, claims
    // and destination gates ran at draft time against inputs this job does not
    // have, and re-running them here would report `skipped` and lose them.
    const previous = item.qc_results?.gates ?? [];
    const merged: GateResult[] = [
      ...previous.filter((g) => g.gate !== 'coherence' && g.gate !== 'visual'),
      {
        gate: 'visual',
        status: visual.passed ? 'passed' : 'failed',
        summary: visual.summary,
        detail: visual,
        examined: probe.frameLuminance.length,
      },
      {
        gate: 'coherence',
        status:
          coherence.examined === 0
            ? 'skipped'
            : !coherence.passed
              ? 'failed'
              : coherence.findings.length > 0
                ? 'warning'
                : 'passed',
        summary: coherence.summary,
        detail: coherence,
        examined: coherence.examined,
      },
    ];

    const passed = merged.every((g) => g.status !== 'failed');

    await ctx.pool.query(
      `update content_items
          set qc_results = $2,
              media_observations = $3,
              status = case when $4 then status else 'failed' end
        where id = $1`,
      [
        contentItemId,
        JSON.stringify({ passed, gates: merged, ranAt: new Date().toISOString() }),
        JSON.stringify({ frames, sampledAt: times, durationSeconds: probe.durationSeconds }),
        passed,
      ],
    );

    ctx.log('media reviewed', {
      contentItemId,
      frames: frames.length,
      coherence: coherence.summary,
      passed,
    });
  } finally {
    await unlink(localPath).catch(() => undefined);
  }
}

/**
 * Get the rendered file onto local disk so ffmpeg can seek in it.
 *
 * Assets live on a CDN in production and on local disk in development, and this
 * job needs a path either way.
 */
async function materialise(
  publicUrl: string | null,
  storagePath: string | null,
): Promise<string | null> {
  const target = path.join(tmpdir(), `halyard-review-${Date.now()}.mp4`);

  if (publicUrl?.startsWith('http')) {
    const response = await fetch(publicUrl);
    if (!response.ok) return null;
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    return target;
  }

  const local = publicUrl ?? storagePath;
  if (!local) return null;
  const onDisk = local.startsWith('/dev-assets/')
    ? path.join(process.env.HALYARD_LOCAL_ASSET_DIR ?? '', local.replace('/dev-assets/', ''))
    : local;

  try {
    await writeFile(target, await readFile(onDisk));
    return target;
  } catch {
    return null;
  }
}
