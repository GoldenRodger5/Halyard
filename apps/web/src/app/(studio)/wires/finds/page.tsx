/**
 * §388. Wires ▸ Finds — conversations worth joining.
 *
 * Somebody asking a question this product actually answers, on a post that is
 * not ours. The cheapest reach there is, and the easiest to get wrong: a reply
 * that reads as an advert on somebody else's thread costs more than it earns.
 *
 * So a find is *surfaced*, never answered. The draft is written on request and
 * a person sends it — the same rule as the rest of this room.
 */
import Link from 'next/link';
import { Action, Label, Sheet } from '@halyard/ui/studio';
import { getCurrentProduct } from '@/lib/queries';
import { query } from '@/lib/db';
import { discardFind, draftFind } from '@/app/(studio)/wires/finds/actions';

export const dynamic = 'force-dynamic';

interface FindRow {
  id: string;
  url: string;
  title: string | null;
  summary: string | null;
  suggested_angle: string | null;
  why_useful: string | null;
  source: string | null;
  status: string;
  content_item_id: string | null;
}

export default async function Finds() {
  const product = await getCurrentProduct();
  const finds = await query<FindRow>(
    `select id, url, title, summary, suggested_angle, why_useful, source, status, content_item_id
       from finds
      where ($1::text is null or product_id = $1)
      order by (status = 'new') desc, created_at desc
      limit 40`,
    [product?.id ?? null],
  );

  return (
    <div className="flex max-w-[820px] flex-col gap-3.5">
      <p className="max-w-[74ch] text-sm leading-relaxed text-quiet">
        Somebody asking a question this product actually answers, on a post that is not ours. The
        cheapest reach there is — and the easiest to get wrong.
      </p>

      {finds.length === 0 ? (
        <Sheet tone="cool">
          <Label>Nothing found</Label>
          <p className="max-w-prose text-sm leading-relaxed text-quiet">
            Nothing has been surfaced. Finds come from watch terms — a phrase worth listening for.
            Until one is set and collected, this room stays quiet, which is the correct empty
            state rather than a broken one.
          </p>
        </Sheet>
      ) : (
        finds.map((f) => (
          <Sheet key={f.id} tone={f.status === 'new' ? 'lit' : 'plain'}>
            <div className="mb-1.5 font-data text-[10px] uppercase tracking-[0.08em] text-quiet">
              {f.source ?? 'unknown source'} · {f.status}
            </div>
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block text-[13px] leading-snug hover:text-lit"
            >
              {f.title ?? f.url}
            </a>
            {f.summary ? (
              <p className="mt-1 text-[12px] leading-relaxed text-quiet">{f.summary}</p>
            ) : null}
            {f.why_useful ? (
              <p className="mt-1.5 text-[12px] leading-relaxed text-lit">{f.why_useful}</p>
            ) : null}
            {f.suggested_angle ? (
              <p className="mt-1.5 text-[12px] leading-relaxed text-quiet">
                Angle — {f.suggested_angle}
              </p>
            ) : null}
            <div className="mt-2.5 flex flex-wrap gap-2">
              {f.content_item_id ? (
                <Link
                  href={`/gallery/${f.content_item_id}`}
                  className="rounded-lg border border-rule2 px-2.5 py-1.5 text-[11px] text-quiet transition-colors hover:border-sink hover:text-sink"
                >
                  See the draft →
                </Link>
              ) : (
                <form action={draftFind}>
                  <input type="hidden" name="id" value={f.id} />
                  <Action small>Draft a reply</Action>
                </form>
              )}
              <form action={discardFind}>
                <input type="hidden" name="id" value={f.id} />
                <Action tone="ghost" small>Discard</Action>
              </form>
            </div>
          </Sheet>
        ))
      )}
    </div>
  );
}
