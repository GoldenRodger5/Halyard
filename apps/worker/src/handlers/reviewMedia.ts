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
  runRetentionQC,
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
  vo_script: string | null;
  qc_results: {
    gates?: GateResult[];
    passed?: boolean;
    ranAt?: string;
    /** Written by the tts handler: what was actually said, in the finished mix. */
    audio?: { transcript?: string; openingSentence?: string };
  } | null;
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
/** Absolute change between consecutive samples. Empty in, empty out. */
export function consecutiveDeltas(series: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i += 1) out.push(Math.abs(series[i]! - series[i - 1]!));
  return out;
}

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
            vo_script, qc_results, product_artifact, status
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

  /**
   * Everything that will actually be published, not only what was rendered.
   *
   * `publish` sends `render_ids` **and** `attached_asset_ids`. This query only
   * ever walked `renders`, so an asset the operator attached from the library
   * was examined by nothing — and the comment that used to sit here said
   * "images are covered by the existing visual gate at draft time", which is
   * false: no caller supplies `visual` to `runAllGates`, which is exactly what
   * the Auditor's `gate.input_never_supplied` has been reporting.
   *
   * Dimensions come from the `assets` row rather than from downloading the
   * file. That is enough for the rules that matter on a still — aspect ratio
   * against the platform, and carousel consistency — and an asset with no
   * recorded dimensions is reported as unexamined rather than passed.
   */
  const { rows: attached } = await ctx.pool.query<{
    id: string;
    width: number | null;
    height: number | null;
    mime_type: string;
  }>(
    `select a.id, a.width, a.height, a.mime_type
       from content_items ci
       join assets a on a.id = any(ci.attached_asset_ids)
      where ci.id = $1 and a.archived_at is null`,
    [contentItemId],
  );

  const video = assets.find((a) => a.mime_type.startsWith('video/'));
  if (!video) {
    /**
     * No video, but there may well be stills — and returning here left the item
     * with no media gate at all, which reads as "nothing wrong" rather than
     * "nothing looked at".
     */
    await reviewStills(ctx, contentItemId, item, attached);
    ctx.log('no video to review; stills examined', {
      contentItemId,
      renders: assets.length,
      attached: attached.length,
    });
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
      // The script was always available on the item and was passed as null, so
      // every rule comparing what was said against what was scripted compared
      // against nothing.
      script: item.vo_script,
      keyTerms: keyTermsFor(item),
      format: item.format,
      durationSeconds: probe.durationSeconds,
      brandTerms: productRows[0]?.name ? [productRows[0].name] : [],
    };

    /**
     * What the finished mix actually says.
     *
     * `runCoherenceQC` has always accepted an optional `audio`, and nothing
     * ever passed one — so `silent_open_says_nothing`, `narration_shows_nothing`
     * and `opening_line_buries_it` could not fire. Three rules, written and
     * unreachable, in a gate added specifically to catch the class of bug where
     * a check exists and never runs.
     *
     * The transcript comes from the tts handler, which had to produce it for the
     * audio gate anyway. Absent when the item has no voiceover, which is a real
     * state and reported as `not_measured` rather than as a pass.
     */
    const spoken = item.qc_results?.audio;
    const audio =
      spoken?.transcript && spoken.openingSentence
        ? { transcript: spoken.transcript, openingSentence: spoken.openingSentence }
        : null;

    const coherence = runCoherenceQC({ intent, frames, audio });
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

    // The attached stills, which `publish` will send alongside this render.
    const stills = examineStills(attached, item);

    /**
     * Retention, which had no caller at all.
     *
     * 310 lines and 171 lines of tests, reachable only from its own test file —
     * the same shape `canStatePublicly` and `markOutputConsumed` had. Every
     * video Halyard has ever rendered skipped it.
     *
     * This job is the right home and always was: retention is measured from the
     * finished file, so it cannot run at copy time, and the two inputs its
     * opening and pattern-interrupt rules need — per-frame luminance and
     * duration — are already probed here for `visual`.
     *
     * The two rules it cannot run are the frame-1 thumbnail checks (no OCR) and
     * the loop check (no first-to-last similarity). Those are **named** in
     * `unmeasured` and drop the gate to `warning` rather than passing quietly,
     * because a skipped check is not a passed check.
     */
    const retention = runRetentionQC(
      {
        fps: probe.fps ?? 30,
        durationSeconds: probe.durationSeconds,
        frameLuminance: probe.frameLuminance,
        /**
         * The motion signal, supplied explicitly rather than derived from the
         * mean.
         *
         * `RetentionProbe.frameDelta` has always been an optional input that
         * `firstSubstantiveSecond` and `longestStaticStretch` prefer over
         * deltas derived from `frameLuminance`. Nothing supplied it, so both
         * rules ran on mean-luminance change — which cannot see a light card
         * whose dark text is being swapped. On the four fixture renders the
         * mean moves 0.004 across a full scene change, under the 0.01 that
         * counts as "the same picture", while the tonal range moves 0.294.
         *
         * The consequence was not academic: the pattern-interrupt rule is an
         * **error**, and `review_media` fails a content item on an errored
         * gate, so every render over twenty seconds was about to be rejected by
         * its own pipeline. See `DECISIONS.md` §74.
         */
        frameDelta: consecutiveDeltas(probe.frameContentRange),
      },
      {
        platform: item.platform,
        // TikTok and Reels reward replays. Declared so the loop rule reports as
        // unmeasured where it matters rather than being silently irrelevant.
        loopReady: item.platform === 'tiktok' || item.platform === 'instagram',
      },
    );

    // Merge into the stored verdict rather than replacing it: the copy, claims
    // and destination gates ran at draft time against inputs this job does not
    // have, and re-running them here would report `skipped` and lose them.
    const previous = item.qc_results?.gates ?? [];
    const merged: GateResult[] = [
      ...previous.filter(
        (g) => g.gate !== 'coherence' && g.gate !== 'visual' && g.gate !== 'retention',
      ),
      {
        gate: 'visual',
        /**
         * Examining nothing is not a pass.
         *
         * `frameLuminance` was empty on every render for the life of this
         * codebase — `sampleLuminance` read ffmpeg's stderr while
         * `metadata=print:file=-` writes to stdout — so the luminance rules
         * never ran and this gate reported `passed` with `examined: 0` anyway.
         * The sampling is fixed; this is the guard that would have made the
         * failure visible instead of green, and it stays.
         */
        /**
         * The video *and* any attached stills.
         *
         * `publish` sends both. Examining only the render meant an item with a
         * video and an attached image published the image with no gate having
         * looked at it — §93 one branch over.
         */
        status:
          probe.frameLuminance.length === 0
            ? 'skipped'
            : visual.passed && !stills.findings.some((f) => f.severity === 'error')
              ? stills.unexamined.length > 0 || stills.findings.length > 0
                ? 'warning'
                : 'passed'
              : 'failed',
        summary:
          probe.frameLuminance.length === 0
            ? 'No frames could be sampled from the render, so nothing was measured.'
            : stills.total > 0
              ? `${visual.summary} ${stills.measurable} attached still(s) checked${
                  stills.unexamined.length > 0
                    ? `, ${stills.unexamined.length} with no recorded dimensions and not examined`
                    : ''
                }.`
              : visual.summary,
        detail: { ...visual, stills },
        // Frames of the render plus the stills that were actually measured.
        examined: probe.frameLuminance.length + stills.measurable,
      },
      {
        gate: 'retention',
        /**
         * `warning`, not `passed`, while anything went unmeasured.
         *
         * A green retention tick over a video whose thumbnail was never looked
         * at is exactly the class of claim this codebase spends its comments
         * preventing, and `runAllGates` already learned it once: a skipped
         * check is not a passed check.
         */
        /**
         * Never `failed`, and that is a deliberate limit rather than a
         * softened rule.
         *
         * `review_media` sets `content_items.status = 'failed'` on any errored
         * gate. This gate had **no caller at all** until now, so switching it
         * on at error severity would silently begin rejecting content on a
         * rule nothing has ever run — and it does: `ScalingMath.mp4` is
         * genuinely static for twenty-four seconds and raises
         * `retention.no_pattern_interrupt` under either signal.
         *
         * That finding is real and is recorded in full below. Whether a static
         * template should *block* publication is a quality-system policy
         * question, and `DECISIONS.md` §62 already declined to make exactly
         * that call for the media gates — "wiring a real caller means deciding
         * which items must have media QC before approval, and that is a change
         * to the quality system". The same reasoning applies here.
         *
         * So: measured, stored, visible, and not blocking until a person says
         * it should. Recorded under "Needs a human" in `STATUS.md`.
         */
        status:
          !retention.passed || retention.findings.length > 0 || retention.unmeasured.length > 0
            ? 'warning'
            : 'passed',
        summary: retention.summary,
        detail: retention,
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

    /**
     * §151. Merged into `qc_results`, not written over it.
     *
     * This was `set qc_results = $2`, which replaces the whole object with
     * `{passed, gates, ranAt}` — and `tts` stores the transcript, the delivery
     * measurements and **the caption cues** under a sibling `audio` key. Every
     * one of those was destroyed a few minutes after being measured.
     *
     * The captions are the sharp end: `loadVoiceover` reads
     * `qc_results.audio.captions`, so any render after this point — a retry, a
     * regenerate, a second platform — burns a video with no captions onto an
     * asset nothing else would flag. §119 fixed the gate list this way and left
     * the object around it still being overwritten.
     */
    await ctx.pool.query(
      `update content_items
          set qc_results = coalesce(qc_results, '{}'::jsonb) || $2::jsonb,
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
      retention: retention.summary,
      retentionUnmeasured: retention.unmeasured,
      passed,
    });

    /**
     * §165. A failing verdict is no longer the end of the item's life.
     *
     * This used to be it: `status = 'failed'` above, and a person dealt with
     * it. The controller now gets a chance first — it diagnoses what failed,
     * applies the smallest correction that addresses it, and re-enters this
     * same pipeline. It cannot approve or publish anything, and a corrected
     * item lands back in `pending_approval` exactly where it would have.
     *
     * Enqueued for a *passing* item too, and deliberately: the controller is
     * what writes the iteration history, so an item that passed first time
     * still gets its iteration 0 recorded. Without that the history exists only
     * for content that failed, and "this passed immediately" becomes
     * indistinguishable from "this was never looked at".
     */
    await ctx.enqueue(
      'correct_content',
      { contentItemId },
      /*
       * A *stable* dedupe key. `jobs_dedupe_idx` is unique on `dedupe_key`
       * while a job is `queued` or `running`, so this is what stops two
       * controllers working the same item at once — and the `Date.now()` that
       * used to be here made every key unique, defeating precisely the
       * protection the index exists to give. Once the job is `done` the partial
       * index no longer covers it, so a later review enqueues a fresh one.
       */
      { dedupeKey: `correct:${contentItemId}`, priority: 40 },
    );
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

/**
 * The visual gate over stills, from the dimensions already on the asset rows.
 *
 * This is the half of media QC that never existed. `review_media` walked
 * `renders` only and returned early when it found no video, behind a comment
 * claiming stills were "covered by the existing visual gate at draft time" —
 * they were not, and are not: no caller supplies `visual` to `runAllGates`,
 * which is what the Auditor's `gate.input_never_supplied` reports.
 *
 * Meanwhile `publish` sends `render_ids` **and** `attached_asset_ids`, so an
 * operator-attached image reached a platform without any gate having looked at
 * it.
 *
 * No file is downloaded. `assets.width`/`height` are enough for the rules that
 * apply to a still — aspect ratio against the platform, and consistency across
 * a carousel — and an asset with no recorded dimensions is reported as
 * **unexamined**, never as passed. Examining nothing is not a pass.
 */

export interface StillOutcome {
  /** Stills attached at all, video excluded. */
  total: number;
  /** How many had usable dimensions and were actually checked. */
  measurable: number;
  /** Ids of stills with no recorded dimensions. Never counted as passed. */
  unexamined: string[];
  findings: ReturnType<typeof runVisualQC>['findings'];
}

/**
 * Examine attached stills from the dimensions already on their `assets` rows.
 *
 * Shared by both paths deliberately. The first version of this ran only when
 * there was **no video**, so an item with a rendered video *and* an attached
 * image examined the video and silently ignored the image — the same gap §93
 * closed, reintroduced one branch over. `publish` sends both regardless of
 * which one is present.
 *
 * No file is downloaded. `assets.width`/`height` cover the rules that apply to
 * a still — aspect ratio against the platform, and consistency across a
 * carousel — and an asset with no recorded dimensions is returned as
 * unexamined rather than examined-and-fine.
 */
export function examineStills(
  attached: Array<{ id: string; width: number | null; height: number | null; mime_type: string }>,
  item: { platform: string; format: string },
): StillOutcome {
  const stills = attached.filter((a) => !a.mime_type.startsWith('video/'));
  const measurable = stills.filter((a) => (a.width ?? 0) > 0 && (a.height ?? 0) > 0);
  const unexamined = stills
    .filter((a) => !((a.width ?? 0) > 0 && (a.height ?? 0) > 0))
    .map((a) => a.id);

  const probes: MediaProbe[] = measurable.map((a) => ({
    kind: 'image',
    width: a.width!,
    height: a.height!,
  }));

  const findings = probes.flatMap((probe, index) =>
    runVisualQC(probe, {
      aspectRatio: aspectRatioOf(probe.width, probe.height),
      platform: item.platform,
      format: item.format,
      // Siblings, so the carousel-consistency rule can actually compare.
      carouselSiblings: probes.filter((_, i) => i !== index),
    }).findings,
  );

  return { total: stills.length, measurable: measurable.length, unexamined, findings };
}

export async function reviewStills(
  ctx: HandlerContext,
  contentItemId: string,
  item: { platform: string; format: string; qc_results: { gates?: GateResult[] } | null },
  attached: Array<{ id: string; width: number | null; height: number | null; mime_type: string }>,
): Promise<void> {
  const outcome = examineStills(attached, item);
  if (outcome.total === 0) return;
  const { findings, unexamined, measurable } = outcome;

  const failed = findings.some((f) => f.severity === 'error');
  const previous = item.qc_results?.gates ?? [];
  const merged: GateResult[] = [
    ...previous.filter((g) => g.gate !== 'visual'),
    {
      gate: 'visual',
      /**
       * Never a clean pass while something went unmeasured, for the same reason
       * the retention gate never claims one: an asset with no recorded
       * dimensions was not checked, and a green tick beside it would say it was.
       */
      status: failed
        ? 'failed'
        : findings.length > 0 || unexamined.length > 0
          ? 'warning'
          : 'passed',
      summary:
        unexamined.length > 0
          ? `${measurable} still(s) checked; ${unexamined.length} had no recorded dimensions and were not examined.`
          : `${measurable} still(s) checked.`,
      detail: { findings, unexamined },
      examined: measurable,
    },
  ];

  // §151, as above: merged, so the transcript and caption cues `tts` stored
  // beside the gate list survive this write.
  await ctx.pool.query(
    `update content_items
        set qc_results = coalesce(qc_results, '{}'::jsonb) || $2::jsonb,
            status = case when $3 then status else 'failed' end
      where id = $1`,
    [
      contentItemId,
      JSON.stringify({
        passed: merged.every((g) => g.status !== 'failed'),
        gates: merged,
        ranAt: new Date().toISOString(),
      }),
      !failed,
    ],
  );
}
