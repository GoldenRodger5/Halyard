import { Badge, Card, EmptyState, PageHeader } from '@halyard/ui';
import { query } from '@/lib/db';
import { formatRelative } from '@/lib/format';
import {
  addFind,
  addWatchTerm,
  collectWatchTermsNow,
  discardFind,
  draftFind,
  setWatchTermEnabled,
} from './actions';

export const dynamic = 'force-dynamic';

/**
 * Tools and finds. Milestone 28, Part C.
 *
 * Same principle as the Daily Take: Halyard does the assembly, the opinion is
 * the operator's. A find with no "why it is useful" is a bookmark, and Halyard
 * will not draft from it.
 */
export default async function FindsPage() {
  /**
   * The operator's timezone, read rather than assumed.
   *
   * This page had `'America/New_York'` written into the call below. That is
   * right today and is a constant pretending to be a fact — `products` carries
   * `operator_timezone` and every other screen reads it.
   */
  const [product] = await query<{ operator_timezone: string }>(
    `select operator_timezone from products where kind = 'personal' limit 1`,
  );
  const timeZone = product?.operator_timezone ?? 'UTC';

  const finds = await query<{
    id: string;
    url: string;
    title: string | null;
    summary: string | null;
    suggested_angle: string | null;
    why_useful: string | null;
    source: string;
    status: string;
    created_at: string;
  }>(`select * from finds order by created_at desc limit 40`);

  /**
   * Watch terms, with what each has actually seen.
   *
   * `last_hit_count` and `last_run_at` are shown because a term that has run and
   * found nothing and a term that has never run look identical otherwise, and
   * only one of them is a reason to change the term.
   */
  const watchTerms = await query<{
    id: string;
    term: string;
    sources: string[];
    enabled: boolean;
    min_occurrences: number;
    last_run_at: string | null;
    last_hit_count: number | null;
    last_error: string | null;
    hits: string;
  }>(
    `select w.*, count(h.id) as hits
       from watch_terms w
       left join watch_hits h on h.watch_term_id = w.id
      group by w.id
      order by w.enabled desc, w.term`,
  );

  return (
    <>
      <PageHeader
        title="Finds"
        subtitle="Tools and things worth sharing. Paste a URL and Halyard summarises it and suggests an angle; you add the one line about why it is useful, and that line is what makes it a post rather than a link dump."
      />

      {/* ── What Halyard watches ─────────────────────────────────────────
          The ignition `collect_watch_terms` never had. The job is scheduled
          daily, the handler is written and three sources are implemented — and
          it has read an empty table every day since, because nothing in the
          product could create a term. */}
      <Card className="mb-6 p-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-ink">What Halyard watches</h2>
            <p className="mt-1 text-sm text-muted">
              A standing instruction to notice things. Halyard reads public sources once a day and
              raises a signal when the same question keeps coming up — recurrence is what makes it
              worth writing about, so a one-off never becomes one.
            </p>
          </div>
          <form action={collectWatchTermsNow}>
            <input type="hidden" name="product" value="recipefix" />
            <button className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
              Collect now
            </button>
          </form>
        </div>

        <form action={addWatchTerm} className="mt-4 space-y-3">
          <input type="hidden" name="product" value="recipefix" />
          <div className="flex gap-2">
            <input
              name="term"
              required
              placeholder="gluten free bread gummy"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
            <button className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark">
              Watch
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
            {(['reddit', 'rss', 'pinterest'] as const).map((source) => (
              <label key={source} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  name={`source_${source}`}
                  defaultChecked={source === 'reddit'}
                  className="rounded border-line"
                />
                {source}
              </label>
            ))}
            <label className="flex items-center gap-1.5">
              seen at least
              <input
                type="number"
                name="minOccurrences"
                defaultValue={3}
                min={2}
                max={10}
                className="w-14 rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink"
              />
              times in 30 days
            </label>
          </div>
        </form>

        {watchTerms.length > 0 ? (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {watchTerms.map((term) => (
              <li key={term.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <span className={term.enabled ? 'text-sm text-ink' : 'text-sm text-muted line-through'}>
                  {term.term}
                </span>
                <span className="text-xs text-muted">{term.sources.join(', ')}</span>
                <span className="text-xs text-muted">
                  {/* Never run and ran-and-found-nothing are different facts. */}
                  {term.last_run_at
                    ? `${term.hits} hit${term.hits === '1' ? '' : 's'} · last read ${formatRelative(term.last_run_at, timeZone)}`
                    : 'never read yet'}
                </span>
                {term.last_error ? (
                  <span className="text-xs text-danger">{term.last_error}</span>
                ) : null}
                <form action={setWatchTermEnabled} className="ml-auto">
                  <input type="hidden" name="id" value={term.id} />
                  <input type="hidden" name="enabled" value={term.enabled ? 'false' : 'true'} />
                  <button className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:bg-sunk hover:text-ink">
                    {term.enabled ? 'Stop watching' : 'Resume'}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
            Nothing is being watched, so the daily collection reads nothing and raises no signals.
          </p>
        )}
      </Card>

      <Card className="mb-6 p-5">
        <form action={addFind} className="space-y-3">
          <div className="flex gap-2">
            <input
              name="url"
              required
              placeholder="https://..."
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
            <button className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark">
              Add
            </button>
          </div>
          <input
            name="whyUseful"
            placeholder="why is it useful? (you can add this later, but nothing drafts without it)"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
        </form>

        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-primary">
            Capture from anywhere: bookmarklet and iOS Shortcut
          </summary>
          <div className="mt-2 space-y-2 text-xs leading-relaxed text-muted">
            <p>Drag this to your bookmarks bar:</p>
            <code className="block overflow-x-auto rounded bg-sunk p-2 font-mono text-[11px]">
              {`javascript:(()=>{fetch('${''}/api/finds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:location.href,title:document.title})}).then(()=>alert('Saved to Halyard'))})()`}
            </code>
            <p>
              For iOS, make a Shortcut with a “Get Contents of URL” action posting the same JSON to{' '}
              <code className="rounded bg-sunk px-1">/api/finds</code> from the share sheet.
            </p>
          </div>
        </details>
      </Card>

      {finds.length === 0 ? (
        <EmptyState
          title="Nothing saved"
          body="A find becomes a post the same way a take does: the system assembles, you supply the opinion."
        />
      ) : (
        <ul className="space-y-3">
          {finds.map((find) => (
            <Card as="li" key={find.id} className="p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge tone={find.status === 'new' ? 'info' : 'neutral'}>{find.status}</Badge>
                <Badge tone="neutral">{find.source}</Badge>
                <span className="text-xs text-muted">
                  {formatRelative(find.created_at, timeZone)}
                </span>
              </div>

              <a
                href={find.url}
                target="_blank"
                rel="noreferrer"
                className="font-serif text-xl leading-snug text-ink hover:text-primary"
              >
                {find.title ?? find.url}
              </a>

              {find.summary ? (
                <p className="mt-1 text-sm leading-relaxed text-muted">{find.summary}</p>
              ) : null}

              {find.suggested_angle ? (
                <p className="mt-2 rounded-lg bg-sunk/60 p-2 text-sm text-ink">
                  <span className="text-xs uppercase tracking-[0.1em] text-muted">Angle</span>{' '}
                  {find.suggested_angle}
                </p>
              ) : null}

              {find.why_useful ? (
                <p className="mt-2 text-sm italic text-muted">{find.why_useful}</p>
              ) : (
                <form action={draftFind} className="mt-3 flex gap-2">
                  <input type="hidden" name="id" value={find.id} />
                  <input
                    name="whyUseful"
                    required
                    placeholder="why is it useful? one line"
                    className="min-w-0 flex-1 rounded-lg border border-line px-2.5 py-1.5 text-sm"
                  />
                  <button className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white">
                    Draft it
                  </button>
                </form>
              )}

              <form action={discardFind} className="mt-2">
                <input type="hidden" name="id" value={find.id} />
                <button className="text-xs text-muted hover:text-danger">Discard</button>
              </form>
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}
