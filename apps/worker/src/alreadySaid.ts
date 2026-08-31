/**
 * §401. What this account has already said.
 *
 * `research()` takes a subject and no memory, so the same subject produces the
 * same facts every time — and the same facts produce the same questions. Run the
 * pipeline twice on gluten and it returns Beccari and 1728 twice.
 *
 * The memory exists. `content_items.claims` records every fact a piece used,
 * with its text and its source, and **nothing has ever read it back** — the same
 * shape as `renders.treatment` before §394.
 *
 * ## Why claims and not sources
 *
 * A source is reusable and a *claim* is not. Britannica's gluten page can back
 * twenty different facts; saying the same one of them twice is the repetition a
 * viewer notices. So the exclusion is by what was said, not by where it came
 * from — excluding whole domains would starve the research instead of steering
 * it.
 */
import type pg from 'pg';

export interface AlreadySaid {
  /** Claims recent pieces made, most recent first. */
  claims: string[];
  /** Openings recent pieces used — first lines and quiz questions. */
  openings: string[];
}

/**
 * What has been said lately, for this product.
 *
 * Bounded by time and by count. A fact used a year ago is available again; one
 * used yesterday is not. Unbounded exclusion would eventually forbid everything
 * and leave a subject unwritable, which is worse than a repeat.
 */
export async function alreadySaid(
  pool: pg.Pool,
  input: { productId: string; days?: number; limit?: number },
): Promise<AlreadySaid> {
  const days = input.days ?? 60;
  const limit = input.limit ?? 40;

  /*
   * One pass over the pieces, taking both. The first version used a UNION with
   * a single LIMIT, which the claims consumed entirely and left the openings
   * empty — two questions sharing one budget.
   */
  const { rows } = await pool.query<{ claims: string[] | null; opening: string | null }>(
    `select
       coalesce(
         (select array_agg(c ->> 'text')
            from jsonb_array_elements(coalesce(ci.claims, '[]'::jsonb)) c
           where c ->> 'text' is not null),
         '{}'
       ) as claims,
       nullif(trim(coalesce(ci.title, left(ci.body, 120))), '') as opening
     from content_items ci
     where ci.product_id = $1
       and ci.created_at > now() - ($2 || ' days')::interval
       and ci.status <> 'rejected'
     order by ci.created_at desc
     limit $3`,
    [input.productId, String(days), limit],
  );

  const claims: string[] = [];
  const openings: string[] = [];
  for (const row of rows) {
    for (const claim of row.claims ?? []) {
      if (claim?.trim()) claims.push(claim.trim());
    }
    if (row.opening?.trim()) openings.push(row.opening.trim());
  }

  /*
   * De-duplicated and capped. The same fact appearing on four platforms is one
   * fact to avoid, and a prompt carrying forty near-identical lines spends its
   * context saying one thing.
   */
  return {
    claims: [...new Set(claims)].slice(0, limit),
    openings: [...new Set(openings)].slice(0, limit),
  };
}
