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
import { applyHookToBody, loadHookHistory, regateHookedBody, runHookStage } from './hooks.js';
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

  /**
   * §143. Found in the first live generation run.
   *
   * X copy is one paragraph, so the whole post is a single line. Replacing
   * "the first line" replaced the post: 267 characters of gated copy became a
   * 35-character hook on its way to the approval queue.
   */
  it('replaces only the opening sentence of a single-paragraph post', () => {
    const body =
      'Healthier substitution, worse bread. ' +
      'The starch holds onto water that wheat flour would have released. ' +
      'Same moisture, no exit.';
    const out = applyHookToBody(body, 'Applesauce is why your loaf is gummy.');

    expect(out).toBe(
      'Applesauce is why your loaf is gummy. ' +
        'The starch holds onto water that wheat flour would have released. ' +
        'Same moisture, no exit.',
    );
    // The payoff is the half that was gated. It must survive the hook.
    expect(out).toContain('Same moisture, no exit.');
  });

  it('refuses to replace a post that is one sentence, since nothing survives it', () => {
    const body = 'Applesauce makes gluten-free bread gummy.';
    // Swapping the only sentence is a rewrite, not a hook, and the rewrite
    // has not been through the gates.
    expect(applyHookToBody(body, 'A different claim entirely.')).toBe(body);
  });

  it('does not treat a decimal as the end of the opening sentence', () => {
    const body = 'Rest it 3.5 minutes first. Then slice.';
    expect(applyHookToBody(body, 'Cut it too soon and it gums.')).toBe(
      'Cut it too soon and it gums. Then slice.',
    );
  });
});

describe('regateHookedBody', () => {
  const base = {
    body:
      'Healthier substitution, worse bread. ' +
      'The starch holds onto water that wheat flour would have released. ' +
      'Same moisture, no exit.',
    platform: 'x',
    hashtags: [] as string[],
  };

  it('returns the hooked post together with the QC that describes it', () => {
    const out = regateHookedBody({ ...base, hook: 'Applesauce is why your loaf is gummy.' });

    expect(out).not.toBeNull();
    expect(out!.body).toContain('Applesauce is why your loaf is gummy.');
    // The stored QC must be about the stored text, not the text before it.
    expect(out!.qc.passed).toBe(true);
    expect(out!.body).toContain('Same moisture, no exit.');
  });

  it('refuses a hook that pushes the post past the platform ceiling', () => {
    /**
     * §143. The live draft sat at 267 of X's 280 characters before the hook
     * stage touched it. A longer opening takes it over, and the old code stored
     * that post with the pre-hook `qc_results` still reading "passed".
     */
    const longHook = `${'Here is a much longer opening line about gluten free baking'.repeat(4)}.`;
    expect(regateHookedBody({ ...base, hook: longHook })).toBeNull();
  });

  it('refuses a hook that reintroduces a banned phrase', () => {
    const out = regateHookedBody({
      ...base,
      hook: 'Game changer for your baking.',
      bannedPhrases: ['game changer'],
    });
    expect(out).toBeNull();
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
    /**
     * Nothing has published, so there is nothing measured. The scorer falls
     * back to a prior and records which basis it used.
     *
     * The second assertion is the one that was missing. This test passed for as
     * long as the query was broken — it selected `post_metrics.stop_rate` and
     * joined on `post_metrics.content_item_id`, neither of which exists, and a
     * `.catch()` returned `[]`. An empty array proves nothing on its own; an
     * empty array *with no failure logged* is the honest cold start.
     */
    const ctx = context();
    const history = await loadHookHistory(ctx, 'recipefix', 'tiktok');
    expect(history.performance).toEqual([]);
    expect(history.recentTypes).toEqual([]);
    expect(ctx.logs.map(([m]) => m)).not.toContain('hook performance history unavailable');
  }, 60_000);
});

/**
 * The feedback half of the hook system: what was measured, fed back into what
 * gets generated next.
 *
 * This is the only place in Halyard where an observed outcome influences a
 * future generation decision, and it had never run.
 */
