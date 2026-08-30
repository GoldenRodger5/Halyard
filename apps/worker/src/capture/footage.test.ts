/**
 * §163. Finding footage, and the two ways that can go wrong quietly.
 *
 * Both failure modes here are silent: footage that does not exist renders an
 * empty frame, and footage that is months old renders perfectly while showing
 * an interface the product no longer has. Neither announces itself, so both are
 * asserted.
 */
import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { FOOTAGE_MAX_AGE_DAYS, FOOTAGE_TAG, captureFootage } from './footage.js';
import { testContext } from '../testContext.js';

/** A context that records the query it was asked to run. */
function ctxReturning(rows: Array<{ tag: string; age_days: number }>) {
  const seen: Array<{ sql: string; params: unknown[] }> = [];
  /*
   * The cast is on the *pool*, not on the context. A stub pool genuinely is not
   * a `pg.Pool` and saying so is honest; casting the whole context would hide
   * whether it satisfies `HandlerContext`, which is the thing that broke.
   */
  const ctx = testContext({
    pool: {
      query: async (sql: string, params: unknown[]) => {
        seen.push({ sql, params });
        return { rows };
      },
    } as unknown as pg.Pool,
  });
  return { ctx, seen };
}

describe('captureFootage', () => {
  it('reports no footage when no capture recorded any', async () => {
    // The default outcome, and the one the whole path rests on: null here means
    // no demo beat, not a guessed filename.
    const { ctx } = ctxReturning([]);
    expect(await captureFootage(ctx, 'anything')).toBeNull();
  });

  it('reads back the file and length the capture handler wrote', async () => {
    const { ctx } = ctxReturning([
      { tag: `${FOOTAGE_TAG}3800:capture/some_flow.mp4`, age_days: 2 },
    ]);
    const found = await captureFootage(ctx, 'anything');
    expect(found?.file).toBe('capture/some_flow.mp4');
    expect(found?.durationMs).toBe(3800);
    expect(found?.ageDays).toBe(2);
  });

  it.each([
    ['nothing after the prefix', FOOTAGE_TAG],
    ['no duration', `${FOOTAGE_TAG}capture/f.mp4`],
    ['no path', `${FOOTAGE_TAG}3800:`],
    ['a duration that is not a number', `${FOOTAGE_TAG}soon:capture/f.mp4`],
    ['a zero-length cut', `${FOOTAGE_TAG}0:capture/f.mp4`],
  ])('refuses a tag with %s rather than guessing the rest', async (_label, tag) => {
    // A tag that does not parse is not footage. Nothing here fills in a default
    // length or points at the bundle root.
    const { ctx } = ctxReturning([{ tag, age_days: 1 }]);
    expect(await captureFootage(ctx, 'anything')).toBeNull();
  });

  it('bounds the search by age, in the query rather than after it', async () => {
    /*
     * A capture is a claim about what the product looks like now. Filtering in
     * SQL matters: a caller that fetched the newest row and then checked its age
     * would find nothing at all once the newest row aged out, instead of finding
     * the newest row that is still evidence.
     */
    const { ctx, seen } = ctxReturning([]);
    await captureFootage(ctx, 'anything');
    expect(seen[0]!.sql).toMatch(/created_at\s*>\s*now\(\)\s*-/);
    expect(seen[0]!.params).toContain(String(FOOTAGE_MAX_AGE_DAYS));
  });

  it('scopes to the product, so one product never shows another’s interface', async () => {
    const { ctx, seen } = ctxReturning([]);
    await captureFootage(ctx, 'some-product');
    expect(seen[0]!.sql).toMatch(/product_id\s*=\s*\$1/);
    expect(seen[0]!.params[0]).toBe('some-product');
  });

  it('labels the frame without describing what the product does', async () => {
    /*
     * §146's boundary applied to the media path: the label says "this is the
     * product", which is true of every product. Anything more specific would be
     * product vocabulary inside the generic creative layer.
     */
    const { ctx } = ctxReturning([{ tag: `${FOOTAGE_TAG}3800:capture/f.mp4`, age_days: 0 }]);
    const found = await captureFootage(ctx, 'anything');
    expect(found?.label).toBe('In the product');
    expect(JSON.stringify(found)).not.toMatch(/recipe|ingredient|gluten/i);
  });
});
