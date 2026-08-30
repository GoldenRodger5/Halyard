import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Badge,
  Card,
  EmptyState,
  PLATFORM_LABELS,
  PageHeader,
  PlatformDot,
  SectionTitle,
} from '@halyard/ui';
import {
  PRODUCT_CONTENT_CEILING,
  SLOT_INTENT,
  effectiveProductCeiling,
  type SlotPurpose,
} from '@halyard/core';
import { getCurrentProduct } from '@/lib/queries';
import { one, query } from '@/lib/db';
import { formatInOperatorTz, formatNumber, toDatetimeLocalValue } from '@/lib/format';
import {
  completeCampaign,
  generateCampaign,
  moveSlot,
  pauseCampaign,
  planCampaignSlots,
  removeSlot,
} from '../actions';

export const dynamic = 'force-dynamic';

interface Campaign {
  id: string;
  product_id: string;
  name: string;
  kind: string;
  brief: string | null;
  goal: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  product_mix_ceiling: string;
}

interface Slot {
  id: string;
  platform: string;
  persona: string;
  format: string;
  category: string;
  body: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  generation_meta: { purpose?: SlotPurpose; intent?: string };
  impressions: number | null;
  link_clicks: number | null;
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const campaign = await one<Campaign>('select * from campaigns where id = $1', [id]);
  if (!campaign) notFound();

  const product = await getCurrentProduct(campaign.product_id);
  const timeZone = product?.operator_timezone ?? 'UTC';

  const [slots, clicks, comments] = await Promise.all([
    query<Slot>(
      `select ci.id, ci.platform, ci.persona, ci.format, ci.category, ci.body, ci.status,
              ci.scheduled_at, ci.published_at, ci.generation_meta,
              m.impressions, m.link_clicks
         from content_items ci
         left join publications p on p.content_item_id = ci.id
         left join lateral (select * from post_metrics pm where pm.publication_id = p.id
                             order by collected_at desc limit 1) m on true
        where ci.campaign_id = $1
        order by ci.scheduled_at nulls last, ci.created_at`,
      [id],
    ),
    query<{ device_class: string; n: string }>(
      `select device_class, count(*) as n from link_clicks
        where campaign_id = $1 group by device_class order by count(*) desc`,
      [id],
    ),
    query<{ id: string; body: string; author_handle: string | null; posted_at: string }>(
      `select c.id, c.body, c.author_handle, c.posted_at
         from comments c
         join publications p on p.id = c.publication_id
         join content_items ci on ci.id = p.content_item_id
        where ci.campaign_id = $1 and c.reply_status = 'pending'
        order by c.posted_at desc limit 10`,
      [id],
    ),
  ]);

  const now = new Date();
  const startsAt = new Date(campaign.starts_at);
  const endsAt = new Date(campaign.ends_at);
  const live = now >= startsAt && now <= endsAt && campaign.status === 'running';

  const override = effectiveProductCeiling({
    baseCeiling: PRODUCT_CONTENT_CEILING,
    campaign: {
      productMixCeiling: Number(campaign.product_mix_ceiling),
      startsAt,
      endsAt,
      status: campaign.status,
    },
    now,
  });

  const staged = slots.filter((s) => s.body === '');
  const published = slots.filter((s) => s.status === 'published');
  const next = slots.find(
    (s) => s.status !== 'published' && s.scheduled_at && new Date(s.scheduled_at) > now,
  );
  const totalImpressions = slots.reduce((sum, s) => sum + Number(s.impressions ?? 0), 0);
  const totalClicks = slots.reduce((sum, s) => sum + Number(s.link_clicks ?? 0), 0);

