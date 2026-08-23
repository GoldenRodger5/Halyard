import { Badge, Card, EmptyState, PageHeader, SectionTitle } from '@halyard/ui';
import { query } from '@/lib/db';
import { formatRelative } from '@/lib/format';
import { TakeComposer } from './TakeComposer';
import { approveTake, discardTake } from './actions';

export const dynamic = 'force-dynamic';

/**
 * The Daily Take. Milestone 28, Part B.
 *
 * The canonical input-gated screen: five ranked stories, and nothing happens
 * until the founder says what they think. There is deliberately no "generate a
 * take for me" button anywhere on this page.
 */
export default async function TakePage() {
  const stories = await query<{
    id: string;
    title: string;
    url: string;
    summary: string | null;
    published_at: string | null;
    feed_count: number;
    relevance: string | null;
    rank_reason: string | null;
    contested: string | null;
    source_name: string;
  }>(
    `select i.id, i.title, i.url, i.summary, i.published_at, i.feed_count,
            i.relevance, i.rank_reason, i.contested, s.name as source_name
       from rss_items i
       join rss_sources s on s.id = i.source_id
      where i.product_id = 'founder'
        and i.status in ('new','surfaced')
        and i.expires_at > now()
      order by i.relevance desc nulls last, i.published_at desc
      limit 5`,
  );

  const openTakes = await query<{
    id: string;
    raw_input: string;
    status: string;
    draft: string | null;
    fact_check: Array<{ claim: string; verdict: string; note: string; correction?: string }>;
    strongest_counter: string | null;
    risk_flags: Array<{ kind: string; detail: string }>;
    likely_pushback: string[];
    story_title: string | null;
    created_at: string;
  }>(
    `select t.id, t.raw_input, t.status, t.draft, t.fact_check, t.strongest_counter,
            t.risk_flags, t.likely_pushback, i.title as story_title, t.created_at
       from takes t
       left join rss_items i on i.id = t.rss_item_id
      where t.status not in ('discarded','approved')
      order by t.created_at desc
      limit 5`,
  );

  const sources = await query<{ name: string; last_polled_at: string | null; last_error: string | null }>(
    `select name, last_polled_at, last_error from rss_sources
      where product_id = 'founder' and enabled order by name`,
  );

  return (
    <>
      <PageHeader
        title="Daily Take"
        subtitle="Five stories, ranked. Halyard has no opinion about any of them, so nothing is drafted until you give it one. Skip a day and no opinion content goes out — that is correct, not a gap."
      />

      <Card className="mb-6 border-primary/25 bg-primary/5 p-4">
        <p className="text-sm leading-relaxed text-ink">
          Your line is fact-checked <strong>before</strong> anything is drafted, so you can revise
          your own take rather than publish something false at speed. If the check contradicts your
          central claim, Halyard stops and says so.
        </p>
      </Card>

      {stories.length === 0 ? (
        <EmptyState
          title="No stories yet"
          body={
            sources.some((s) => s.last_polled_at)
              ? 'Nothing in the last 24 hours cleared the relevance bar. Stories expire after 72 hours rather than lingering.'
              : 'The RSS poller has not run yet. It reads eight feeds hourly, filtered to Hacker News above 100 points plus the primary lab sources.'
          }
        />
      ) : (
        <div className="space-y-4">
          {stories.map((story, index) => (
            <Card key={story.id} className="p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-serif text-lg text-ink">{index + 1}</span>
                <Badge tone="neutral">{story.source_name}</Badge>
                {story.feed_count > 1 ? (
                  <Badge tone="info">{story.feed_count} feeds carried it</Badge>
                ) : null}
                <span>{formatRelative(story.published_at, 'America/New_York')}</span>
              </div>

              <h2 className="font-serif text-2xl leading-snug text-ink">
                <a href={story.url} target="_blank" rel="noreferrer" className="hover:text-primary">
                  {story.title}
                </a>
              </h2>

              {story.summary ? (
                <p className="mt-2 text-sm leading-relaxed text-muted">{story.summary}</p>
              ) : null}

              {story.rank_reason ? (
                <p className="mt-3 text-xs text-muted">
                  <span className="uppercase tracking-[0.1em]">Ranked because</span>{' '}
                  {story.rank_reason}
                </p>
              ) : null}

              {story.contested ? (
                <p className="mt-2 rounded-lg bg-sunk/60 p-3 text-sm leading-relaxed text-ink">
                  <span className="text-xs uppercase tracking-[0.1em] text-muted">
                    What is contested
                  </span>
                  <br />
                  {story.contested}
                </p>
              ) : null}

              <TakeComposer storyId={story.id} storyTitle={story.title} />
            </Card>
          ))}
        </div>
      )}

      {openTakes.length > 0 ? (
        <section className="mt-10">
          <SectionTitle hint="raw input kept alongside the draft">In progress</SectionTitle>
          <div className="space-y-4">
            {openTakes.map((take) => (
              <Card key={take.id} className="p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      take.status === 'needs_revision'
                        ? 'warn'
                        : take.status === 'drafted'
                          ? 'good'
                          : 'neutral'
                    }
                  >
                    {take.status.replace(/_/g, ' ')}
                  </Badge>
                  {take.story_title ? (
                    <span className="text-sm text-muted">{take.story_title}</span>
                  ) : null}
                </div>

                <p className="text-xs uppercase tracking-[0.1em] text-muted">My take, raw</p>
                <p className="mb-4 rounded-lg bg-sunk/60 p-3 font-mono text-sm text-ink">
                  {take.raw_input}
                </p>

                {take.fact_check.length > 0 ? (
                  <div className="mb-4">
                    <p className="mb-1 text-xs uppercase tracking-[0.1em] text-muted">Fact check</p>
                    <ul className="space-y-1.5">
                      {take.fact_check.map((claim, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span
                            className={
                              claim.verdict === 'supported'
                                ? 'text-good'
                                : claim.verdict === 'contradicted'
                                  ? 'text-danger'
                                  : 'text-warn-ink'
                            }
                          >
                            {claim.verdict === 'supported' ? '✓' : claim.verdict === 'contradicted' ? '×' : '!'}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="text-ink">{claim.claim}</span>
                            {claim.note ? (
                              <span className="block text-xs text-muted">{claim.note}</span>
                            ) : null}
                            {claim.correction ? (
                              <span className="block text-xs text-warn-ink">
                                Corrected in the draft: {claim.correction}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {take.strongest_counter ? (
                  <div className="mb-4">
                    <p className="mb-1 text-xs uppercase tracking-[0.1em] text-muted">
                      Strongest counter
                    </p>
                    <p className="text-sm leading-relaxed text-ink">{take.strongest_counter}</p>
                  </div>
                ) : null}

                {take.risk_flags.length > 0 ? (
                  <div className="mb-4 rounded-lg border border-warn/30 bg-warn/10 p-3">
                    <p className="mb-1 text-xs uppercase tracking-[0.1em] text-warn-ink">Risk</p>
                    <ul className="space-y-1 text-sm text-ink">
                      {take.risk_flags.map((flag, i) => (
                        <li key={i}>
                          <span className="text-muted">{flag.kind.replace(/_/g, ' ')}:</span>{' '}
                          {flag.detail}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted">
                      Flagged, not refused. It is your call — you just should not walk into it blind.
                    </p>
                  </div>
                ) : null}

                {take.draft ? (
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-[0.1em] text-muted">Draft</p>
                    <p className="rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed text-ink">
                      {take.draft}
                    </p>
                  </div>
                ) : null}

                {take.likely_pushback.length > 0 ? (
                  <div className="mt-3">
                    <p className="mb-1 text-xs uppercase tracking-[0.1em] text-muted">
                      Likely pushback
                    </p>
                    <ol className="list-inside list-decimal space-y-0.5 text-sm text-muted">
                      {take.likely_pushback.map((push, i) => (
                        <li key={i}>{push}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                {/* ── The end of the workflow, which had no controls ─────────
                    `approveTake` and `discardTake` were complete server
                    actions referenced from nowhere — not a page, not a
                    component, not a test. A take could be spoken, fact-checked
                    and drafted, and then the operator had no way to act on it.
                    Approving is what puts it in the queue as
                    `pending_approval`, where every normal gate applies. */}
                {take.draft ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                    <form action={approveTake}>
                      <input type="hidden" name="takeId" value={take.id} />
                      <button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
                        Send to queue
                      </button>
                    </form>
                    <form action={discardTake}>
                      <input type="hidden" name="takeId" value={take.id} />
                      <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                        Discard
                      </button>
                    </form>
                    <p className="w-full text-xs text-muted">
                      Sending it to the queue does not publish it. It arrives as a draft awaiting
                      approval, like anything else Halyard writes.
                    </p>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <SectionTitle hint="RSS, not a paid news API">Sources</SectionTitle>
        <Card className="divide-y divide-line">
          {sources.map((source) => (
            <div key={source.name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="text-ink">{source.name}</span>
              <span className="ml-auto text-xs text-muted">
                {source.last_error
                  ? source.last_error
                  : source.last_polled_at
                    ? `polled ${formatRelative(source.last_polled_at, 'America/New_York')}`
                    : 'never polled'}
              </span>
            </div>
          ))}
        </Card>
      </section>
    </>
  );
}
