/**
 * §388. Wires ▸ Daily Take — your opinion, which nothing writes without.
 *
 * Five stories, ranked. Halyard has no opinion about any of them and will not
 * invent one: `submitTake` returns immediately on an empty input, and the whole
 * opinion pipeline starts from a sentence a person typed.
 *
 * Skipping a day means no opinion content goes out. That is correct, not a gap
 * — the alternative is a system with confident views nobody holds, which is the
 * single fastest way to make an account untrustworthy.
 */
import { Action, Label, Sheet } from '@halyard/ui/studio';
import { query } from '@/lib/db';
import { formatInOperatorTz } from '@/lib/format';
import { submitTake } from '@/app/(dashboard)/take/actions';

export const dynamic = 'force-dynamic';

interface StoryRow {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  published_at: string | null;
  feed_count: number | null;
  rank_reason: string | null;
  tz: string | null;
}

interface TakeRow {
  id: string;
  raw_input: string;
  status: string;
  draft: string | null;
  fact_check: string | null;
  fact_check_ok: boolean | null;
  likely_pushback: string | null;
  content_item_id: string | null;
  title: string | null;
}

export default async function DailyTake() {
  const [stories, takes] = await Promise.all([
    query<StoryRow>(
      `select r.id, r.title, r.url, r.summary, r.published_at, r.feed_count, r.rank_reason,
              (select operator_timezone from products order by (kind = 'product') desc limit 1) as tz
         from rss_items r
        where r.status in ('new','surfaced') and r.expires_at > now()
        order by r.relevance desc nulls last, r.published_at desc nulls last
        limit 5`,
    ),
    query<TakeRow>(
      `select t.id, t.raw_input, t.status, t.draft, t.fact_check, t.fact_check_ok,
              t.likely_pushback, t.content_item_id, r.title
         from takes t
         left join rss_items r on r.id = t.rss_item_id
        where t.status <> 'discarded'
        order by t.created_at desc
        limit 5`,
    ),
  ]);

  const tz = stories[0]?.tz ?? 'UTC';

  return (
    <div className="flex max-w-[820px] flex-col gap-3.5">
      <Sheet>
        <Label>Five stories, ranked · Halyard has no opinion about any of them</Label>
        <p className="mb-3 max-w-[74ch] text-[12.5px] leading-relaxed text-quiet">
          Nothing is drafted until you give it one. Skip a day and no opinion content goes out —
          that is correct, not a gap.
        </p>

        {stories.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-quiet">
            No story is live. Stories expire, so an empty list means the feeds have nothing recent
            rather than that nothing was collected.
          </p>
        ) : (
          <ul className="flex flex-col">
            {stories.map((s) => (
              <li key={s.id} className="border-t border-rule2 py-3 first:border-t-0 first:pt-0">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block text-[13px] leading-snug hover:text-lit"
                >
                  {s.title}
                </a>
                <p className="mt-0.5 text-[11.5px] text-quiet">
                  {[
                    s.rank_reason,
                    s.feed_count ? `carried by ${s.feed_count} feeds` : null,
                    s.published_at ? formatInOperatorTz(s.published_at, tz, 'd MMM, HH:mm') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {/*
                  The input is the whole point, so it is on the page rather than
                  behind a button. Nothing is drafted from a story alone.
                */}
                <form action={submitTake} className="mt-2 flex flex-wrap gap-2">
                  <input type="hidden" name="storyId" value={s.id} />
                  <input
                    name="rawInput"
                    required
                    placeholder="Your take, in your own words. One sentence is enough."
                    className="min-w-[240px] flex-1 rounded-[7px] border border-rule2 bg-sheet px-2.5 py-2 text-xs outline-none focus:border-lit"
                  />
                  <Action tone="ghost" small>Draft from this</Action>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      {takes.length > 0 ? (
        <Sheet tone="lit">
          <Label>In progress</Label>
          {takes.map((t) => (
            <div key={t.id} className="border-t border-rule2 py-3 first:border-t-0 first:pt-0">
              <div className="font-data text-[9.5px] uppercase tracking-[0.1em] text-quiet">
                My take, raw
              </div>
              <p className="mt-1 rounded-lg bg-sheet2 px-2.5 py-2 font-data text-[12px] leading-relaxed">
                {t.raw_input}
              </p>

              {t.fact_check ? (
                <>
                  <div className="mt-2.5 font-data text-[9.5px] uppercase tracking-[0.1em] text-quiet">
                    Fact check
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed">
                    <span className={t.fact_check_ok ? 'text-passed' : 'text-onair'}>
                      {t.fact_check_ok ? '✓' : '✗'}
                    </span>{' '}
                    {t.fact_check}
                  </p>
                </>
              ) : null}

              {t.draft ? (
                <>
                  <div className="mt-2.5 font-data text-[9.5px] uppercase tracking-[0.1em] text-quiet">
                    Draft
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed">{t.draft}</p>
                </>
              ) : (
                <p className="mt-2 text-[12px] text-quiet">
                  {t.status === 'checking'
                    ? 'Being checked. Nothing is drafted until the claim survives it.'
                    : `Status: ${t.status}.`}
                </p>
              )}

              {t.likely_pushback ? (
                <p className="mt-2 text-[12px] leading-relaxed text-quiet">
                  Likely pushback — {t.likely_pushback}
                </p>
              ) : null}
            </div>
          ))}
        </Sheet>
      ) : null}
    </div>
  );
}
