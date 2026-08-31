/**
 * §394. The variety guarantee, against a real database.
 *
 * `quizTemplates.test.ts` proves the *rule* — that the chooser exhausts its
 * pool before repeating. This proves the *loop*: that what a render drew is
 * written down, read back, and actually changes the next choice.
 *
 * They are different claims and only the second one was broken. §302's rule was
 * always correct; it was asked with an empty history every time, because the
 * choice happened inside a React component that cannot reach a database.
 */
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chooseQuizTreatments } from '@halyard/render/video';
import { createIsolatedPool, databaseAvailable, seedMinimal } from '../../../packages/db/src/__tests__/testDb.js';
import { recentTreatments } from './treatmentRecency.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let ids: { productId: string; accountId: string; contentItemId: string };

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('treatment_recency', 4);
  ids = await seedMinimal(pool);
  /*
   * `renders.template_id` is a foreign key, so the compositions this test
   * records against have to exist. Two of them, because one of the claims is
   * that a quiz's history stays out of a walkthrough's.
   */
  await pool.query(
    `insert into templates (id, product_id, renderer, format, aspect_ratio)
     values ('Quiz', $1, 'remotion', 'video', '9:16'),
            ('Walkthrough', $1, 'remotion', 'video', '9:16')
     on conflict (id) do nothing`,
    [ids.productId],
  );
});

afterAll(async () => {
  if (pool) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from renders');
});

/** One finished render that drew `treatment`. */
async function drew(treatment: string): Promise<void> {
  await pool.query(
    `insert into renders (content_item_id, template_id, renderer, input_props, quality, treatment, status)
     values ($1, 'Quiz', 'remotion', '{}'::jsonb, 'final', $2, 'done')`,
    [ids.contentItemId, treatment],
  );
}

d('what a render drew comes back as history', () => {
  it('remembers nothing when nothing has been drawn', async () => {
    expect(await recentTreatments(pool, { productId: ids.productId, templateId: 'Quiz' })).toEqual(
      [],
    );
  });

  it('returns treatments most recent first', async () => {
    await drew('stack');
    await drew('rail');
    await drew('grid');
    const recent = await recentTreatments(pool, {
      productId: ids.productId,
      templateId: 'Quiz',
    });
    expect(recent[0]).toBe('grid');
    expect(recent).toContain('stack');
  });

  it('ignores renders that recorded no treatment', async () => {
    /*
     * Every render made before §394 has `treatment = null`, and null means "we
     * do not know what this drew" rather than "it drew nothing". Counting them
     * would put a hole in the recency list — gotcha 9, applied to a look.
     */
    await pool.query(
      `insert into renders (content_item_id, template_id, renderer, input_props, quality, status)
       values ($1, 'Quiz', 'remotion', '{}'::jsonb, 'final', 'done')`,
      [ids.contentItemId],
    );
    await drew('stack');
    expect(await recentTreatments(pool, { productId: ids.productId, templateId: 'Quiz' })).toEqual([
      'stack',
    ]);
  });

  it('keeps one template’s history out of another’s', async () => {
    /* A quiz's recency has nothing to say about a walkthrough's. */
    await drew('stack');
    await pool.query(
      `insert into renders (content_item_id, template_id, renderer, input_props, quality, treatment, status)
       values ($1, 'Walkthrough', 'remotion', '{}'::jsonb, 'final', 'numbered', 'done')`,
      [ids.contentItemId],
    );
    expect(await recentTreatments(pool, { productId: ids.productId, templateId: 'Quiz' })).toEqual([
      'stack',
    ]);
  });

  it('closes the loop: the next piece does not repeat the last one', async () => {
    /*
     * The whole point, end to end. Two pieces briefed identically, the first
     * recorded, and the second chosen against what the first actually drew.
     */
    const questions = [{ options: ['a', 'b', 'c', 'd'] }];

    const first = chooseQuizTreatments({ questions });
    await drew(first.treatments[0]!);

    const recent = await recentTreatments(pool, {
      productId: ids.productId,
      templateId: 'Quiz',
    });
    const second = chooseQuizTreatments({ questions, recent: recent as never });

    expect(second.treatments[0]).not.toBe(first.treatments[0]);
  });
});
