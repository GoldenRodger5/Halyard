/**
 * §389. Floor ▸ Sources — what a brief can draw on.
 *
 * Three inventories that feed the same decision: **ideas** (what to make),
 * **hooks** (how to open it) and the **swipe file** (what somebody else did
 * that worked). They are one tab because a brief draws on all three at once and
 * an operator does not think about them separately.
 *
 * ## `avg_stop_rate` is a measurement, and mostly absent
 *
 * A hook's score is only meaningful once something using it has published and
 * been measured. Until then it is `null` and prints as a dash — gotcha 9 again.
 * A hook library sorted by a confident-looking score nobody measured would be
 * the most damaging kind of wrong here, because it would shape every opening
 * line the system writes.
 */
import Link from 'next/link';
import { Label, Sheet, cx } from '@halyard/ui/studio';
import { getCurrentProduct, getIdeas } from '@/lib/queries';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface HookRow {
  id: string;
  pattern: string;
  hook_type: string | null;
  category: string | null;
  uses: number;
  /* Postgres `numeric` arrives as a string. Parsed at the point of use. */
  avg_stop_rate: string | null;
  avg_score: string | null;
  active: boolean;
}

interface SwipeRow {
  id: string;
  url: string;
  hook_text: string | null;
  platform: string | null;
  why_it_works: string | null;
}

export default async function Sources() {
  const product = await getCurrentProduct();

  const [ideas, hooks, swipe] = await Promise.all([
    getIdeas(),
    query<HookRow>(
      `select id, pattern, hook_type, category, uses, avg_stop_rate, avg_score, active
         from hooks
        where ($1::text is null or product_id = $1) and active
        order by uses desc, created_at desc
        limit 24`,
      [product?.id ?? null],
    ),
    query<SwipeRow>(
      `select id, url, hook_text, platform, why_it_works
         from references_swipe
        where ($1::text is null or product_id = $1)
        order by added_at desc nulls last, created_at desc
        limit 12`,
      [product?.id ?? null],
    ),
  ]);

  const measured = hooks.filter((h) => h.avg_stop_rate !== null).length;

  return (
    <div className="flex flex-col gap-3.5">
      <Sheet>
        <Label>Ideas · {ideas.length}</Label>
        {ideas.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-quiet">
            No idea is proposed. The daily job proposes them; briefing the floor directly does not
            need one.
          </p>
        ) : (
          <ul className="flex flex-col">
            {ideas.slice(0, 10).map((idea) => (
              <li key={idea.id} className="border-t border-rule2 py-2.5 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="min-w-0 flex-1 text-[13px] leading-snug">{idea.title}</span>
                  <span className="shrink-0 font-data text-[10px] uppercase tracking-[0.06em] text-quiet">
                    {idea.category} · {idea.status}
                  </span>
                </div>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-quiet">{idea.angle}</p>
                {idea.rationale ? (
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-quiet">{idea.rationale}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Sheet>
        <Label>
          Hooks · {hooks.length}
          {hooks.length > 0 ? ` · ${measured} measured` : ''}
        </Label>
        {hooks.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-quiet">No hook patterns are active.</p>
        ) : (
          <>
            <ul className="flex flex-col">
              {hooks.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-rule2 py-2 first:border-t-0 first:pt-0"
                >
                  <span className="min-w-0 flex-1 text-[12.5px] leading-snug">{h.pattern}</span>
                  <span className="shrink-0 font-data text-[10px] text-quiet">
                    {[h.hook_type, h.category].filter(Boolean).join(' · ')}
                  </span>
                  <span
                    className={cx(
                      'w-[92px] shrink-0 text-right font-data text-[10px]',
                      h.avg_stop_rate === null ? 'text-quiet' : 'text-sink',
                    )}
                    title={
                      h.avg_stop_rate === null
                        ? 'Unmeasured — nothing using this has published and been measured'
                        : undefined
                    }
                  >
                    {/* A dash, never a zero. */}
                    {h.uses} used ·{' '}
                    {h.avg_stop_rate === null ? '—' : `${Math.round(Number(h.avg_stop_rate) * 100)}%`}
                  </span>
                </li>
              ))}
            </ul>
            {measured === 0 ? (
              <p className="mt-2.5 max-w-[74ch] text-xs leading-relaxed text-quiet">
                None of these has a measured stop rate, so the order is by use rather than by
                performance. A library sorted by a score nobody measured would shape every opening
                line this system writes, which is the worst place to guess.
              </p>
            ) : null}
          </>
        )}
      </Sheet>

      <Sheet>
        <Label>Swipe file · {swipe.length}</Label>
        {swipe.length === 0 ? (
          <p className="max-w-[74ch] text-[12.5px] leading-relaxed text-quiet">
            Nothing saved. The swipe file is what somebody else did that worked, kept with a
            sentence about <em>why</em> — the sentence is the useful half, and it is why this
            cannot be filled automatically.
          </p>
        ) : (
          <ul className="flex flex-col">
            {swipe.map((s) => (
              <li key={s.id} className="border-t border-rule2 py-2.5 first:border-t-0 first:pt-0">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block text-[12.5px] leading-snug hover:text-lit"
                >
                  {s.hook_text ?? s.url}
                </a>
                {s.why_it_works ? (
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-quiet">{s.why_it_works}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <p className="text-xs leading-relaxed text-quiet">
        <Link href="/floor" className="text-lit underline">Brief the floor</Link> draws on all
        three without being told to.
      </p>
    </div>
  );
}
