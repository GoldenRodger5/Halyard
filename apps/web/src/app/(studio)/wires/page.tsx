/**
 * §388. Room 5 ▸ Replies — drafted for you to send.
 *
 * The one line that matters here is the one in the copy: **there is no
 * `reply()` on the adapter interface.** Halyard drafts and a person sends, and
 * that is deliberate (v1 §13) — it is the difference between a tool and a bot,
 * and it is why this room is called the Wires rather than the Autoresponder.
 *
 * A comment with no draft is not a failure. The drafter refuses hostility with
 * no question in it rather than producing something defensive, and saying so is
 * more useful than an empty box.
 */
import Link from 'next/link';
import { PLATFORM_LABELS } from '@halyard/ui';
import { Action, Label, Sheet, Tally } from '@halyard/ui/studio';
import { getInbox, getProducts } from '@/lib/queries';
import { formatRelative } from '@/lib/format';
import { draftReply, ignoreComment, markReplied } from '@/app/(dashboard)/inbox/actions';

export const dynamic = 'force-dynamic';

export default async function Wires() {
  const [comments, products] = await Promise.all([getInbox(), getProducts()]);
  const timeZone = products[0]?.operator_timezone ?? 'UTC';
  const pending = comments.filter((c) => c.reply_status === 'pending');

  return (
    <div className="flex max-w-[820px] flex-col gap-3.5">
      <p className="max-w-[74ch] text-sm leading-relaxed text-quiet">
        Engagement in the first thirty to sixty minutes disproportionately determines
        distribution. Halyard drafts a reply for every comment; you send it. There is no{' '}
        <code className="font-data text-[12px]">reply()</code> on the adapter interface — that
        line is the difference between a tool and a bot.
      </p>

      {comments.length === 0 ? (
        <Sheet tone="cool">
          <Label>Nothing on the wire</Label>
          <p className="max-w-prose text-sm leading-relaxed text-quiet">
            Nobody has commented on anything. That follows from nothing having published yet —{' '}
            <Link href="/gallery/onair" className="text-lit underline">On air</Link> shows what
            has.
          </p>
        </Sheet>
      ) : (
        comments.slice(0, 40).map((c) => (
          <Sheet key={c.id} tone={c.reply_status === 'pending' ? 'lit' : 'plain'}>
            <div className="mb-2 flex items-center gap-2">
              <Tally
                state={c.reply_status === 'pending' ? 'holding' : 'ready'}
                on="light"
                size={7}
              />
              <span className="font-data text-[10px] uppercase tracking-[0.08em] text-quiet">
                {PLATFORM_LABELS[c.platform] ?? c.platform}
                {c.posted_at ? ` · ${formatRelative(c.posted_at, timeZone)}` : ''}
                {c.author_handle ? ` · ${c.author_handle}` : ''}
              </span>
            </div>

            <p className="mb-3 text-[13.5px] leading-relaxed">“{c.body}”</p>

            {c.suggested_reply ? (
              <>
                <Label>Drafted on the floor</Label>
                <p className="mb-3 rounded-lg bg-sheet2 px-3 py-2.5 text-[13px] leading-relaxed">
                  {c.suggested_reply}
                </p>
                <div className="flex flex-wrap gap-2">
                  {/*
                    "I sent it" rather than "Send". Halyard cannot send — the
                    adapter has no reply method — so a button labelled Send
                    would be a promise the system cannot keep.
                  */}
                  <form action={markReplied}>
                    <input type="hidden" name="id" value={c.id} />
                    <Action small>I sent it</Action>
                  </form>
                  {c.permalink ? (
                    <a
                      href={c.permalink}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-lg border border-rule2 px-2.5 py-1.5 text-[11px] text-quiet transition-colors hover:border-sink hover:text-sink"
                    >
                      Open it there
                    </a>
                  ) : null}
                  <form action={ignoreComment}>
                    <input type="hidden" name="id" value={c.id} />
                    <Action tone="ghost" small>Skip</Action>
                  </form>
                </div>
              </>
            ) : (
              <>
                <p className="text-[12.5px] leading-relaxed text-quiet">
                  {c.is_support_question
                    ? 'A support question. It is routed to you rather than answered — a wrong answer about somebody’s account is worse than a slow one.'
                    : 'Nothing drafted. The drafter refuses hostility with no question in it rather than producing something defensive.'}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <form action={draftReply}>
                    <input type="hidden" name="id" value={c.id} />
                    <Action tone="ghost" small>Draft one anyway</Action>
                  </form>
                  <form action={ignoreComment}>
                    <input type="hidden" name="id" value={c.id} />
                    <Action tone="ghost" small>Ignore</Action>
                  </form>
                </div>
              </>
            )}
          </Sheet>
        ))
      )}

      {comments.length > 40 ? (
        <p className="text-xs text-quiet">
          Showing the newest 40 of {comments.length}. {pending.length} still waiting on you.
        </p>
      ) : null}
    </div>
  );
}
