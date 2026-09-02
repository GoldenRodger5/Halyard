/**
 * §444. Reading the account, across every axis at once.
 *
 * The read side of `readContinuity`. Halyard's five recency mechanisms each ask
 * their own narrow question — `recentShots` reads `assets.shot`,
 * `recentTreatments` reads `renders.treatment`, the caption chooser reads
 * `content_items.caption_shape` — and none of them can see the others, or see
 * further back than "what came immediately before".
 *
 * This is one query returning the last N pieces with every axis attached, so
 * the account can be read as an account rather than as five unrelated
 * rotations. See `packages/core/src/creative/continuity.ts` for what the
 * reading is for and why it augments the choosers rather than replacing them.
 *
 * Scoped to the **product**, matching every other recency query here: an
 * account's look is a property of the product it markets, and the platform
 * accounts share it deliberately.
 */
import type pg from 'pg';
import { readContinuity, type Continuity } from '@halyard/core';

/**
 * The axes, and where each one is actually stored.
 *
 * Named here rather than inferred, because an axis nothing writes would read as
 * a permanently fresh option — the failure §422 records, where `chooseStill`
 * asked for its history under a key nothing writes and fell back to declaration
 * order on all twenty-three stills.
 */
export const CONTINUITY_AXES = ['framing', 'light', 'surface', 'caption_shape', 'treatment'] as const;

export async function continuityFor(
  pool: pg.Pool,
  input: { productId: string; lookback?: number },
): Promise<Continuity> {
  const lookback = input.lookback ?? 8;

  /*
   * Two windows, because the two kinds of axis are not counted in the same
   * unit and pretending otherwise would produce a confident wrong number.
   *
   * `caption_shape` and `treatment` are properties of a *piece*: one value
   * each, so eight pieces is a window of eight. A **shot** is a property of a
   * *picture*, and §407 gives a piece one photograph per beat — so eight
   * pieces is twenty or thirty shots, and `assets` carries no content item to
   * join them back by. Counting them against the same denominator would report
   * a framing as used "3 of 8" when it was 3 of 26.
   *
   * So each is read against its own window and the readings are merged. The
   * axis names keep them apart, which is all `withContinuity` needs.
   */
  const [pieces, shots] = await Promise.all([
    pool.query<{ caption_shape: string | null; treatment: string | null }>(
      `select ci.caption_shape,
              (select r.treatment
                 from renders r
                where r.content_item_id = ci.id and r.treatment is not null
                order by r.created_at desc limit 1) as treatment
         from content_items ci
        where ci.product_id = $1
        order by ci.created_at desc
        limit $2`,
      [input.productId, lookback],
    ),
    pool.query<{ shot: string }>(
      `select shot from assets
        where product_id = $1 and shot is not null
        order by created_at desc
        limit $2`,
      /* Three axes per shot and several shots per piece, so a wider window. */
      [input.productId, lookback * 3],
    ),
  ]);

  const byPiece = readContinuity(
    pieces.rows.map((row) => ({
      caption_shape: row.caption_shape,
      treatment: row.treatment,
    })),
    lookback,
  );

  /*
   * A shot id packs three axes — `overhead_flat_lay/window_soft/worn_wood` —
   * and they vary independently, so they are read independently. An account
   * that rotates framing while shooting everything in warm low light has a
   * problem the framing axis alone cannot see, and `chooseShot` picks each of
   * the three with its own `stalest` call.
   */
  const byShot = readContinuity(
    shots.rows.map((row) => {
      const [framing, light, surface] = row.shot.split('/');
      return { framing: framing || null, light: light || null, surface: surface || null };
    }),
    lookback * 3,
  );

  const overused = [...byPiece.overused, ...byShot.overused];
  return {
    lookback,
    readings: [...byPiece.readings, ...byShot.readings],
    overused,
    summary:
      overused.length === 0
        ? `Nothing is over-represented across the last ${pieces.rows.length} pieces.`
        : overused
            .map((r) => `${r.axis} "${r.value}" in ${r.used} of ${r.of}` + (r.run >= 3 ? `, ${r.run} in a row` : ''))
            .join('; '),
  };
}
