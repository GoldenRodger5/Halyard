/**
 * The media review job, against a real Postgres and a real rendered file.
 *
 * The unit tests in `qc/coherence.test.ts` cover the verdict logic. These cover
 * the part that has repeatedly been the actual bug in this codebase: whether the
 * thing runs at all, and whether a path that examined nothing reports honestly.
 *
 * The vision client is scripted — describing frames costs a model call, and the
 * question here is the wiring, not the describer.
 */
import { existsSync } from 'node:fs';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import type { FrameObservation, GateResult, VisionClient } from '@halyard/core';
import { aspectRatioOf, keyTermsFor, reviewMediaHandler } from './handlers/reviewMedia.js';
import { frameSampleTimes, sampleFrames } from './video.js';
import type { HandlerContext, Job } from './poller.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

const VIDEO = '.render-output/video/SubstitutionExplainer.mp4';
const hasVideo = existsSync(VIDEO);

let pool: pg.Pool;
let accountId: string;
let templateId: string;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('review-media', 6);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')`,
  );
  const { rows } = await pool.query<{ id: string }>(
    `insert into social_accounts (product_id, platform, persona, handle, capability_state)
     values ('recipefix','tiktok','brand','@recipefix','draft_only') returning id`,
  );
  accountId = rows[0]!.id;

  // Renders reference a template row. The isolated database has migrations but
  // no seed, so this test owns its fixture rather than depending on seed.sql.
  const { rows: templates } = await pool.query<{ id: string }>(
    `insert into templates (id, renderer, format, aspect_ratio, props_schema, enabled)
     values ('review_test_template','remotion','video','9:16','{}',true)
     returning id`,
  );
  templateId = templates[0]!.id;
}, 120_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from renders');
  await pool.query('delete from content_items');
  await pool.query('delete from assets');
  await pool.query('delete from jobs');
});

function context(): HandlerContext & { logs: string[]; enqueued: string[] } {
  const logs: string[] = [];
  const enqueued: string[] = [];
  return {
    pool,
    workerId: 'test',
    logs,
    enqueued,
    log: (message: string) => logs.push(message),
    enqueue: async (kind: string) => {
      enqueued.push(kind);
    },
  } as unknown as HandlerContext & { logs: string[]; enqueued: string[] };
}

const job = (contentItemId: string): Job =>
  ({
    id: 'j1',
    kind: 'review_media',
    payload: { contentItemId },
    attempts: 1,
    max_attempts: 2,
    dedupe_key: null,
  }) as Job;

/** A describer that reports whatever the test tells it to have seen. */
function scriptedVision(frames: FrameObservation[]): VisionClient {
  return { describeFrames: async () => frames };
}

async function seedItem(over: Record<string, unknown> = {}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into content_items (product_id, account_id, platform, persona, format, category, body, hashtags, status, qc_results)
     values ('recipefix',$4,'tiktok','brand','video','education',$1,$2,'pending_approval',$3)
     returning id`,
    [
      String(over.body ?? 'Swap butter for oil and the crumb changes.'),
      (over.hashtags as string[]) ?? ['substitution'],
      JSON.stringify(
        over.qc_results ?? {
          passed: true,
          gates: [{ gate: 'copy', status: 'passed', summary: 'clean', detail: null }],
          ranAt: new Date().toISOString(),
        },
      ),
      accountId,
    ],
  );
  return rows[0]!.id;
}

/** Attach a real rendered video to an item, as a completed final render. */
async function attachVideo(contentItemId: string, filePath: string): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into assets (kind, mime_type, storage_path, public_url, width, height)
     values ('generated','video/mp4',$1,$1,1080,1920) returning id`,
    [filePath],
  );
  await pool.query(
    `insert into renders (content_item_id, template_id, renderer, input_props, quality, status, output_asset_id, slide_index)
     values ($1,$3,'remotion','{}','final','done',$2,0)`,
    [contentItemId, rows[0]!.id, templateId],
  );
}

