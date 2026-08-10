import { Badge, Card, EmptyState, PageHeader } from '@halyard/ui';
import { query } from '@/lib/db';
import { formatRelative } from '@/lib/format';
import { addFind, draftFind, discardFind } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Tools and finds. Milestone 28, Part C.
 *
 * Same principle as the Daily Take: Halyard does the assembly, the opinion is
 * the operator's. A find with no "why it is useful" is a bookmark, and Halyard
 * will not draft from it.
 */
export default async function FindsPage() {
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

  return (
    <>
      <PageHeader
        title="Finds"
        subtitle="Tools and things worth sharing. Paste a URL and Halyard summarises it and suggests an angle; you add the one line about why it is useful, and that line is what makes it a post rather than a link dump."
      />

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
                  {formatRelative(find.created_at, 'America/New_York')}
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
