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
  scoreCreative,
  OpenAiCriticClient,
  type CriticClient,
  OpenAiVisionClient,
  runCoherenceQC,
  cutsPerMinuteFor,
  POST_FORMAT_CATALOG,
  runCreativeQC,
  runRetentionQC,
  bandFor,
  channelForPlatform,
  formatById,
  PLATFORM_STRATEGIES,
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
  account_id?: string;
  /** §234. Accessibility is part of the creative acceptance suite. */
  alt_text?: string | null;
  /** §205. The recorded creative plan: type, beat count, evidence, rationale. */
  creative?: { type?: string; beats?: number; evidence?: string[] } | null;
  /** §413. The catalogue format — `history`, `quiz`, `transformation`. */
  post_format?: string | null;
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
/**
 * The larger of two change signals, position by position. §414.
 *
 * Uses the shorter length when they disagree, which cannot happen for two
 * derivations of the same sample list but is the safe answer if it ever does.
 */
export function eitherSignalMoved(a: number[], b: number[]): number[] {
  const n = Math.min(a.length, b.length);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(Math.max(a[i]!, b[i]!));
  return out;
}

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
  /** §275. Injected in tests; the real one is built here when absent. */
  critic?: CriticClient,
): Promise<void> {
  const contentItemId = String(job.payload.contentItemId ?? '');
  if (!contentItemId) throw new Error('review_media job has no contentItemId');

  const { rows } = await ctx.pool.query<ItemRow>(
    `select id, product_id, platform, format, body, title, hashtags, category,
            vo_script, qc_results, product_artifact, status,
            account_id, alt_text,
            /* §413. Which catalogue format this is, so the gates that only
               apply to product-grounded pieces can tell. */
            post_format,
            /* §205. The creative gate reads the plan, not the pixels. */
            generation_meta -> 'creative' as creative
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
   * §448. What frame one actually says.
   *
   * `retention.first_frame_words` has reported `unmeasured` on every video this
   * system has ever made, and the reason recorded for it is "no OCR". No OCR is
   * needed: the words on frame one are the first beat's text, and they have
   * been sitting in `renders.input_props` the entire time. This is the same
   * shape the decision record keeps finding — a rule that is correct, asked a
   * question nothing supplied an answer to, while the answer was already
   * stored.
   *
   * Read from the props rather than from the file because it is *exact*. OCR
   * would recover the same string lossily and could only ever disagree with the
   * thing that was actually drawn.
   *
   * `firstFrameContrast` is deliberately left unsupplied. It could be modelled
   * from the beat's `backgroundLuminance` and the palette, and that would be a
   * calculation dressed as a measurement — §414 is the standing lesson about
   * exactly that, where a frame-mean signal could not see a light card with
   * dark text. It stays honestly unmeasured.
   */
  const { rows: openingRows } = await ctx.pool.query<{ text: string | null }>(
    `select r.input_props -> 'beats' -> 0 ->> 'text' as text
       from renders r
      where r.content_item_id = $1
        and r.status = 'done'
        and r.input_props -> 'beats' -> 0 ->> 'text' is not null
      order by r.created_at desc
      limit 1`,
    [contentItemId],
  );
  const openingText = openingRows[0]?.text ?? null;

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

  /**
   * The beats that were actually rendered, and whether footage was on offer.
   * §205.
   *
   * `input_props.beats` is what `generate` wrote and what Remotion drew, so it
   * is the artifact's own structure rather than a restatement of intent. The
   * capture question is separate and is the one the gate turns on: a piece of
   * card-only creative is only a defect when there was something better to
   * show, and that fact lives in `capture_runs`, not in the plan.
   */
  const { rows: renderProps } = await ctx.pool.query<{ input_props: Record<string, unknown> }>(
    `select r.input_props
       from renders r
      where r.content_item_id = $1 and r.status = 'done' and r.quality = 'final'
      order by r.created_at desc
      limit 1`,
    [contentItemId],
  );

  const { rows: captureRows } = await ctx.pool.query<{ n: string }>(
    /*
     * Bounded by age for the same reason `generate` bounds it: footage of an
     * interface two months of releases old is a claim about a product that no
     * longer looks like that, so its absence is not a defect.
     */
    `select count(*)::text as n
       from capture_runs
      where product_id = $1 and ok = true and video_asset_id is not null
        and started_at > now() - interval '30 days'`,
    [item.product_id],
  );
  const footageAvailable = Number(captureRows[0]?.n ?? '0') > 0;

  const { rows: recentCreative } = await ctx.pool.query<{ type: string }>(
    `select generation_meta -> 'creative' ->> 'type' as type
       from content_items
      where account_id = $1 and id <> $2
        and generation_meta -> 'creative' ->> 'type' is not null
      order by created_at desc limit 4`,
    [item.account_id ?? null, contentItemId],
  );

  /**
   * §234. What this piece was directed to be, and what the account did last.
   *
   * The creative gate judges repetition of language, opening and typography
   * as well as treatment, because two posts can use different treatments and
   * still be set in the same type, open the same way and cut in the same
   * language — which is the repetition a viewer actually notices. Absent
   * fields report `unmeasured` rather than passing.
   */
  const { rows: briefRows } = await ctx.pool.query<{
    language: string | null;
    typography: string | null;
    opening: string | null;
    target_seconds: string | null;
  }>(
    `select b.visual_direction ->> 'language' as language,
            b.visual_direction ->> 'typography' as typography,
            b.visual_direction ->> 'opening' as opening,
            b.target_seconds
       from creative_briefs b
       join content_items ci on ci.brief_id = b.id
      where ci.id = $1`,
    [contentItemId],
  );
  const brief = briefRows[0];

  const { rows: recentDirection } = await ctx.pool.query<{
    language: string | null;
    typography: string | null;
    opening: string | null;
  }>(
    `select b.visual_direction ->> 'language' as language,
            b.visual_direction ->> 'typography' as typography,
            b.visual_direction ->> 'opening' as opening
       from creative_briefs b
       join content_items ci on ci.brief_id = b.id
      where b.account_id = $1 and ci.id <> $2
      order by b.created_at desc limit 4`,
    [item.account_id ?? null, contentItemId],
  );

  const { rows: variantRows } = await ctx.pool.query<{ pacing: string }>(
    `select pacing from platform_variants
      where content_item_id = $1 limit 1`,
    [contentItemId],
  );

  /* Loudness and the music decision were measured by `tts` and recorded on the
     item. Read back rather than re-measured: one measurement, one place. */
  const audio = (item.qc_results as { audio?: { lufs?: number; hadMusic?: boolean; musicSkipped?: string | null } } | null)
    ?.audio;

  const plannedBeats = Array.isArray(renderProps[0]?.input_props?.beats)
    ? (renderProps[0]!.input_props.beats as Array<Record<string, unknown>>)
    : [];

  const creativeResult = runCreativeQC({
    creativeType: item.creative?.type ?? 'unknown',
    platform: item.platform,
    footageAvailable,
    /*
     * §413. Only a product-grounded format is expected to show the product.
     *
     * `unused_product_footage` is an error and failed the piece, on every
     * format. Live, a `history` piece about why bread goes stale was failed for
     * not showing RecipeFix footage — where showing it would have been the
     * defect. Unknown formats keep the old behaviour rather than silently
     * switching the rule off.
     */
    aboutTheProduct: item.post_format
      ? (POST_FORMAT_CATALOG[item.post_format as keyof typeof POST_FORMAT_CATALOG]?.factuality ??
          'product') === 'product'
      : true,
    recentTypes: recentCreative.map((r) => r.type),
    /* §234. The creative record, so the gate judges more than beat structure. */
    visualLanguage: brief?.language ?? null,
    typography: brief?.typography ?? null,
    opening: brief?.opening ?? null,
    recentLanguages: recentDirection.map((r) => r.language).filter((v): v is string => Boolean(v)),
    recentTypography: recentDirection.map((r) => r.typography).filter((v): v is string => Boolean(v)),
    recentOpenings: recentDirection.map((r) => r.opening).filter((v): v is string => Boolean(v)),
    ...(brief?.target_seconds ? { durationSeconds: Number(brief.target_seconds) } : {}),
    ...(variantRows[0]?.pacing
      ? { targetCutsPerMinute: cutsPerMinuteFor(variantRows[0].pacing as never) }
      : {}),
    ...(audio ? { hasMusic: Boolean(audio.hadMusic), musicSkippedReason: audio.musicSkipped ?? null } : {}),
    ...(typeof audio?.lufs === 'number' ? { lufs: audio.lufs } : {}),
    altText: (item.alt_text as string | null) ?? null,
    motions: plannedBeats
      .map((b) => b.motion as { entrance?: string; camera?: string; transitionOut?: string } | undefined)
      .filter((m): m is { entrance: string; camera: string; transitionOut: string } => Boolean(m?.camera)),
    beats: plannedBeats.map((b) => {
      const content = (b.content ?? {}) as Record<string, unknown>;
      const words = Object.values(content)
        .filter((v): v is string => typeof v === 'string')
        .join(' ')
        .trim();
      return {
        role: String(b.role ?? ''),
        emphasis: (b.emphasis as 'quick' | 'normal' | 'hold') ?? 'normal',
        hasMedia: Boolean(b.media),
        wordCount: words ? words.split(/\s+/).length : 0,
      };
    }),
  });

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

    /**
     * §275. The critic looks at the same frames, for a different reason.
     *
     * A second client rather than a second question to the describer, because
     * the describer is forbidden from judging and must stay that way — the
     * coherence gate needs a witness, not a reviewer, and a describer that
     * editorialises corrupts the evidence every other gate reads.
     *
     * The whole set goes in one call. The defects this exists to catch are
     * properties of the *set* — sameness, flat emphasis, interchangeable
     * layouts — and a per-frame critic would find every frame acceptable and
     * miss all of them, which is exactly what the per-frame rules did.
     *
     * Never fatal: an outage returns no findings and the review proceeds. The
     * critic improves a verdict, it does not gate one.
     */
    let criticVerdict = null as Awaited<ReturnType<CriticClient['critique']>> | null;
    if (sampled.length > 0) {
      try {
        const criticClient = critic ?? new OpenAiCriticClient();
        criticVerdict = await criticClient.critique(
          sampled.map((frame, i) => ({ ...frame, visibleText: frames[i]?.visibleText ?? [] })),
        );
      } catch (err) {
        ctx.log('critic unavailable, review continues without it', {
          contentItemId,
          reason: (err as Error).message,
        });
      }
    }

    const { rows: productRows } = await ctx.pool.query<{ name: string }>(
      'select name from products where id = $1',
      [item.product_id],
    );

    /**
     * §409. What this piece asked its image model to photograph.
     *
     * The oracle for "does the picture make sense with the piece". Not derived
     * from the script — a post about gluten illustrated with a loaf of bread is
     * the job done right, and any comparison against the spoken words calls
     * that a mismatch. Halyard chose these subjects and sent them to a
     * generator, so what each frame was *supposed* to show is known exactly.
     *
     * Empty when nothing was recorded, and the gate then reports itself
     * unmeasured rather than passing — which is the rule everywhere else here.
     */
    /*
     * §414. From the render's own beats as well as the attached assets.
     *
     * Only the hero is added to `attached_asset_ids`; the per-beat photographs
     * are referenced by `backgroundAssetId` on the render props, which is where
     * the frames actually come from. Reading attachments alone found one
     * subject out of five and would have measured the video against a picture
     * it never shows.
     */
    const { rows: subjectRows } = await ctx.pool.query<{ subject: string }>(
      `select distinct a.subject
         from assets a
        where a.subject is not null
          and (
            a.id in (
              select unnest(ci.attached_asset_ids) from content_items ci where ci.id = $1
            )
            or a.id::text in (
              select jsonb_array_elements(r.input_props -> 'beats') ->> 'backgroundAssetId'
                from renders r
               where r.content_item_id = $1
                 and jsonb_typeof(r.input_props -> 'beats') = 'array'
            )
          )`,
      [item.id],
    );
    const expectedSubjects = subjectRows.map((r) => r.subject);

    const intent: CoherenceIntent = {
      body: item.body,
      expectedSubjects,
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
    const strategy =
      PLATFORM_STRATEGIES[item.platform as keyof typeof PLATFORM_STRATEGIES] ?? null;
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
        /*
         * §414. Whichever signal can see this content — not one of them.
         *
         * §74's tonal range fixed the card case: a light card with dark text
         * barely moves `YAVG` while `YMIN` drops from 85 to 10. It breaks
         * completely on a photograph. `signalstats` reports `YMIN=0 YMAX=255`
         * on every frame of a real picture, so the range saturates at 1.0, its
         * consecutive delta is **always exactly zero**, and the video reads as
         * perfectly static however much the picture changes.
         *
         * Live, on the first piece with a photograph per beat: four completely
         * different images, mean luminance 0.067 to 0.348 to 0.170 to 0.252,
         * and the gate reported "longest static 19.3s" — the entire runtime.
         * The pattern-interrupt rule is an error and `review_media` fails an
         * item on an errored gate, so §407's whole point was about to be
         * rejected by the check that exists to demand it.
         *
         * Neither proxy is right alone and each is right where the other is
         * blind, so a beat changed if **either** says so. Taking the larger is
         * not a fudge: they measure different properties of the same event, and
         * a picture that changed has changed whichever one noticed.
         */
        /*
         * §448. Spread, so a piece whose composition carries no beats — a quiz,
         * a walkthrough — leaves the key absent and the rule keeps reporting
         * itself unmeasured. Supplying zero there would fail every quiz for an
         * empty thumbnail it does not have.
         */
        ...(openingText
          ? {
              firstFrameWordCount: openingText.trim().split(/\s+/).filter(Boolean).length,
            }
          : {}),
        frameDelta: eitherSignalMoved(
          consecutiveDeltas(probe.frameContentRange),
          consecutiveDeltas(probe.frameLuminance),
        ),
      },
      {
        platform: item.platform,
        /**
         * §445. Derived from what the platform counts, not from a hand list.
         *
         * `loopReady: platform === 'tiktok' || platform === 'instagram'` was
         * correct and was a second place the same fact lived — the shape
         * gotcha 1 describes. A platform added to `PLATFORM_STRATEGIES` with
         * `completion` as its signal now gets the loop rule automatically,
         * rather than getting it whenever somebody remembers this line.
         */
        loopReady: strategy?.primarySignal === 'completion' || strategy?.primarySignal === 'saves',
        /*
         * §445. Twelve on a completion-ranked platform rather than fifteen.
         * The research ceiling is one interrupt every 10-15s; where finishing
         * *is* the ranking signal, the tighter end of that band is the one
         * that matters and the looser one is a rule that rarely fires.
         */
        ...(strategy?.primarySignal === 'completion'
          ? { maxSecondsBetweenInterrupts: 12 }
          : {}),
        /**
         * §439. How long this should have run, on this platform.
         *
         * Spread rather than assigned so an unknown platform or an unmapped
         * channel leaves the key *absent*, which is what makes the rule report
         * itself unmeasured instead of approving any length. Gotcha 6 is the
         * standing lesson and `retention.length_band` is written for exactly
         * this shape.
         *
         * The pace comes from the catalogue format when there is one; a piece
         * with no `post_format` — an older item, an ad-hoc render — still gets
         * the platform's standard band, which is the right default because the
         * band is the platform's fact and the pace is only a modifier on it.
         */
        ...(() => {
          const channel = channelForPlatform(item.platform, item.format);
          if (!channel) return {};
          const format = item.post_format ? formatById(item.post_format) : null;
          const band = bandFor(item.platform, channel, format?.pace ?? 'standard');
          return band ? { band } : {};
        })(),
      },
    );

    // Merge into the stored verdict rather than replacing it: the copy, claims
    // and destination gates ran at draft time against inputs this job does not
    // have, and re-running them here would report `skipped` and lose them.
    const previous = item.qc_results?.gates ?? [];
    /**
     * §275. The critic's gate.
     *
     * `warning` when it raised something, `passed` when it looked and found
     * nothing, `skipped` when it never ran — three distinct states, because a
     * critic that could not run has not endorsed anything. It is never
     * `failed`: craft is a judgement and the operator owns taste.
     */
    const criticGate: GateResult = {
      gate: 'critic',
      status:
        criticVerdict === null || criticVerdict.examined === 0
          ? 'skipped'
          : criticVerdict.findings.length > 0
            ? 'warning'
            : 'passed',
      /*
       * §412. A critic that errored says so. It reported "No frames were
       * available" while every one of its requests was returning 400.
       */
      summary: criticVerdict?.summary ?? 'The critic did not run.',
      detail: { findings: criticVerdict?.findings ?? [] },
      examined: criticVerdict?.examined ?? 0,
    };

    const merged: GateResult[] = [
      criticGate,
      ...previous.filter(
        (g) =>
          g.gate !== 'coherence' &&
          g.gate !== 'visual' &&
          g.gate !== 'retention' &&
          g.gate !== 'critic' &&
          g.gate !== 'creative',
      ),
      /**
       * §205. The creative gate, beside the technical ones.
       *
       * It runs here rather than at draft time because the question it answers
       * — did this piece use the best material it had — needs the rendered
       * beats, and because a defect it raises maps to a re-plan, which is a
       * correction the existing controller already knows how to apply.
       */
      {
        gate: 'creative' as const,
        /*
         * No beats is `skipped`, never `passed`. An item whose render carried
         * no plan — an image post, or a video rendered before §203 — has not
         * been examined by this gate, and reporting a tick would be the exact
         * failure `examined` exists to prevent. `creativeResult.unmeasured`
         * rides along in `detail` naming the individual rules that did not run.
         */
        status:
          plannedBeats.length === 0
            ? ('skipped' as const)
            : creativeResult.passed
              ? creativeResult.findings.length > 0
                ? ('warning' as const)
                : ('passed' as const)
              : ('failed' as const),
        summary:
          plannedBeats.length === 0
            ? 'No creative plan on this render; nothing examined.'
            : creativeResult.summary,
        detail: creativeResult,
        examined: plannedBeats.length,
      },
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
    /**
     * §269. The scorecard, assembled from what the gates already found.
     *
     * Spec §14.5. Every gate reports on its own subject and nothing reads them
     * as one verdict, so an operator sees a row of ticks and no sense of
     * whether the piece is any good. This groups the findings by the dimension
     * an operator would act on and keeps each one's verdict separate, because
     * "no single aggregate score may hide a hard failure".
     *
     * Stored beside the gates rather than replacing them: the gates are the
     * evidence and this is the reading of it.
     */
    const scorecard = scoreCreative({
      findings: merged.flatMap((gate) =>
        ((gate.detail as { findings?: Array<{ rule?: string; severity?: string; message?: string }> })
          ?.findings ?? [])
          .filter((f) => typeof f.rule === 'string')
          .map((f) => ({
            rule: f.rule!,
            severity: f.severity === 'error' ? ('error' as const) : ('warning' as const),
            message: f.message ?? '',
          })),
      ),
      unmeasuredRules: retention.unmeasured,
      /*
       * Left null rather than guessed. `verifyPayoff` runs at draft time on the
       * hook stage and its verdict is not carried onto the item, so from here
       * it is genuinely unknown — and unknown must not read as delivered.
       */
      payoffDelivered: null,
      hasCta: null,
      novelty: null,
    });

    await ctx.pool.query(
      `update content_items
          set qc_results = coalesce(qc_results, '{}'::jsonb) || $2::jsonb,
              media_observations = $3,
              status = case when $4 then status else 'failed' end
        where id = $1`,
      [
        contentItemId,
        JSON.stringify({
          passed,
          gates: merged,
          scorecard,
          ranAt: new Date().toISOString(),
        }),
        JSON.stringify({ frames, sampledAt: times, durationSeconds: probe.durationSeconds }),
        passed,
      ],
    );

    ctx.log('media reviewed', {
      contentItemId,
      score: scorecard.summary,
      critic: criticGate.summary,
      weakest: scorecard.dimensions
        .filter((d) => d.status === 'fail' || d.status === 'warn')
        .map((d) => d.dimension),
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