describe('keyTermsFor', () => {
  it('prefers structured data over prose', () => {
    const terms = keyTermsFor({
      title: 'Some long prose title about baking',
      category: 'education',
      hashtags: ['glutenfree', 'baking'],
      product_artifact: { dish: 'sourdough loaf' },
    });
    expect(terms).toContain('glutenfree');
    expect(terms).toContain('sourdough loaf');
    // The title is only a fallback — prose makes noisy expectations.
    expect(terms).not.toContain('baking title');
  });

  it('falls back to the title only when there is nothing structured', () => {
    const terms = keyTermsFor({
      title: 'Gluten-free bread collapses',
      category: 'education',
      hashtags: [],
      product_artifact: null,
    });
    expect(terms.length).toBeGreaterThan(0);
  });

  it('drops noise and caps the list', () => {
    const terms = keyTermsFor({
      title: null,
      category: 'education',
      hashtags: ['a', 'ok', 'glutenfree', 'x1', 'baking', 'bread', 'crumb', 'oven', 'flour', 'water'],
      product_artifact: null,
    });
    expect(terms).not.toContain('a');
    expect(terms.length).toBeLessThanOrEqual(6);
  });
});

describe('aspectRatioOf', () => {
  it('snaps to the ratios the visual gate actually knows', () => {
    // A raw "1080:1920" matches none of them, and the aspect-ratio rule would
    // then fire on every correct render.
    expect(aspectRatioOf(1080, 1920)).toBe('9:16');
    expect(aspectRatioOf(1080, 1080)).toBe('1:1');
    expect(aspectRatioOf(1080, 1350)).toBe('4:5');
    expect(aspectRatioOf(1920, 1080)).toBe('16:9');
  });
});

