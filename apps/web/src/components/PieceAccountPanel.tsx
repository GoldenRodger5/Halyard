/**
 * §369. Why this piece came out the way it did, on the piece itself.
 *
 * The run view shows this while a piece is being made. This is the same account
 * on the finished thing, which is where an operator actually asks the question
 * — the run page is a URL you had open once, and the piece is a row you come
 * back to.
 *
 * The decisions are read from `job_events`, matched to this content item by the
 * id its own handler logged. Nothing here is written by a model: every director
 * records its own reason, and this collects them.
 */
import { explainPiece, hasAccount, type RecordedEvent } from '@halyard/core';
import { Card, SectionTitle } from '@halyard/ui';
import { query } from '@/lib/db';

export async function PieceAccountPanel({ contentItemId }: { contentItemId: string }) {
  /*
   * Matched through the event detail rather than a column, because a job does
   * not know what it made — the handler logs the id and that is the only link
   * there has ever been. The payload comes along so an operator's own wizard
   * overrides can be told apart from Halyard's decisions.
   */
  const rows = await query<{
    message: string;
    detail: Record<string, unknown> | null;
    stage: string | null;
    at: string;
    payload: Record<string, unknown> | null;
  }>(
    `select e.message, e.detail, e.stage, e.at, j.payload
       from job_events e
       join jobs j on j.id = e.job_id
      where e.job_id in (
        select distinct job_id from job_events
         where detail ->> 'contentItemId' = $1
      )
      order by e.id`,
    [contentItemId],
  );

  if (rows.length === 0) return null;

  const events: RecordedEvent[] = rows.map((r) => ({
    message: r.message,
    detail: r.detail,
    stage: r.stage,
    at: r.at,
  }));
  const overrides = (rows[0]?.payload?.options ?? null) as Record<string, string> | null;
  const account = explainPiece({ events, overrides });
  if (!hasAccount(account)) return null;

  return (
    <Card className="p-4">
      <SectionTitle hint="collected from what each decision recorded, not written afterwards">
        Why it came out this way
      </SectionTitle>

      {account.decisions.length > 0 ? (
        <ul className="space-y-2">
          {account.decisions.map((d, i) => (
            <li key={`${d.about}-${i}`}>
              <p className="text-xs uppercase tracking-[0.08em] text-muted">
                {d.about}
                {d.by === 'operator' ? <span className="ml-1.5 normal-case">· your choice</span> : null}
              </p>
              <p className="text-sm leading-snug text-ink">{d.said}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {account.refusals.length > 0 ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-xs uppercase tracking-[0.08em] text-muted">
            Refused along the way
          </p>
          <ul className="space-y-2">
            {account.refusals.map((r, i) => (
              <li key={`${r.about}-${i}`}>
                <p className="text-xs text-muted">{r.about}</p>
                <p className="text-sm leading-snug text-warn-ink">{r.said}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {account.silent.length > 0 ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-1 text-xs uppercase tracking-[0.08em] text-muted">
            Recorded without a reason
          </p>
          {/*
            A gap in the pipeline's accounting rather than in this reading of
            it, and worth an operator seeing rather than smoothing over.
          */}
          <ul className="space-y-0.5">
            {account.silent.map((line, i) => (
              <li key={i} className="text-xs text-muted">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
