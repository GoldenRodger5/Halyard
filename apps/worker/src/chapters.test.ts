/**
 * §223. Chapters, end to end: a beat plan in the database becomes timestamps
 * a YouTube description can carry.
 *
 * The seam this guards is that YouTube accepts a malformed chapter list
 * silently — the upload succeeds, the response is identical, and the chapters
 * simply do not appear. Every assertion here is about the list being *valid*,
 * not about it existing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { chaptersFromBeats } from '@halyard/core';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { chaptersForItem, titleForBeat } from './chapters.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: Pool;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('chapters', 6);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict (id) do nothing`,
  );
  await pool.query(
    `insert into social_accounts (id, product_id, platform, persona, handle)
     values ('22222222-2222-2222-2222-222222222222','recipefix','youtube','brand','@recipefix')`,
  );
});

afterAll(async () => {
  if (available) await pool.end();
});

describe('titleForBeat', () => {
  it('prefers the step label, then what the beat says on screen', () => {
    expect(titleForBeat({ id: 'a', weight: 1, minSeconds: 2, content: { label: 'The swap' } })).toBe(
      'The swap',
    );
    expect(
      titleForBeat({ id: 'a', weight: 1, minSeconds: 2, content: { text: 'Why it breaks' } }),
    ).toBe('Why it breaks');
  });

  it('gives no title rather than a generated one', () => {
    // "Chapter 3" tells a viewer nothing the scrubber did not already.
    expect(titleForBeat({ id: 'a', weight: 1, minSeconds: 2, content: {} })).toBeNull();
    expect(titleForBeat({ id: 'a', weight: 1, minSeconds: 2 })).toBeNull();
  });

  it('truncates a paragraph, because a chapter title is read in a list', () => {
    const long = 'word '.repeat(40);
    expect(titleForBeat({ id: 'a', weight: 1, minSeconds: 2, content: { text: long } })!.length)
      .toBeLessThanOrEqual(70);
  });
});

d('chaptersForItem', () => {
  async function seed(opts: {
    subtype: string;
    beats: Array<{ id: string; weight: number; minSeconds: number; content?: unknown }>;
  }): Promise<string> {
    const { rows: concept } = await pool.query<{ id: string }>(
      `insert into concepts (product_id, title, premise, objective, story_structure,
                             visual_treatment, audio_direction, platform_intent,
                             evidence_requirements, imagery_requirements, score_breakdown, status)
       values ('recipefix', 'A concept', 'A premise', 'education', '{}'::jsonb,
               '{}'::jsonb, '{}'::jsonb, array['youtube'], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'selected')
       returning id`,
    );
    const { rows: brief } = await pool.query<{ id: string }>(
      `insert into creative_briefs (concept_id, product_id, platform, treatment,
                                    presentation_mode, target_seconds, aspect_ratio, beats)
       values ($1, 'recipefix', 'youtube', 'how_to', 'editorial', 600, '16:9', $2::jsonb)
       returning id`,
      [concept[0]!.id, JSON.stringify(opts.beats)],
    );
    const { rows } = await pool.query<{ id: string }>(
      `insert into content_items (product_id, account_id, platform, persona, format, category,
                                 format_subtype, body, brief_id, status)
       values ('recipefix', '22222222-2222-2222-2222-222222222222', 'youtube', 'brand', 'video',
               'education', $1, 'body', $2, 'draft') returning id`,
      [opts.subtype, brief[0]!.id],
    );
    return rows[0]!.id;
  }

  const fourBeats = [
    { id: 'b1', weight: 1, minSeconds: 8, content: { label: 'The problem' } },
    { id: 'b2', weight: 2, minSeconds: 20, content: { label: 'What actually breaks' } },
    { id: 'b3', weight: 2, minSeconds: 20, content: { label: 'The swap' } },
    { id: 'b4', weight: 1, minSeconds: 10, content: { label: 'The result' } },
  ];

  it('produces a list YouTube will actually render', async () => {
    const id = await seed({ subtype: 'long_form', beats: fourBeats });
    const chapters = await chaptersForItem(pool, id, 600);
    expect(chapters).not.toBeNull();

    // The real assertion: run what we produced through the same rules YouTube
    // applies, and require it to survive them.
    const result = chaptersFromBeats(chapters!, 600);
    expect(result.refusedReason).toBeNull();
    expect(result.lines[0]).toBe('0:00 The problem');
    expect(result.lines).toHaveLength(4);
  });

  it('returns null for a Short, which cannot show chapters at all', async () => {
    const id = await seed({ subtype: 'short', beats: fourBeats });
    expect(await chaptersForItem(pool, id, 600)).toBeNull();
  });

  it('returns null when no beat carried a title, rather than an empty list', async () => {
    // Null means "not the kind of piece that has chapters"; empty would mean
    // "it is, and none survived" — which is a different fact with a reason.
    const id = await seed({
      subtype: 'long_form',
      beats: fourBeats.map((b) => ({ ...b, content: {} })),
    });
    expect(await chaptersForItem(pool, id, 600)).toBeNull();
  });

  it('starts the first chapter at 0:00, whatever the plan weighs', async () => {
    // The rule that silently kills the whole list when broken.
    const id = await seed({ subtype: 'long_form', beats: fourBeats });
    const chapters = await chaptersForItem(pool, id, 600);
    expect(chapters![0]!.startSeconds).toBe(0);
  });

  it('scales the timestamps to the file that is actually being uploaded', async () => {
    /*
     * The timestamps come from `layoutScenes` against the measured runtime, so
     * a longer file must push the later boundaries out. A plan-relative
     * timestamp would point at the wrong frames.
     */
    const id = await seed({ subtype: 'long_form', beats: fourBeats });
    const short = await chaptersForItem(pool, id, 120);
    const long = await chaptersForItem(pool, id, 900);
    expect(long![3]!.startSeconds).toBeGreaterThan(short![3]!.startSeconds);
  });
});
