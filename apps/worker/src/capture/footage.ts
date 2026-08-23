/**
 * Finding the footage a capture produced.
 *
 * §163. The cut lives in the render bundle's public directory, because that is
 * where Remotion serves static files from; what lives in the database is a
 * pointer to it, written as a tag on the capture's video asset. This reads that
 * pointer back.
 *
 * The rule the whole path rests on: **no row means no footage**, and no footage
 * means the plan simply has no demo beat. Nothing here invents a filename,
 * falls back to a previous capture's file, or reports footage it did not find.
 */
import type { HandlerContext } from '../poller.js';

/** Tag prefix written by the capture handler. */
export const FOOTAGE_TAG = 'footage:';

/**
 * How old captured footage may be before it stops being evidence.
 *
 * A capture is a claim about what the product looks like. A product that ships
 * at all will have moved on within a month, so an older recording is a claim
 * about an interface that may no longer exist — and the failure mode is silent,
 * because stale footage renders perfectly. The scheduler recaptures well inside
 * this, so reaching the bound means captures have been failing.
 */
export const FOOTAGE_MAX_AGE_DAYS = 30;

export interface CapturedFootage {
  /** Path relative to the render bundle's public directory. */
  file: string;
  /** The on-screen label, or none. */
  label?: string;
  /**
   * How long the cut runs.
   *
   * §163. The beat is sized from this. Without it a held emphasis stretched an
   * eight-second beat over 3.8 seconds of footage and Remotion froze the last
   * frame for the remainder — a real frame, but four seconds of stillness sold
   * as a demo.
   */
  durationMs: number;
  /** How old the recording is, so a caller can report it rather than guess. */
  ageDays: number;
}

/**
 * The newest usable footage for a product, or `null`.
 */
export async function captureFootage(
  ctx: HandlerContext,
  productId: string,
): Promise<CapturedFootage | null> {
  const { rows } = await ctx.pool.query<{ tag: string; age_days: number }>(
    `select t as tag, extract(epoch from (now() - a.created_at)) / 86400 as age_days
       from assets a, unnest(a.tags) as t
      where a.product_id = $1
        and t like $2
        and a.created_at > now() - ($3 || ' days')::interval
      order by a.created_at desc
      limit 1`,
    [productId, `${FOOTAGE_TAG}%`, String(FOOTAGE_MAX_AGE_DAYS)],
  );

  const row = rows[0];
  if (!row) return null;

  // `footage:<ms>:<path>` — duration first, so the path keeps whatever shape it
  // has. A tag that does not parse is not footage; nothing is guessed from it.
  const rest = row.tag.slice(FOOTAGE_TAG.length);
  const split = rest.indexOf(':');
  if (split < 0) return null;

  const durationMs = Number(rest.slice(0, split));
  const file = rest.slice(split + 1);
  if (!file || !Number.isFinite(durationMs) || durationMs <= 0) return null;

  return {
    file,
    durationMs,
    // Deliberately generic. The label says the frame is the product itself, and
    // says nothing about what the product does — that would be the one place
    // product vocabulary could leak into the generic creative layer.
    label: 'In the product',
    ageDays: Math.round(Number(row.age_days)),
  };
}
