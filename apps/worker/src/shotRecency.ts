/**
 * §402. How this product's recent pictures were shot.
 *
 * The read side of `assets.shot` (migration 0072), and the exact counterpart of
 * `recentTreatments` (§394) — which exists because a recency rule seeded with
 * an empty list is not a recency rule, it is a constant.
 *
 * Bounded, because only the recent few matter. A framing used twenty pictures
 * ago is not a repetition anybody perceives, and an unbounded history would
 * eventually make every option equally stale, at which point the rotation stops
 * rotating and collapses back to declaration order.
 */
import type pg from 'pg';

export async function recentShots(
  pool: pg.Pool,
  input: { productId: string; limit?: number },
): Promise<string[]> {
  const { rows } = await pool.query<{ shot: string }>(
    `select shot
       from assets
      where product_id = $1
        and shot is not null
      order by created_at desc
      limit $2`,
    [input.productId, input.limit ?? 12],
  );
  return rows.map((r) => r.shot);
}