d('hook performance history', () => {
  async function seedMeasured(input: {
    platform: string;
    hookType: string;
    impressions: number;
    videoViews: number;
  }): Promise<void> {
    const { rows: account } = await pool.query<{ id: string }>(
      `insert into social_accounts (product_id, platform, persona, handle)
       values ('recipefix',$1,'brand',$2)
       on conflict (product_id, platform, persona) do update set handle = excluded.handle
       returning id`,
      [input.platform, `@perf-${input.platform}`],
    );
    /*
     * §204. The TikTok panel, because a published TikTok row cannot exist
     * without one.
     *
     * §179 added `content_items_tiktok_needs_choices`, which refuses an
     * approved-or-later TikTok item whose Direct Post choices are absent —
     * correctly, because those must be a person's choices. This fixture
     * predates it and inserts a published TikTok item directly, so it has been
     * failing since §179 shipped. Nobody saw it: these suites skip unless
     * `TEST_DATABASE_URL` is set, and it was not.
     *
     * Supplied here rather than dodged by changing the platform, because
     * `keeps each platform's numbers separate` is specifically about TikTok
     * being one of them.
     */
    const tiktokPanel =
      input.platform === 'tiktok'
        ? JSON.stringify({
            privacyLevel: 'SELF_ONLY',
            allowComment: false,
            allowDuet: false,
            allowStitch: false,
            commercialContent: false,
            brandOrganic: false,
            brandedContent: false,
            musicConfirmedAt: new Date().toISOString(),
            creatorInfoFetchedAt: new Date().toISOString(),
          })
        : null;

    const { rows: item } = await pool.query<{ id: string }>(
      `insert into content_items
         (product_id, account_id, platform, persona, format, category, status, body, tiktok_options)
       values ('recipefix',$1,$2,'brand','video','education','published','body',$3::jsonb)
       returning id`,
      [account[0]!.id, input.platform, tiktokPanel],
    );
    await pool.query(
      `insert into hook_variants (content_item_id, hook_type, text_hook, selected)
       values ($1,$2,'a hook', true)`,
      [item[0]!.id, input.hookType],
    );
    const { rows: pub } = await pool.query<{ id: string }>(
      `insert into publications
         (content_item_id, account_id, platform, publish_mode, platform_post_id, published_at)
       values ($1,$2,$3,'direct',$4, now()) returning id`,
      [item[0]!.id, account[0]!.id, input.platform, `post-${item[0]!.id}`],
    );
    await pool.query(
      `insert into post_metrics (publication_id, impressions, video_views)
       values ($1,$2,$3)`,
      [pub[0]!.id, input.impressions, input.videoViews],
    );
  }

  beforeEach(async () => {
    if (!available) return;
    await pool.query('delete from post_metrics');
    await pool.query('delete from publications');
    await pool.query('delete from hook_variants');
    await pool.query('delete from content_items');
    await pool.query(`delete from social_accounts where handle like '@perf-%'`);
  });

  it('returns a real measurement once one exists', async () => {
    // The query could not previously plan, let alone return this.
    await seedMeasured({
      platform: 'tiktok',
      hookType: 'problem_state',
      impressions: 1000,
      videoViews: 700,
    });

    const ctx = context();
    const history = await loadHookHistory(ctx, 'recipefix', 'tiktok');

    expect(ctx.logs.map(([m]) => m)).not.toContain('hook performance history unavailable');
    expect(history.performance).toHaveLength(1);
    expect(history.performance[0]!.platform).toBe('tiktok');
    expect(history.performance[0]!.viewThroughRate).toBeCloseTo(0.7);
    expect(history.performance[0]!.samples).toBe(1);
  }, 60_000);

  it('keeps each platform’s numbers separate', async () => {
    /**
     * Platforms do not agree on what a view is, so one average across them is
     * true nowhere. Both rows come back, each labelled, and the scorer picks by
     * platform rather than taking whichever it finds first.
     */
    await seedMeasured({
      platform: 'tiktok',
      hookType: 'problem_state',
      impressions: 1000,
      videoViews: 900,
    });
    await seedMeasured({
      platform: 'youtube',
      hookType: 'problem_state',
      impressions: 1000,
      videoViews: 100,
    });

    const history = await loadHookHistory(context(), 'recipefix', 'tiktok');
    const byPlatform = Object.fromEntries(
      history.performance.map((p) => [p.platform, p.viewThroughRate]),
    );
    expect(byPlatform.tiktok).toBeCloseTo(0.9);
    expect(byPlatform.youtube).toBeCloseTo(0.1);
  }, 60_000);

  it('counts one sample per publication, not one per poll', async () => {
    // `collect_metrics` polls a fresh publication five times on its decay
    // schedule. Counting rows would have made one post look like five.
    await seedMeasured({
      platform: 'tiktok',
      hookType: 'problem_state',
      impressions: 1000,
      videoViews: 500,
    });
    const { rows } = await pool.query<{ id: string }>('select id from publications limit 1');
    for (const views of [520, 540, 560]) {
      await pool.query(
        `insert into post_metrics (publication_id, impressions, video_views, collected_at)
         values ($1, 1000, $2, now() + interval '1 minute')`,
        [rows[0]!.id, views],
      );
    }

    const history = await loadHookHistory(context(), 'recipefix', 'tiktok');
    expect(history.performance[0]!.samples).toBe(1);
    // And it is the latest reading, not the first.
    expect(history.performance[0]!.viewThroughRate).toBeCloseTo(0.56);
  }, 60_000);

  it('ignores a post with no impressions rather than dividing by zero', async () => {
    await seedMeasured({
      platform: 'tiktok',
      hookType: 'problem_state',
      impressions: 0,
      videoViews: 0,
    });
    const history = await loadHookHistory(context(), 'recipefix', 'tiktok');
    expect(history.performance).toEqual([]);
  }, 60_000);
});