d('reviewMediaHandler', () => {
  it('does nothing gracefully when there is no video', async () => {
    const id = await seedItem();
    const ctx = context();
    await reviewMediaHandler(job(id), ctx, scriptedVision([]));
    expect(ctx.logs.join(' ')).toContain('no video');
  });

  it('leaves an item alone when the file cannot be fetched', async () => {
    const id = await seedItem();
    await attachVideo(id, '/nonexistent/missing.mp4');
    const ctx = context();
    await reviewMediaHandler(job(id), ctx, scriptedVision([]));

    const { rows } = await pool.query<{ status: string }>(
      'select status from content_items where id = $1',
      [id],
    );
    // Unfetchable is unmeasured, not failed. Failing here would reject items
    // for an infrastructure problem.
    expect(rows[0]!.status).toBe('pending_approval');
    expect(ctx.logs.join(' ')).toContain('could not be fetched');
  });

  it.skipIf(!hasVideo)('reviews a real render and keeps the earlier gates', async () => {
    const id = await seedItem();
    await attachVideo(id, VIDEO);

    const ctx = context();
    await reviewMediaHandler(
      job(id),
      ctx,
      scriptedVision([
        { atSeconds: 0, describes: 'A card reading bread flour.', visibleText: ['bread flour'] },
        { atSeconds: 2, describes: 'A substitution card.', visibleText: ['swapped for blend'] },
      ]),
    );

    const { rows } = await pool.query<{
      qc_results: { gates: GateResult[] };
      media_observations: { frames: FrameObservation[] } | null;
    }>('select qc_results, media_observations from content_items where id = $1', [id]);

    const gates = rows[0]!.qc_results.gates;
    // The copy gate ran at draft time against inputs this job does not have.
    // Re-running everything here would report `skipped` and lose it.
    expect(gates.find((g) => g.gate === 'copy')?.status).toBe('passed');
    expect(gates.find((g) => g.gate === 'coherence')).toBeTruthy();
    expect(gates.find((g) => g.gate === 'visual')).toBeTruthy();
    expect(rows[0]!.media_observations?.frames.length).toBe(2);
  }, 60_000);

  it.skipIf(!hasVideo)('fails an item whose footage is of something else', async () => {
    const id = await seedItem({ hashtags: ['sourdoughstarter'] });
    await attachVideo(id, VIDEO);

    await reviewMediaHandler(
      job(id),
      context(),
      scriptedVision([
        { atSeconds: 0, describes: 'A plain card about flour substitution.', visibleText: ['bread flour'] },
      ]),
    );

    const { rows } = await pool.query<{ status: string; qc_results: { gates: GateResult[] } }>(
      'select status, qc_results from content_items where id = $1',
      [id],
    );
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.qc_results.gates.find((g) => g.gate === 'coherence')?.status).toBe('failed');
  }, 60_000);

  it.skipIf(!hasVideo)('lets the narration rules fire, which they never could before', async () => {
    /**
     * `runCoherenceQC` has always accepted an optional `audio`, and nothing ever
     * supplied one — so the rules that compare what is *said* against what is
     * *shown* were unreachable in a gate built to catch exactly that class of
     * bug. The transcript now comes from the tts handler, which produced it for
     * the audio gate anyway.
     *
     * Here the narration talks about proofing while every frame shows a flour
     * substitution table. Frames alone look fine; only the audio catches it.
     */
    const id = await seedItem({ body: 'Swap the flour and the crumb changes.' });
    await pool.query(
      `update content_items
          set vo_script = $2,
              qc_results = qc_results || $3::jsonb
        where id = $1`,
      [
        id,
        'Swap the flour and the crumb changes.',
        JSON.stringify({
          audio: {
            transcript: 'Let the dough proof overnight in a cold oven for best results.',
            openingSentence: 'Let the dough proof overnight in a cold oven for best results.',
          },
        }),
      ],
    );
    await attachVideo(id, VIDEO);

    await reviewMediaHandler(
      job(id),
      context(),
      scriptedVision([
        { atSeconds: 0, describes: 'A flour substitution table', visibleText: ['flour', 'swap'] },
        { atSeconds: 1, describes: 'A flour substitution table', visibleText: ['flour', 'swap'] },
        { atSeconds: 2, describes: 'A flour substitution table', visibleText: ['flour', 'swap'] },
      ]),
    );

    const { rows } = await pool.query<{
      qc_results: { gates: Array<{ gate: string } & Record<string, unknown>> };
    }>('select qc_results from content_items where id = $1', [id]);

    const coherence = rows[0]!.qc_results.gates.find((g) => g.gate === 'coherence');

    /**
     * Asserted on the rule id, not on prose.
     *
     * `opening_line_buries_it` reads `audio.openingSentence` and can only fire
     * when an observation is supplied — which is the whole point. It says the
     * first thing spoken names none of the key terms, which is true here: the
     * narration opens on proofing while the post is about a substitution.
     */
    expect(JSON.stringify(coherence)).toContain('coherence.opening_line_buries_it');
  }, 60_000);

  it.skipIf(!hasVideo)('reports skipped, never passed, when no frame was described', async () => {
    const id = await seedItem();
    await attachVideo(id, VIDEO);

    await reviewMediaHandler(job(id), context(), scriptedVision([]));

    const { rows } = await pool.query<{ qc_results: { gates: GateResult[] } }>(
      'select qc_results from content_items where id = $1',
      [id],
    );
    const coherence = rows[0]!.qc_results.gates.find((g) => g.gate === 'coherence')!;
    expect(coherence.status).toBe('skipped');
    expect(coherence.examined).toBe(0);
  }, 60_000);
});

describe.skipIf(!hasVideo)('frame sampling, against the real file', () => {
  it('weights the hook window, where the audience is won', () => {
    const times = frameSampleTimes(32);
    const inHook = times.filter((t) => t <= 3);
    // Sampling evenly across 32 seconds would put one frame in the three
    // seconds that decide everything.
    expect(inHook.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...times)).toBeLessThan(32);
  });

  it('never samples past the end of a short video', () => {
    for (const duration of [0.5, 1, 2.5, 6]) {
      for (const t of frameSampleTimes(duration)) {
        expect(t, `duration ${duration}`).toBeLessThan(duration);
      }
    }
  });

  it('extracts real PNG bytes from a real video', async () => {
    const frames = await sampleFrames(VIDEO, [0, 1.5]);
    expect(frames.length).toBe(2);
    for (const frame of frames) {
      expect(Buffer.from(frame.bytes).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(frame.bytes.length).toBeGreaterThan(1000);
    }
  }, 30_000);

  it('skips an unreadable timestamp rather than losing the whole set', async () => {
    const frames = await sampleFrames(VIDEO, [0, 9999]);
    expect(frames.length).toBe(1);
  }, 30_000);
});

