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
