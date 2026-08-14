/**
 * The hook stage, which had no caller.
 *
 * `surfaceBestVariants` — the half of the hook system that chooses a better
 * opening rather than recording whichever one the copywriter wrote — was
 * unreachable from any production path. These cover the joining-up.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from '../../../packages/db/src/__tests__/testDb.js';
import { applyHookToBody, loadHookHistory, runHookStage } from './hooks.js';
import type { HandlerContext } from './poller.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
const ACCOUNT = '33333333-3333-3333-3333-333333333333';

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('hookstage', 6);
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')`,
  );
  await pool.query(
    `insert into social_accounts (id, product_id, platform, persona, handle)
     values ($1,'recipefix','tiktok','brand','@recipefix')`,
    [ACCOUNT],
  );
}, 120_000);

afterAll(async () => {
  if (available) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('delete from hook_variants');
  await pool.query('delete from hooks');
  await pool.query('delete from content_items');
});

function context(): HandlerContext & { logs: Array<[string, unknown]> } {
  const logs: Array<[string, unknown]> = [];
  return {
    pool,
    workerId: 'test',
    logs,
    log: (m: string, det?: unknown) => logs.push([m, det]),
    enqueue: async () => undefined,
  } as unknown as HandlerContext & { logs: Array<[string, unknown]> };
}

async function seedItem(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into content_items
       (product_id, account_id, platform, persona, format, category, status, body)
     values ('recipefix',$1,'tiktok','brand','video','education','draft',
             'Swap the flour and the crumb changes.')
     returning id`,
    [ACCOUNT],
  );
  return rows[0]!.id;
}

/** A model that returns eight usable variants and a delivered payoff. */
function hookLlm(): { complete: (req: { promptVersion?: string }) => Promise<unknown> } {
  return {
    complete: async (req: { promptVersion?: string }) => {
      if (req.promptVersion?.includes('payoff')) {
        return {
          text: JSON.stringify({ delivered: true, where: 'the body', reason: 'names the swap' }),
          model: 'stub', inputTokens: 1, outputTokens: 1, costUsd: 0,
        };
      }
      /**
       * The on-screen text and the spoken line say *different* things.
       *
       * The first version of this stub set `spoken_hook` to the text hook plus
       * a full stop, and every one of the eight was correctly rejected for
       * `hook.layers_identical` — two channels saying one thing wastes one of
       * them. The filter was right and the fixture was the bad hook.
       */
      const variants = [
        ['problem_state', 'Your loaf keeps coming out gummy', 'The starch is holding water it never lets go of'],
        ['contradiction', 'More flour is the wrong fix', 'Everyone reaches for flour and it makes the problem worse'],
        ['specificity', 'Three quarters of a cup decides it', 'That much water is the whole difference'],
        ['myth_bust', 'Gluten-free does not mean dense', 'The blend is not what makes it heavy'],
        ['open_loop', 'One swap changes the whole crumb', 'It is not the ingredient you would guess'],
        ['segment_call', 'If you bake without wheat, read this', 'This one is for the gluten-free bakers'],
        ['confession', 'I got this wrong for a year', 'Every loaf came out wet and I blamed the oven'],
        ['problem_state', 'The middle never finishes setting', 'It looks done and the centre is still raw'],
      ].map(([hook_type, text_hook, spoken_hook]) => ({
        hook_type,
        text_hook,
        spoken_hook,
        visual_direction: 'Cut from dough to crumb',
        caption_hook: text_hook,
      }));
      return {
        text: JSON.stringify({ variants }),
        model: 'stub', inputTokens: 1, outputTokens: 1, costUsd: 0,
      };
    },
  };
}

describe('applyHookToBody', () => {
  it('replaces the opening line rather than stacking a second hook on it', () => {
    /**
     * Prepending produces a post that opens with two competing hooks, every
     * time, and it reads as a mistake because it is one.
     */
    const body = 'Old opening line.\n\nThe rest of the post.';
    expect(applyHookToBody(body, 'A better hook')).toBe('A better hook\n\nThe rest of the post.');
  });

  it('skips leading blank lines', () => {
    expect(applyHookToBody('\n\nOld line.\nRest.', 'New')).toBe('\n\nNew\nRest.');
  });

  it('handles a body that is entirely blank', () => {
    expect(applyHookToBody('   ', 'New')).toBe('New');
  });
});

d('runHookStage', () => {
  it('generates variants, stores them, and applies the best', async () => {
    const id = await seedItem();
    const result = await runHookStage(
      context(),
      {
        contentItemId: id,
        productId: 'recipefix',
        platform: 'tiktok',
        category: 'education',
        format: 'video',
        body: 'Swap the flour and the crumb changes.',
        brandNames: ['RecipeFix'],
      },
      hookLlm() as never,
    );

    expect(result.applied).not.toBeNull();
    expect(result.surfaced).toBeGreaterThan(0);

    // Five surfaced, not eight: choice fatigue is real and this is a daily task.
    const { rows } = await pool.query<{ n: string }>(
      'select count(*) as n from hook_variants where content_item_id = $1 and rejected_reason is null',
      [id],
    );
    expect(Number(rows[0]!.n)).toBeLessThanOrEqual(5);

    // Exactly one is marked selected.
    const { rows: sel } = await pool.query<{ n: string }>(
      'select count(*) as n from hook_variants where content_item_id = $1 and selected',
      [id],
    );
    expect(Number(sel[0]!.n)).toBe(1);
  }, 60_000);

  it('records why a variant was rejected, not just that it was', async () => {
    // The reason is what makes the next generation better.
    const id = await seedItem();
    await runHookStage(
      context(),
      {
        contentItemId: id,
        productId: 'recipefix',
        platform: 'tiktok',
        category: 'education',
        format: 'video',
        body: 'Swap the flour and the crumb changes.',
      },
      hookLlm() as never,
    );

    const { rows } = await pool.query<{ rejected_reason: string | null }>(
      'select rejected_reason from hook_variants where content_item_id = $1 and rejected_reason is not null',
      [id],
    );
    for (const row of rows) expect(row.rejected_reason).toBeTruthy();
  }, 60_000);

  it('keeps the draft when the hook stage fails', async () => {
    /**
     * A post with the copywriter's own opening is a worse post, not a broken
     * one. Losing a finished draft to a hook service having a bad minute is the
     * wrong trade.
     */
    const id = await seedItem();
    const broken = { complete: async () => { throw new Error('model unavailable'); } };

    const ctx = context();
    const result = await runHookStage(
      ctx,
      {
        contentItemId: id,
        productId: 'recipefix',
        platform: 'tiktok',
        category: 'education',
        format: 'video',
        body: 'Swap the flour and the crumb changes.',
      },
      broken as never,
    );

    expect(result.applied).toBeNull();
    expect(ctx.logs.map(([m]) => m)).toContain('hook stage failed; keeping the copywriter opening');
  }, 60_000);

  it('reports no measured performance rather than inventing a number', async () => {
    // Nothing has published, so there are no stop rates. The scorer falls back
    // to a prior and records which basis it used.
    const history = await loadHookHistory(context(), 'recipefix', 'tiktok');
    expect(history.performance).toEqual([]);
    expect(history.recentTypes).toEqual([]);
  }, 60_000);
});