/**
 * Retention, which had no caller at all until this job got one.
 *
 * `runRetentionQC` was 310 lines and 171 lines of tests reachable only from its
 * own test file — the same shape as `canStatePublicly` and `markOutputConsumed`
 * before it. Every video Halyard has ever rendered skipped it.
 *
 * These assert the two things that make wiring it worth anything: that it runs
 * against a real file, and that the rules it *cannot* run are visible rather
 * than folded into a pass.
 */
/**
 * §151. What `tts` measured must survive what `review_media` writes.
 *
 * `review_media` replaced `qc_results` wholesale with `{passed, gates, ranAt}`,
 * and `tts` stores the transcript, the delivery measurements and the caption
 * cues under a sibling `audio` key. `loadVoiceover` reads
 * `qc_results.audio.captions`, so a render after this point — a retry, a
 * regenerate, a second platform — would burn a video with no captions.
 */
d('the media review preserves what the voiceover measured', () => {
  async function seedWithAudio(): Promise<string> {
    const id = await seedItem({
      qc_results: {
        passed: true,
        gates: [{ gate: 'copy', status: 'passed', summary: 'clean', detail: null }],
        ranAt: new Date().toISOString(),
        audio: {
          transcript: 'Let it rest a full five minutes.',
          captions: [{ text: 'Let it rest', startFrame: 0, endFrame: 30 }],
          durationInFrames: 900,
        },
      },
    });
    // A still, so the handler reaches a write rather than returning early —
    // an unfetchable video writes nothing and would pass this test vacuously.
    const { rows } = await pool.query<{ id: string }>(
      `insert into assets (product_id, kind, storage_path, mime_type, width, height)
       values ('recipefix','photo','local/still.png','image/png',1080,1350) returning id`,
    );
    await pool.query(`update content_items set attached_asset_ids = array[$2::uuid] where id = $1`, [
      id,
      rows[0]!.id,
    ]);
    return id;
  }

  it('keeps the caption cues and transcript a later render depends on', async () => {
    const id = await seedWithAudio();

    await reviewMediaHandler(job(id), context(), scriptedVision([]));

    // The write really happened, so the assertion below means something.
    const { rows: gateRows } = await pool.query<{ qc: { gates: GateResult[] } }>(
      'select qc_results as qc from content_items where id = $1',
      [id],
    );
    expect(gateRows[0]!.qc.gates.some((g) => g.gate === 'visual')).toBe(true);

    const { rows } = await pool.query<{
      qc: { audio?: { captions?: unknown[]; transcript?: string } };
    }>('select qc_results as qc from content_items where id = $1', [id]);

    expect(rows[0]!.qc.audio?.captions).toHaveLength(1);
    expect(rows[0]!.qc.audio?.transcript).toBe('Let it rest a full five minutes.');
  });
});

