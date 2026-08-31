/**
 * §394. What recent pieces actually drew.
 *
 * §302 chose a quiz treatment by "what has not been used lately" and seeded
 * that list **empty on every render**, so it varied within one video and
 * repeated across videos: question one always drew the same treatment, and two
 * quizzes briefed the same way were identical.
 *
 * The fix is not a better rule — §302's rule is right. It is that the rule was
 * asked the wrong question, because nothing remembered. `renders.treatment`
 * (migration 0071) remembers, and this reads it back.
 *
 * ## Why this lives in the worker
 *
 * The choice used to happen inside the Remotion composition, which runs in a
 * browser bundle and cannot reach a database — §-gotcha-10, and the reason
 * worker-side preparation belongs in `apps/worker`. The worker reads history,
 * decides, and passes the decision down as a prop.
 */
import type pg from 'pg';

/**
 * The treatments this product's recent pieces used, most recent first.
 *
 * Scoped to the template, because a quiz's recency has nothing to say about a
 * walkthrough's. Bounded, because only the last few matter — a treatment used
 * twenty pieces ago is not a repetition anybody perceives, and an unbounded
 * list would eventually forbid everything.
 */
export async function recentTreatments(
  pool: pg.Pool,
  input: { productId: string; templateId: string | string[]; limit?: number },
): Promise<string[]> {
  /*
   * §422. A family, not one id.
   *
   * The still chooser asked for `templateId: 'still'` — a family name — while
   * the render rows carry the actual template, `transformation_diff_4x5`. The
   * filter matched nothing, so the recency list was **always empty** and
   * `chooseStill` fell to declaration order every time. Twenty-three stills in
   * the database, twenty-three the same card.
   *
   * That is §394's defect inside §395's fix: the chooser was written to end
   * exactly this, and its history was asked for under a key nothing writes.
   * Accepting a list is what the caller needed all along.
   */
  const ids = Array.isArray(input.templateId) ? input.templateId : [input.templateId];
  const { rows } = await pool.query<{ treatment: string }>(
    `select r.treatment
       from renders r
       join content_items ci on ci.id = r.content_item_id
      where ci.product_id = $1
        and r.template_id = any($2::text[])
        and r.treatment is not null
      order by r.created_at desc
      limit $3`,
    [input.productId, ids, input.limit ?? 8],
  );
  return rows.map((row) => row.treatment);
}
