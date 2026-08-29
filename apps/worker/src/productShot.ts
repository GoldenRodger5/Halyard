/**
 * §273. A real screenshot of the product, in the post.
 *
 * Halyard has captured the app since the capture flows were written — three
 * Playwright flows on a schedule, nine assets in production, each tagged with
 * the flow and the step it came from and captioned in plain words. The card
 * templates take a `screenshotDataUri`.
 *
 * **Nothing has ever connected the two.** `screenshotDataUri` had no caller
 * anywhere in the repo, so every capture ever taken sat in the assets table
 * unused while the posts explained the product in words.
 *
 * This is the last hop, and it matters more than any generated picture: a
 * screenshot is the one image in a post that can *evidence* a claim about the
 * software. `imagery/types.ts` says so — `captured` is in
 * `EVIDENTIAL_PROVENANCE` and `generated` is not — which is why a demo beat may
 * carry this and may never carry a hero image.
 *
 * ## Staleness is a correctness problem, not a tidiness one
 *
 * A screenshot of a build that no longer exists shows an interface the reader
 * will not find, which is a false claim about the product made in pictures.
 * `mark_stale_assets` already archives those; this only ever selects unarchived
 * assets and prefers the newest capture of the current build.
 */
import type { HandlerContext } from './poller.js';

export interface ProductShot {
  assetId: string;
  /** The flow step, in plain words. Rendered as the slide's caption. */
  caption: string | null;
  /** The app build this was taken from, when the capture recorded one. */
  appVersion: string | null;
}

/**
 * The freshest usable screenshot of the product, or null.
 *
 * Null is a normal outcome — a product with no capture flows, a first run, a
 * fleet of stale assets — and the caller renders without one rather than
 * failing. The point of the capture system is to improve a post, not to gate it.
 */
export async function pickProductShot(
  ctx: HandlerContext,
  input: {
    productId: string;
    /** Prefer a capture from this flow when one is available. */
    preferFlow?: string;
  },
): Promise<ProductShot | null> {
  const { rows } = await ctx.pool.query<{
    id: string;
    caption: string | null;
    app_version: string | null;
    tags: string[] | null;
  }>(
    `select id, caption, app_version, tags
       from assets
      where product_id = $1
        and source = 'capture'
        and kind = 'screenshot'
        /* Archived means stale: an interface the reader will not find. */
        and archived_at is null
        /* Declared usable on a card, rather than assumed to be. */
        and 'carousel' = any(usable_for)
      order by captured_at desc nulls last, created_at desc
      limit 24`,
    [input.productId],
  );

  if (rows.length === 0) return null;

  /*
   * A preferred flow wins when it is present, because the slide asking for a
   * screenshot knows what it is illustrating better than recency does. Falls
   * back to the newest capture of any flow rather than to nothing.
   */
  const preferred = input.preferFlow
    ? rows.find((r) => (r.tags ?? []).includes(input.preferFlow!))
    : undefined;
  const chosen = preferred ?? rows[0]!;

  return {
    assetId: chosen.id,
    caption: chosen.caption,
    appVersion: chosen.app_version,
  };
}