d('the retention gate', () => {
  it.skipIf(!hasVideo)('runs against a real render and is stored', async () => {
    const id = await seedItem();
    await attachVideo(id, VIDEO);

    await reviewMediaHandler(
      job(id),
      context(),
      scriptedVision([{ atSeconds: 0, describes: 'A card.', visibleText: ['bread flour'] }]),
    );

    const { rows } = await pool.query<{ qc_results: { gates: GateResult[] } }>(
      'select qc_results from content_items where id = $1',
      [id],
    );
    const retention = rows[0]!.qc_results.gates.find((g) => g.gate === 'retention');
    expect(retention).toBeTruthy();
    // It looked at something. A gate that examined nothing is not a pass.
    expect(retention!.examined).toBeGreaterThan(0);
  }, 60_000);

  it.skipIf(!hasVideo)('never reads as a clean pass while a rule went unmeasured', async () => {
    /**
     * `review_media` has no OCR of frame 1 and no first-to-last similarity, so
     * the thumbnail and loop rules cannot run. A green tick beside them would
     * tell an operator the opening was fully checked when half of it was not —
     * the same "a skipped check is not a passed check" rule `runAllGates`
     * learned the hard way.
     */
    const id = await seedItem();
    await attachVideo(id, VIDEO);

    await reviewMediaHandler(
      job(id),
      context(),
      scriptedVision([{ atSeconds: 0, describes: 'A card.', visibleText: ['bread flour'] }]),
    );

    const { rows } = await pool.query<{ qc_results: { gates: GateResult[] } }>(
      'select qc_results from content_items where id = $1',
      [id],
    );
    const retention = rows[0]!.qc_results.gates.find((g) => g.gate === 'retention')!;
    const detail = retention.detail as { unmeasured: string[] };

    // The two rules `review_media` cannot run are named...
    expect(detail.unmeasured).toContain('retention.first_frame_words');
    expect(detail.unmeasured).toContain('retention.first_frame_contrast');
    // ...and the gate never reads as a clean pass while they are outstanding.
    // It may legitimately be `failed` instead, if a rule that *did* run found
    // something — which is why this asserts the absence of `passed` rather than
    // the presence of `warning`.
    expect(retention.status).not.toBe('passed');
  }, 60_000);
});


/**
 * The gate against Halyard's own output, which is the only test that could have
 * caught the regression it exists for.
 *
 * Wiring the retention gate up (§72) left its motion rules reading mean-frame
 * luminance, which cannot see a light card whose dark text is being swapped.
 * `retention.no_pattern_interrupt` is an **error**, and an errored gate fails
 * the content item — so every render longer than twenty seconds was about to be
 * rejected by its own pipeline. A fixture cannot show that; a real render can.
 */
d('the retention gate does not reject Halyard’s own renders', () => {
  it.skipIf(!hasVideo)('passes the fixture render it previously failed', async () => {
    const id = await seedItem();
    await attachVideo(id, VIDEO);

    await reviewMediaHandler(
      job(id),
      context(),
      scriptedVision([{ atSeconds: 0, describes: 'A card.', visibleText: ['bread flour'] }]),
    );

    const { rows } = await pool.query<{ status: string; qc_results: { gates: GateResult[] } }>(
      'select status, qc_results from content_items where id = $1',
      [id],
    );
    const retention = rows[0]!.qc_results.gates.find((g) => g.gate === 'retention')!;

    expect(retention.status).not.toBe('failed');
    expect(
      (retention.detail as { findings: Array<{ rule: string }> }).findings.map((f) => f.rule),
    ).not.toContain('retention.no_pattern_interrupt');
    /**
     * Scoped to retention deliberately. This render is deliberately mismatched
     * against a single scripted frame so that `coherence` has something to say,
     * and asserting the item's overall status here would make this test fail
     * for a reason that has nothing to do with the signal it is about.
     */
    const failed = rows[0]!.qc_results.gates.filter((g) => g.status === 'failed').map((g) => g.gate);
    expect(failed).not.toContain('retention');
  }, 60_000);

  it.skipIf(!hasVideo)('supplies the motion signal rather than deriving it from the mean', async () => {
    // Pinned because the fallback still exists and is correct for footage-based
    // video. What must not happen again is production silently using it.
    const id = await seedItem();
    await attachVideo(id, VIDEO);

    await reviewMediaHandler(
      job(id),
      context(),
      scriptedVision([{ atSeconds: 0, describes: 'A card.', visibleText: ['flour'] }]),
    );

    const { rows } = await pool.query<{ qc_results: { gates: GateResult[] } }>(
      'select qc_results from content_items where id = $1',
      [id],
    );
    const detail = rows[0]!.qc_results.gates.find((g) => g.gate === 'retention')!.detail as {
      longestStaticStretchSeconds: number;
    };
    // Read from the range series, the whole video is not one static stretch.
    expect(detail.longestStaticStretchSeconds).toBeLessThan(30);
  }, 60_000);
});

