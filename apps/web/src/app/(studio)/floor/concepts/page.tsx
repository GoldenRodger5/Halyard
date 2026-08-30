/**
 * §389. Floor ▸ Concepts — be offered several directions and choose one.
 *
 * The brief asks *what shape*; this asks *what about*. The concept generator
 * reads signals, account intelligence and content gaps when nobody has said
 * what they want — an operator brief narrows it rather than replacing it, which
 * is why the input is optional and says so.
 *
 * Every concept carries its own score and the breakdown behind it, so choosing
 * is a judgement made against something rather than a coin toss between four
 * plausible sentences.
 */
import { Action, Label, Sheet, Tally, cx } from '@halyard/ui/studio';
import { getCurrentProduct } from '@/lib/queries';
import { query } from '@/lib/db';
import { rejectBatch, requestConcepts, selectConcept } from '@/app/(studio)/floor/concepts/actions';

export const dynamic = 'force-dynamic';

interface ConceptRow {
  id: string;
  title: string;
  premise: string | null;
  hook: string | null;
  audience: string | null;
  objective: string | null;
  differentiation: string | null;
  platform_intent: string | null;
  /**
   * A Postgres `numeric`, which node-postgres hands back as a **string**.
   *
   * Typed as it actually arrives rather than as it reads, because `null` and
   * `'0.0'` are both falsy-adjacent and `.toFixed` on a string throws — which
   * is exactly what it did. `IdeaRow.score` is typed the same way for the same
   * reason.
   */
  score: string | null;
  status: string;
  rejected_reason: string | null;
  batch_id: string | null;
}

export default async function Concepts() {
  const product = await getCurrentProduct();

  const concepts = await query<ConceptRow>(
    `select id, title, premise, hook, audience, objective, differentiation,
            platform_intent, score, status, rejected_reason, batch_id
       from concepts
      where ($1::text is null or product_id = $1)
        and status in ('proposed', 'selected')
      order by (status = 'proposed') desc, score desc nulls last, created_at desc
      limit 24`,
    [product?.id ?? null],
  );

  const batch = concepts.find((c) => c.status === 'proposed')?.batch_id ?? null;

  return (
    <div className="flex flex-col gap-3.5">
      <Sheet>
        <Label>Ask the room for directions</Label>
        <form action={requestConcepts} className="flex flex-wrap items-center gap-2.5">
          <input type="hidden" name="productId" value={product?.id ?? 'recipefix'} />
          <input
            name="brief"
            placeholder="Describe what you want — or leave it empty and it reads this week’s signals"
            className="min-w-[280px] flex-1 rounded-lg border border-rule2 bg-sheet px-3 py-2 text-[13px] outline-none focus:border-lit"
          />
          <Action tone="brass">Generate concepts</Action>
        </form>
        <p className="mt-2 text-xs leading-relaxed text-quiet">
          Empty is a real answer: the generator reads signals, account intelligence and content
          gaps when nobody has said what they want.
        </p>
      </Sheet>

      {concepts.length === 0 ? (
        <Sheet tone="cool">
          <Label>Nothing proposed</Label>
          <p className="max-w-prose text-sm leading-relaxed text-quiet">
            No concept has been generated. Asking above enqueues a job; the floor picks it up and
            the results land here.
          </p>
        </Sheet>
      ) : (
        <>
          {concepts.map((c) => (
            <Sheet key={c.id} tone={c.status === 'selected' ? 'lit' : 'plain'}>
              <div className="flex flex-wrap items-baseline gap-2.5">
                <Tally state={c.status === 'selected' ? 'working' : 'holding'} on="light" size={7} />
                <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">
                  {c.title}
                </span>
                {/*
                  The score, and nothing implied by it. A number with no
                  breakdown is a ranking somebody has to trust; the breakdown is
                  in `score_breakdown` and belongs on the piece, not the card.
                */}
                {c.score !== null ? (
                  <span className="shrink-0 font-data text-[11px] text-quiet">
                    {Number(c.score).toFixed(1)}
                  </span>
                ) : null}
              </div>

              {c.premise ? (
                <p className="mt-1.5 max-w-[74ch] text-[12.5px] leading-relaxed">{c.premise}</p>
              ) : null}
              {c.hook ? (
                <p className="mt-1.5 max-w-[74ch] text-[12.5px] leading-relaxed text-lit">
                  “{c.hook}”
                </p>
              ) : null}

              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-data text-[10px] uppercase tracking-[0.06em] text-quiet">
                {c.objective ? <span>{c.objective}</span> : null}
                {c.audience ? <span>{c.audience}</span> : null}
                {c.platform_intent ? <span>{c.platform_intent}</span> : null}
              </dl>

              {c.differentiation ? (
                <p className="mt-1.5 max-w-[74ch] text-[11.5px] leading-relaxed text-quiet">
                  Why this one — {c.differentiation}
                </p>
              ) : null}

              {c.status === 'proposed' ? (
                <form action={selectConcept} className="mt-2.5">
                  <input type="hidden" name="conceptId" value={c.id} />
                  <Action small>Take this one to the floor</Action>
                </form>
              ) : (
                <p className={cx('mt-2.5 font-data text-[10px] uppercase tracking-[0.07em] text-lit')}>
                  chosen
                </p>
              )}
            </Sheet>
          ))}

          {batch ? (
            <form action={rejectBatch}>
              <input type="hidden" name="batchId" value={batch} />
              <Action tone="ghost" small>None of these — ask again</Action>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}
