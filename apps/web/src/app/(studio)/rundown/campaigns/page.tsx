/**
 * §388. Rundown ▸ Campaigns — a window where the mix is allowed to change.
 *
 * The whole point of a campaign in this system is `product_mix_ceiling`: for a
 * bounded window, the share of posts that may talk about the product is lifted.
 * Outside a campaign that ceiling is deliberately low, because an account that
 * only sells is an account nobody follows.
 *
 * So the ceiling is the headline of every campaign row here. It is the thing
 * the campaign actually *does*; the name and the dates are how you find it.
 */
import Link from 'next/link';
import { Label, Sheet, Tally } from '@halyard/ui/studio';
import { getCurrentProduct } from '@/lib/queries';
import { query } from '@/lib/db';
import { formatInOperatorTz } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface CampaignRow {
  id: string;
  name: string;
  kind: string;
  goal: string | null;
  starts_at: string;
  ends_at: string;
  product_mix_ceiling: number | null;
  status: string;
  slots: number;
  tz: string | null;
}

export default async function Campaigns() {
  const product = await getCurrentProduct();

  const rows = await query<CampaignRow>(
    `select c.id, c.name, c.kind, c.goal, c.starts_at, c.ends_at,
            c.product_mix_ceiling, c.status,
            (select count(*)::int from content_items ci where ci.campaign_id = c.id) as slots,
            (select operator_timezone from products order by (kind = 'product') desc limit 1) as tz
       from campaigns c
      where ($1::text is null or c.product_id = $1)
      order by c.starts_at desc`,
    [product?.id ?? null],
  );

  if (rows.length === 0) {
    return (
      <Sheet tone="cool">
        <Label>No campaigns</Label>
        <p className="max-w-prose text-sm leading-relaxed text-quiet">
          A campaign is a bounded window where the product mix ceiling is lifted — the share of
          posts allowed to talk about the product. Outside one that ceiling stays low on purpose,
          because an account that only sells is an account nobody follows. There is no campaign
          running, so the normal ceiling applies.
        </p>
      </Sheet>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {rows.map((c) => {
        const tz = c.tz ?? 'UTC';
        return (
          <Sheet key={c.id} tone={c.status === 'running' ? 'lit' : 'plain'}>
            <div className="flex flex-wrap items-start gap-2.5">
              <Tally
                state={c.status === 'running' ? 'working' : c.status === 'done' ? 'ready' : 'holding'}
                on="light"
                size={8}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{c.name}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-quiet">
                  {formatInOperatorTz(c.starts_at, tz, 'd MMM')} →{' '}
                  {formatInOperatorTz(c.ends_at, tz, 'd MMM')}
                  {c.product_mix_ceiling !== null
                    ? ` · product ceiling lifted to ${Math.round(c.product_mix_ceiling * 100)}%`
                    : ' · ceiling unchanged'}
                </span>
                {c.goal ? (
                  <span className="mt-1 block text-[12px] leading-relaxed text-quiet">{c.goal}</span>
                ) : null}
              </span>
              <span className="shrink-0 font-data text-[9px] uppercase tracking-[0.07em] text-quiet">
                {c.status} · {c.slots} {c.slots === 1 ? 'piece' : 'pieces'}
              </span>
            </div>
          </Sheet>
        );
      })}
      <p className="text-xs leading-relaxed text-quiet">
        A campaign lifts the ceiling; it does not fill the slots.{' '}
        <Link href="/floor" className="text-lit underline">The floor</Link> still briefs each one.
      </p>
    </div>
  );
}