/**
 * The gate is newly live, so it must not start rejecting content by itself.
 */
d('retention findings are recorded without blocking', () => {
  it.skipIf(!hasVideo)('never fails a content item on a retention error', async () => {
    /**
     * `ScalingMath.mp4` really is static for twenty-four seconds and raises
     * `retention.no_pattern_interrupt`, an **error**. `review_media` fails an
     * item on any errored gate, so switching this gate on at error severity
     * would have begun rejecting a real template on a rule nothing had ever
     * run. The finding is kept; the blocking decision is a person's.
     */
    const STATIC_RENDER = '.render-output/video/ScalingMath.mp4';
    const id = await seedItem();
    await attachVideo(id, STATIC_RENDER);

    await reviewMediaHandler(
      job(id),
      context(),
      scriptedVision([{ atSeconds: 0, describes: 'A scaling card.', visibleText: ['servings'] }]),
    );

    const { rows } = await pool.query<{ qc_results: { gates: GateResult[] } }>(
      'select qc_results from content_items where id = $1',
      [id],
    );
    const retention = rows[0]!.qc_results.gates.find((g) => g.gate === 'retention')!;
    const detail = retention.detail as { findings: Array<{ rule: string; severity: string }> };

    // The finding is real, recorded, and carries its own severity...
    expect(detail.findings.map((f) => f.rule)).toContain('retention.no_pattern_interrupt');
    expect(detail.findings.some((f) => f.severity === 'error')).toBe(true);
    // ...and the gate does not block on it.
    expect(retention.status).toBe('warning');
    expect(retention.status).not.toBe('failed');
  }, 60_000);
});

/**
 * Stills, which no gate had ever looked at.
 *
 * `review_media` walked `renders` only and returned early when it found no
 * video, behind a comment claiming stills were "covered by the existing visual
 * gate at draft time". They were not: no caller supplies `visual` to
 * `runAllGates`, which is what the Auditor's `gate.input_never_supplied`
 * reports. Meanwhile `publish` sends `render_ids` **and**
 * `attached_asset_ids` — so an operator-attached image reached a platform with
 * no gate having examined it.
 */
