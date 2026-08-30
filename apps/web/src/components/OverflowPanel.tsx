/**
 * §380. The writing that did not fit the caption.
 *
 * §215 introduced the overflow with a promise: *"Posted as a first comment or a
 * reply, never discarded. The copy this system writes is genuinely good and the
 * budget is about where it goes, not about cutting it."* `overflow_body` has
 * been written on every piece that had one ever since, and read by **nothing**.
 * So it was discarded — silently, invisibly, on every long piece.
 *
 * It cannot be posted automatically, and that is not an oversight to fix.
 * `adapters/types.ts` says it plainly: there is deliberately no `reply()`
 * method on the interface, because Halyard drafts and a person sends. The same
 * rule the Inbox states about comments applies here.
 *
 * So the repair is to show it to the person who sends, say where it goes, and
 * let them record that they have. Which is the whole of the promise that was
 * actually broken: not that Halyard would post it, but that it would not
 * vanish.
 */
import { Card, SectionTitle } from '@halyard/ui';
import { markOverflowPosted } from '@/app/(dashboard)/queue/actions';

const WHERE: Record<string, string> = {
  first_comment: 'as the first comment, immediately after posting',
  reply: 'as a reply to your own post',
  description: 'in the description field',
};

export function OverflowPanel({
  id,
  body,
  home,
  postedAt,
}: {
  id: string;
  body: string | null;
  home: string | null;
  postedAt: string | null;
}) {
  /* No overflow is the common case and needs no panel. */
  if (!body?.trim()) return null;
  /* `none` means this platform has nowhere for it, which §215 allows. */
  if (home === 'none') return null;

  return (
    <Card className={postedAt ? 'p-4' : 'border-primary/30 bg-primary/5 p-4'}>
      <SectionTitle
        hint={postedAt ? 'you posted this' : (WHERE[home ?? ''] ?? 'somewhere people are reading')}
      >
        The rest of it
      </SectionTitle>

      <p className="whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed text-ink">
        {body}
      </p>

      {postedAt ? (
        <p className="mt-2 text-xs text-muted">
          Marked posted on {new Date(postedAt).toISOString().slice(0, 16).replace('T', ' ')}.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted">
            This did not fit the caption and is not cut. Post it {WHERE[home ?? ''] ?? 'with the piece'},
            then mark it here so it stops asking.
          </p>
          <form action={markOverflowPosted} className="mt-2">
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-1.5 text-xs transition hover:border-primary hover:text-primary"
            >
              I posted it
            </button>
          </form>
        </>
      )}
    </Card>
  );
}
