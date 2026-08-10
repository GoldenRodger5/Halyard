import Link from 'next/link';
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from '@halyard/ui';
import { PRODUCT_CONTENT_CEILING } from '@halyard/core';
import { getCurrentProduct } from '@/lib/queries';
import { query } from '@/lib/db';
import { formatInOperatorTz } from '@/lib/format';
import { createCampaign } from './actions';

export const dynamic = 'force-dynamic';

interface CampaignRow {
  id: string;
  name: string;
  kind: string;
  status: string;
  goal: string | null;
  starts_at: string;
  ends_at: string;
  product_mix_ceiling: string;
  slots: number;
  written: number;
  published: number;
}

const STATUS_TONE: Record<string, 'neutral' | 'good' | 'warn' | 'bad' | 'info'> = {
  planning: 'neutral',
  staged: 'info',
  running: 'good',
  complete: 'neutral',
  abandoned: 'bad',
};

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const product = await getCurrentProduct();

  const campaigns = await query<CampaignRow>(
    `select c.*,
            (select count(*) from content_items ci where ci.campaign_id = c.id) as slots,
            (select count(*) from content_items ci
              where ci.campaign_id = c.id and ci.body <> '') as written,
            (select count(*) from content_items ci
              where ci.campaign_id = c.id and ci.status = 'published') as published
       from campaigns c
      where c.product_id = $1
      order by c.starts_at desc`,
    [product?.id ?? 'recipefix'],
  );

  const timeZone = product?.operator_timezone ?? 'UTC';
  const defaultStart = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle={`A launch is the one time the normal mix is wrong. During a campaign window the ${Math.round(PRODUCT_CONTENT_CEILING * 100)}% product ceiling lifts, and campaign days are excluded from the trailing mix afterwards so three days of launch do not distort three weeks of normal posting.`}
      />

      {sp.error ? (
        <Card className="mb-6 border-danger/40 bg-danger/5 p-4">
          <p className="text-sm text-danger">{sp.error}</p>
        </Card>
      ) : null}

      <SectionTitle hint="describe it in a sentence; the timeline comes back for you to rearrange">
        Plan a campaign
      </SectionTitle>
      <Card className="mb-8 p-4">
        <form action={createCampaign} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="product" value={product?.id ?? 'recipefix'} />

          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">
              What is this campaign
            </span>
            <input
              name="brief"
              required
              placeholder="Launching RecipeFix on Product Hunt on the 18th, aiming for top 5 and a thousand adaptations that week."
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">Name</span>
            <input
              name="name"
              required
              placeholder="Product Hunt launch"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">Kind</span>
            <select
              name="kind"
              defaultValue="launch"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
            >
              {['launch', 'feature', 'seasonal', 'experiment', 'other'].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">
              Starts
            </span>
            <input
              type="date"
              name="startsAt"
              required
              defaultValue={defaultStart}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">
              Days
            </span>
            <input
              type="number"
              name="days"
              min={1}
              max={30}
              defaultValue={5}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
            />
          </label>

          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">
              Product-content ceiling during the window
            </span>
            <select
              name="ceiling"
              defaultValue="0.6"
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
            >
              <option value="0.3">30% — a feature, not a launch</option>
              <option value="0.6">60% — a launch</option>
              <option value="0.85">85% — launch day itself</option>
            </select>
            <span className="mt-1 block text-xs text-muted">
              Reverts to {Math.round(PRODUCT_CONTENT_CEILING * 100)}% on its own when the window
              closes. There is nothing to remember to turn off.
            </span>
          </label>

          <div className="sm:col-span-2">
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
              Create and plan
            </button>
          </div>
        </form>
      </Card>

      <SectionTitle hint={`${campaigns.length} for ${product?.name ?? 'this product'}`}>
        All campaigns
      </SectionTitle>
      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          body="A campaign is for a launch, a feature, or a seasonal moment — anything where the normal fifteen percent product ceiling is the wrong number for a few days. Describe one above and a timeline comes back before anything generates."
        />
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {campaign.name}
                    </Link>
                    <Badge tone={STATUS_TONE[campaign.status] ?? 'neutral'}>
                      {campaign.status}
                    </Badge>
                    <Badge tone="neutral">{campaign.kind}</Badge>
                  </div>
                  {campaign.goal ? (
                    <p className="mt-1 text-sm text-muted">{campaign.goal}</p>
                  ) : null}
                  <p className="mt-1.5 text-xs text-muted">
                    {formatInOperatorTz(campaign.starts_at, timeZone, 'd MMM')} to{' '}
                    {formatInOperatorTz(campaign.ends_at, timeZone, 'd MMM')} ·{' '}
                    {Math.round(Number(campaign.product_mix_ceiling) * 100)}% product ceiling ·{' '}
                    {campaign.slots} slot{Number(campaign.slots) === 1 ? '' : 's'},{' '}
                    {campaign.written} written, {campaign.published} published
                  </p>
                </div>
                <Link
                  href={`/campaigns/${campaign.id}`}
                  className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink"
                >
                  Open
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