d('attached stills are examined', () => {
  async function attach(
    itemId: string,
    dims: { width: number | null; height: number | null },
  ): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into assets (product_id, kind, storage_path, mime_type, width, height)
       values ('recipefix','photo','local/still.png','image/png',$1,$2) returning id`,
      [dims.width, dims.height],
    );
    await pool.query(
      `update content_items set attached_asset_ids = array[$2::uuid] where id = $1`,
      [itemId, rows[0]!.id],
    );
    return rows[0]!.id;
  }

  it('records a visual gate for an item with no video at all', async () => {
    // Previously: an early return, no gate row, and `qc_results` silent — which
    // reads as "nothing wrong" rather than "nothing looked at".
    const id = await seedItem();
    await attach(id, { width: 1080, height: 1350 });

    await reviewMediaHandler(job(id), context(), scriptedVision([]));

    const { rows } = await pool.query<{ qc_results: { gates: GateResult[] } }>(
      'select qc_results from content_items where id = $1',
      [id],
    );
    const visual = rows[0]!.qc_results.gates.find((g) => g.gate === 'visual');
    expect(visual).toBeTruthy();
    expect(visual!.examined).toBe(1);
  });

  it('never passes a still whose dimensions were never recorded', async () => {
    /**
     * An asset with no width or height was not checked. A green tick beside it
     * would say it was — the same rule the retention gate follows.
     */
    const id = await seedItem();
    await attach(id, { width: null, height: null });

    await reviewMediaHandler(job(id), context(), scriptedVision([]));

    const { rows } = await pool.query<{ qc_results: { gates: GateResult[] } }>(
      'select qc_results from content_items where id = $1',
      [id],
    );
    const visual = rows[0]!.qc_results.gates.find((g) => g.gate === 'visual')!;
    expect(visual.status).not.toBe('passed');
    expect(visual.examined).toBe(0);
    expect((visual.detail as { unexamined: string[] }).unexamined).toHaveLength(1);
    expect(visual.summary).toMatch(/not examined/i);
  });

  it('does not silently pass a still the platform will crop', async () => {
    // A 16:9 landscape image on a vertical-first platform is the rule that
    // actually matters for a photo, and it was unreachable.
    const id = await seedItem();
    await attach(id, { width: 1920, height: 1080 });

    await reviewMediaHandler(job(id), context(), scriptedVision([]));

    const { rows } = await pool.query<{ qc_results: { gates: GateResult[] } }>(
      'select qc_results from content_items where id = $1',
      [id],
    );
    const visual = rows[0]!.qc_results.gates.find((g) => g.gate === 'visual')!;
    // Either a finding or a clean pass — but it was *examined*, which is the
    // property that did not exist before.
    expect(visual.examined).toBe(1);
    expect(['passed', 'warning', 'failed']).toContain(visual.status);
  });
});

/**
 * A video item's attached stills.
 *
 * §93 examined stills only when there was **no video**, so an item with a
 * rendered video *and* an attached image examined the video and silently
 * ignored the image — the same gap, one branch over. `publish` sends both
 * regardless of which is present.
 */
d('stills attached to a video item', () => {
  it('are examined alongside the render, not ignored', async () => {
    const id = await seedItem();
    await attachVideo(id, VIDEO);
    const { rows: asset } = await pool.query<{ id: string }>(
      `insert into assets (product_id, kind, storage_path, mime_type, width, height)
       values ('recipefix','photo','local/still.png','image/png',1080,1350) returning id`,
    );
    await pool.query(`update content_items set attached_asset_ids = array[$2::uuid] where id = $1`, [
      id,
      asset[0]!.id,
    ]);

    await reviewMediaHandler(
      job(id),
      context(),
      scriptedVision([{ atSeconds: 0, describes: 'A card.', visibleText: ['flour'] }]),
    );

    const { rows } = await pool.query<{ qc_results: { gates: GateResult[] } }>(
      'select qc_results from content_items where id = $1',
      [id],
    );
    const visual = rows[0]!.qc_results.gates.find((g) => g.gate === 'visual')!;
    const detail = visual.detail as { stills: { measurable: number; total: number } };

    // The still was actually looked at, not merely loaded.
    expect(detail.stills.total).toBe(1);
    expect(detail.stills.measurable).toBe(1);
    // And the count reflects frames plus stills rather than frames alone.
    expect(visual.examined).toBeGreaterThan(1);
  }, 60_000);

  it('never reads as a clean pass when an attached still has no dimensions', async () => {
    // An unmeasured still beside a passing video must not inherit its tick.
    const id = await seedItem();
    await attachVideo(id, VIDEO);
    const { rows: asset } = await pool.query<{ id: string }>(
      `insert into assets (product_id, kind, storage_path, mime_type)
       values ('recipefix','photo','local/unknown.png','image/png') returning id`,
    );
    await pool.query(`update content_items set attached_asset_ids = array[$2::uuid] where id = $1`, [
      id,
      asset[0]!.id,
    ]);

    await reviewMediaHandler(
      job(id),
      context(),
      scriptedVision([{ atSeconds: 0, describes: 'A card.', visibleText: ['flour'] }]),
    );

    const { rows } = await pool.query<{ qc_results: { gates: GateResult[] } }>(
      'select qc_results from content_items where id = $1',
      [id],
    );
    const visual = rows[0]!.qc_results.gates.find((g) => g.gate === 'visual')!;
    expect(visual.status).not.toBe('passed');
    expect((visual.detail as { stills: { unexamined: string[] } }).stills.unexamined).toHaveLength(1);
  }, 60_000);
});