  return (
    <>
      <PageHeader
        title={campaign.name}
        subtitle={
          <span>
            {campaign.kind} · {formatInOperatorTz(campaign.starts_at, timeZone, 'd MMM')} to{' '}
            {formatInOperatorTz(campaign.ends_at, timeZone, 'd MMM')} ·{' '}
            <Badge tone={live ? 'good' : 'neutral'}>{campaign.status}</Badge>
          </span>
        }
        actions={
          <Link href="/rundown/campaigns" className="text-sm text-primary underline">
            All campaigns
          </Link>
        }
      />

      {/* ── Launch day ───────────────────────────────────────────────────── */}
      {live ? (
        <Card className="mb-6 border-good/40 bg-good/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="font-medium text-ink">Launch day</h2>
              <p className="mt-1 text-sm text-muted">
                {published.length} of {slots.length} out ·{' '}
                {formatNumber(totalImpressions)} impressions · {formatNumber(totalClicks)} clicks ·{' '}
                {comments.length} comment{comments.length === 1 ? '' : 's'} waiting
              </p>
              <p className="mt-1 text-sm text-ink">
                {next
                  ? `Next: ${PLATFORM_LABELS[next.platform] ?? next.platform} at ${formatInOperatorTz(next.scheduled_at!, timeZone, 'HH:mm')}.`
                  : 'Nothing further is scheduled.'}
              </p>
            </div>
            <form action={pauseCampaign} className="shrink-0">
              <input type="hidden" name="id" value={campaign.id} />
              <button className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                Pause this campaign
              </button>
              <p className="mt-1 max-w-[14rem] text-xs text-muted">
                Holds back everything unpublished. The global kill switch on Settings is a
                bigger, different action.
              </p>
            </form>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {/* ── Timeline ─────────────────────────────────────────────────── */}
          <section>
            <SectionTitle
              hint={
                staged.length > 0
                  ? `${staged.length} empty slot${staged.length === 1 ? '' : 's'} — rearrange before generating`
                  : `${slots.length} posts`
              }
            >
              Timeline
            </SectionTitle>

            {slots.length === 0 ? (
              <EmptyState
                title="Nothing planned yet"
                body="Planning builds the shape of the sequence — teasers, a staggered launch-morning burst, follow-ups, a thank-you and a results post — as empty slots. Nothing is written until you have looked at the timeline."
                action={
                  <form action={planCampaignSlots}>
                    <input type="hidden" name="id" value={campaign.id} />
                    <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
                      Plan the sequence
                    </button>
                  </form>
                }
              />
            ) : (
              <div className="space-y-2">
                {slots.map((slot) => {
                  const purpose = slot.generation_meta?.purpose;
                  const empty = slot.body === '';
                  return (
                    <Card key={slot.id} className="p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <PlatformDot platform={slot.platform} />
                            <span className="text-sm font-medium text-ink">
                              {PLATFORM_LABELS[slot.platform] ?? slot.platform}
                            </span>
                            <Badge tone="neutral">{slot.persona}</Badge>
                            {purpose ? (
                              <Badge tone="info">{purpose.replace(/_/g, ' ')}</Badge>
                            ) : null}
                            <Badge tone={slot.status === 'published' ? 'good' : 'neutral'}>
                              {slot.status.replace(/_/g, ' ')}
                            </Badge>
                          </div>

                          <p className="mt-1.5 text-sm leading-relaxed text-muted">
                            {empty
                              ? (slot.generation_meta?.intent ??
                                (purpose ? SLOT_INTENT[purpose] : 'Not written yet.'))
                              : slot.body.slice(0, 180)}
                          </p>

                          <p className="mt-1.5 text-xs text-muted">
                            {slot.scheduled_at
                              ? formatInOperatorTz(slot.scheduled_at, timeZone, 'EEE d MMM HH:mm')
                              : 'unscheduled'}
                            {slot.impressions !== null
                              ? ` · ${formatNumber(Number(slot.impressions))} impressions`
                              : ''}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {empty ? (
                            <>
                              <form action={moveSlot} className="flex items-center gap-1">
                                <input type="hidden" name="itemId" value={slot.id} />
                                <input type="hidden" name="campaignId" value={campaign.id} />
                                <input type="hidden" name="timeZone" value={timeZone} />
                                <input
                                  type="datetime-local"
                                  name="scheduledAt"
                                  defaultValue={toDatetimeLocalValue(slot.scheduled_at, timeZone)}
                                  className="rounded-lg border border-line bg-paper px-2 py-1 text-xs text-ink"
                                />
                                <button className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:bg-sunk hover:text-ink">
                                  Move
                                </button>
                              </form>
                              <form action={removeSlot}>
                                <input type="hidden" name="itemId" value={slot.id} />
                                <input type="hidden" name="campaignId" value={campaign.id} />
                                <button className="rounded-lg border border-line px-2 py-1 text-xs text-muted hover:bg-sunk hover:text-ink">
                                  Remove
                                </button>
                              </form>
                            </>
                          ) : (
                            <Link
                              href={`/queue/${slot.id}`}
                              className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink"
                            >
                              Open
                            </Link>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {slots.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <form action={planCampaignSlots}>
                  <input type="hidden" name="id" value={campaign.id} />
                  <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                    Re-plan empty slots
                  </button>
                </form>
                {staged.length > 0 ? (
                  <form action={generateCampaign}>
                    <input type="hidden" name="id" value={campaign.id} />
                    <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
                      Generate {staged.length} post{staged.length === 1 ? '' : 's'}
                    </button>
                  </form>
                ) : null}
                {campaign.status !== 'complete' ? (
                  <form action={completeCampaign}>
                    <input type="hidden" name="id" value={campaign.id} />
                    <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                      Mark complete
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* ── Incoming ─────────────────────────────────────────────────── */}
          {comments.length > 0 ? (
            <section>
              <SectionTitle hint="Halyard drafts replies; you send them">
                Comments waiting
              </SectionTitle>
              <Card className="divide-y divide-line">
                {comments.map((comment) => (
                  <div key={comment.id} className="p-3">
                    <p className="text-sm text-ink">{comment.body}</p>
                    <p className="mt-1 text-xs text-muted">
                      {comment.author_handle ?? 'someone'} ·{' '}
                      {formatInOperatorTz(comment.posted_at, timeZone, 'HH:mm')} ·{' '}
                      <Link href="/wires" className="text-primary hover:underline">
                        reply in the inbox
                      </Link>
                    </p>
                  </div>
                ))}
              </Card>
            </section>
          ) : null}
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="space-y-6">
          <Card className="p-4">
            <SectionTitle>The brief</SectionTitle>
            <p className="text-sm leading-relaxed text-ink">
              {campaign.brief ?? campaign.goal ?? 'No brief was written.'}
            </p>
          </Card>

          <Card className="p-4">
            <SectionTitle>Mix override</SectionTitle>
            <p className="text-2xl tabular-nums text-ink">
              {Math.round(Number(campaign.product_mix_ceiling) * 100)}%
            </p>
            <p className="mt-1 text-sm text-muted">{override.reason}</p>
            <p className="mt-2 text-xs text-muted">
              Campaign days are excluded from the trailing 21-day mix, so this window does not
              distort normal cadence for three weeks afterwards.
            </p>
          </Card>

          <Card className="p-4">
            <SectionTitle hint="attributed to this campaign">Clicks</SectionTitle>
            {clicks.length === 0 ? (
              <p className="text-sm text-muted">No routed clicks yet.</p>
            ) : (
              <dl className="space-y-1.5">
                {clicks.map((row) => (
                  <div key={row.device_class} className="flex justify-between text-sm">
                    <dt className="text-muted">{row.device_class}</dt>
                    <dd className="tabular-nums text-ink">{formatNumber(Number(row.n))}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
