import { Badge, Card, EmptyState, PLATFORM_LABELS, PageHeader, PlatformDot } from '@halyard/ui';
import { getInbox, getProducts, getReplyHistory } from '@/lib/queries';
import { formatDuration, formatRelative, truncate } from '@/lib/format';
import { draftReply, markReplied, ignoreComment, routeToSupport } from './actions';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const [comments, products, replies] = await Promise.all([
    getInbox(),
    getProducts(),
    getReplyHistory(),
  ]);
  const timeZone = products[0]?.operator_timezone ?? 'UTC';

  const pending = comments.filter((c) => c.reply_status === 'pending');
  const handled = comments.filter((c) => c.reply_status !== 'pending');

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Engagement in the first thirty to sixty minutes disproportionately determines distribution. Halyard drafts a reply for every comment; you send it. Nothing here sends anything on its own."
      />

      <Card className="mb-6 border-primary/25 bg-primary/5 p-4">
        <p className="text-sm leading-relaxed text-ink">
          There is no auto-reply in this system, and no <code className="rounded bg-sunk px-1">reply()</code>{' '}
          method on the adapter interface. That line is the difference between a growth tool and a
          spam operation, and it is enforced in code rather than policy.
        </p>
      </Card>

      {/* ── What replying has actually looked like ────────────────────────
          `comment_replies` has been written on every reply and read by
          nothing. These three numbers are the only record of whether the
          drafter earns its place, and they had no surface. */}
      {replies.sent > 0 ? (
        <Card className="mb-6 p-4">
          <p className="text-sm text-ink">
            {replies.sent} repl{replies.sent === 1 ? 'y' : 'ies'} sent.{' '}
            {replies.aiDrafted === 0 ? (
              <>None had a draft to work from, so nothing here says whether the drafter helps.</>
            ) : (
              <>
                {replies.aiDrafted} had a draft, and you changed {replies.edited} of them
                {replies.aiDrafted > 0 ? ` (${Math.round((replies.edited / replies.aiDrafted) * 100)}%)` : ''}
                . A reply written from scratch is not counted as an edit — there was nothing to
                edit.
              </>
            )}
            {replies.medianLatencySeconds !== null ? (
              <>
                {' '}
                Median reply time {formatDuration(replies.medianLatencySeconds)}.
              </>
            ) : null}
          </p>
        </Card>
      ) : null}

      {comments.length === 0 ? (
        <EmptyState
          title="No comments yet"
          body="Comments are polled for 24 hours after publication at declining frequency: every five minutes at first, then fifteen, then hourly."
        />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 font-serif text-2xl text-ink">
              Waiting on you{' '}
              <span className="align-middle text-base text-muted">({pending.length})</span>
            </h2>
            {pending.length === 0 ? (
              <Card className="p-5 text-sm text-muted">Everything is answered.</Card>
            ) : (
              <ul className="space-y-3">
                {pending.map((comment) => (
                  <Card as="li" key={comment.id} className="p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <PlatformDot platform={comment.platform} />
                      <span>{PLATFORM_LABELS[comment.platform] ?? comment.platform}</span>
                      <span>·</span>
                      <span className="text-ink">{comment.author_handle ?? 'someone'}</span>
                      <span>·</span>
                      <span>{formatRelative(comment.posted_at, timeZone)}</span>
                      {comment.is_support_question ? <Badge tone="warn">support question</Badge> : null}
                      {comment.sentiment ? <Badge tone="neutral">{comment.sentiment}</Badge> : null}
                    </div>

                    <p className="mb-1 text-xs text-muted">
                      On: {truncate(comment.post_body, 90)}
                    </p>
                    <p className="rounded-lg bg-sunk/60 p-3 text-sm leading-relaxed text-ink">
                      {comment.body}
                    </p>

                    {comment.suggested_reply ? (
                      <form action={markReplied} className="mt-3 space-y-2">
                        <input type="hidden" name="id" value={comment.id} />
                        <label className="block text-xs uppercase tracking-[0.1em] text-muted">
                          Suggested reply, edit before sending
                        </label>
                        <textarea
                          name="body"
                          defaultValue={comment.suggested_reply}
                          rows={3}
                          className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed focus:border-primary focus:outline-none"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
                            Mark sent
                          </button>
                        </div>
                      </form>
                    ) : (
                      <form action={draftReply} className="mt-3">
                        <input type="hidden" name="id" value={comment.id} />
                        <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                          Draft a reply
                        </button>
                      </form>
                    )}

                    <div className="mt-2 flex flex-wrap gap-2">
                      <form action={routeToSupport}>
                        <input type="hidden" name="id" value={comment.id} />
                        <button className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:bg-sunk">
                          Route to hello@
                        </button>
                      </form>
                      <form action={ignoreComment}>
                        <input type="hidden" name="id" value={comment.id} />
                        <button className="rounded-lg px-2.5 py-1 text-xs text-muted hover:bg-sunk">
                          Ignore
                        </button>
                      </form>
                      {comment.permalink ? (
                        <a
                          href={comment.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg px-2.5 py-1 text-xs text-primary hover:bg-sunk"
                        >
                          Open on {PLATFORM_LABELS[comment.platform]}
                        </a>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </ul>
            )}
          </section>

          {handled.length > 0 ? (
            <section>
              <h2 className="mb-3 font-serif text-2xl text-ink">Handled</h2>
              <Card className="divide-y divide-line">
                {handled.map((comment) => (
                  <div key={comment.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <PlatformDot platform={comment.platform} />
                    <span className="text-muted">{comment.author_handle ?? 'someone'}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{comment.body}</span>
                    <Badge tone={comment.reply_status === 'replied' ? 'good' : 'neutral'}>
                      {comment.reply_status}
                    </Badge>
                  </div>
                ))}
              </Card>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
