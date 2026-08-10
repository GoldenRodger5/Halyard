import Link from 'next/link';
import {
  Badge,
  Card,
  EmptyState,
  PLATFORM_LABELS,
  PageHeader,
  PlatformDot,
  SectionTitle,
} from '@halyard/ui';
import type { PlatformId } from '@halyard/core';
import { getCurrentProduct } from '@/lib/queries';
import { query } from '@/lib/db';
import { formatInOperatorTz } from '@/lib/format';
import { buildLaunchPlan, discardLaunchBatch, generateLaunchBatch } from './actions';

export const dynamic = 'force-dynamic';

/**
 * The launch batch. Milestone 51.
 *
 * One button produces a reviewable fortnight. The preview above it is computed
 * from exactly the inputs the commit uses, so what is shown is what will be
 * staged — including the parts that could not be placed, which are named rather
 * than quietly dropped.
 */
export default async function LaunchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; days?: string }>;
}) {
  const sp = await searchParams;
  const product = await getCurrentProduct();
  const days = Math.min(28, Math.max(1, Number(sp.days ?? 14)));

  if (!product) {
    return (
      <>
        <PageHeader title="First two weeks" subtitle="A launch's worth of content, in one sitting." />
        <EmptyState
          title="No product yet"
          body="The batch is planned from the product's accounts, slots and mix targets."
        />
      </>
    );
  }

  const timeZone = product.operator_timezone ?? 'UTC';
  const [{ plan }, staged] = await Promise.all([
    buildLaunchPlan(product.id, days),
    query<{ id: string; status: string; n: string }>(
      `select status, count(*) as n, min(id::text) as id from content_items
        where product_id = $1 and generation_meta->>'source' = 'launch_batch'
        group by status`,
      [product.id],
    ),
  ]);

  const stagedTotal = staged.reduce((acc, row) => acc + Number(row.n), 0);
  const written = staged
    .filter((row) => row.status !== 'draft')
    .reduce((acc, row) => acc + Number(row.n), 0);

  const placed = plan.slots.filter((slot) => !slot.deferred && slot.scheduledAt);
  const byDay = new Map<string, typeof placed>();
  for (const slot of placed) {
    const day = formatInOperatorTz(slot.scheduledAt!.toISOString(), timeZone, 'EEEE d MMMM');
    byDay.set(day, [...(byDay.get(day) ?? []), slot]);
  }

  return (
    <>
      <PageHeader
        title="First two weeks"
        subtitle="A launch's worth of content planned in one pass, so it gets reviewed in one sitting rather than six posts a day for a fortnight."
      />

      {sp.error ? (
        <Card className="mb-6 border-danger/40 bg-danger/5 p-4">
          <p className="text-sm text-danger">{sp.error}</p>
        </Card>
      ) : null}

      {stagedTotal > 0 ? (
        <Card className="mb-6 border-good/40 bg-good/5 p-4">
          <p className="text-sm text-ink">
            {stagedTotal} posts staged, {written} written so far. The rest are being generated one
            job at a time.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/queue"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
            >
              Review them
            </Link>
            <Link
              href="/calendar"
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink"
            >
              See the calendar
            </Link>
            <form action={discardLaunchBatch}>
              <input type="hidden" name="product" value={product.id} />
              <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                Discard the batch
              </button>
            </form>
          </div>
        </Card>
      ) : null}

      {/* ── what would happen ─────────────────────────────────────────────── */}
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-serif text-lg text-ink">
              {placed.length} posts over {days} days
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(plan.perPlatform).map(([platform, count]) => (
                <span
                  key={platform}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs text-muted"
                >
                  <PlatformDot platform={platform} />
                  {PLATFORM_LABELS[platform as PlatformId] ?? platform} {count}
                </span>
              ))}
            </div>
          </div>

          <form action={generateLaunchBatch} className="flex items-end gap-2">
            <input type="hidden" name="product" value={product.id} />
            <label className="flex flex-col gap-1 text-xs text-muted">
              days
              <input
                name="days"
                type="number"
                min={1}
                max={28}
                defaultValue={days}
                className="w-20 rounded-lg border border-line bg-paper px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <button
              disabled={placed.length === 0}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              Generate my first two weeks
            </button>
          </form>
        </div>

        <ul className="mt-4 space-y-1.5">
          {plan.rationale.map((line) => (
            <li key={line} className="text-sm leading-relaxed text-muted">
              {line}
            </li>
          ))}
        </ul>

        {plan.warnings.length > 0 ? (
          <ul className="mt-4 space-y-1.5 rounded-lg bg-warn/10 p-3">
            {plan.warnings.map((line) => (
              <li key={line} className="text-sm leading-relaxed text-ink">
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {/* ── the fortnight ─────────────────────────────────────────────────── */}
      <SectionTitle hint="times are jittered inside each slot window, and nothing lands on the hour">
        The plan
      </SectionTitle>

      {placed.length === 0 ? (
        <EmptyState
          title="Nothing can be scheduled yet"
          body={
            plan.warnings[0] ??
            'Connect an account and give its platform at least one slot window, then this fills with a reviewable fortnight.'
          }
          action={
            <Link
              href="/accounts"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
            >
              Connect an account
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {[...byDay.entries()].map(([day, slots]) => (
            <Card key={day} className="p-4">
              <h3 className="text-sm font-medium text-ink">{day}</h3>
              <ul className="mt-2 divide-y divide-line">
                {slots
                  .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())
                  .map((slot) => (
                    <li key={slot.key} className="flex flex-wrap items-center gap-3 py-2">
                      <span className="w-16 shrink-0 tabular-nums text-sm text-muted">
                        {formatInOperatorTz(slot.scheduledAt!.toISOString(), timeZone, 'HH:mm')}
                      </span>
                      <PlatformDot platform={slot.platform} />
                      <span className="text-sm text-ink">
                        {PLATFORM_LABELS[slot.platform as PlatformId] ?? slot.platform}
                      </span>
                      <span className="text-sm text-muted">{slot.persona}</span>
                      {slot.purpose === 'introduction' ? (
                        <Badge tone="info">introduces the account</Badge>
                      ) : (
                        <Badge tone="neutral">{slot.category.replace(/_/g, ' ')}</Badge>
                      )}
                      <span className="text-xs text-muted">{slot.format}</span>
                      <span className="ml-auto text-xs text-muted">{slot.slotName}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {plan.slots.some((slot) => slot.deferred) ? (
        <>
          <SectionTitle hint="dropped rather than squeezed in, because a spacing rule that bends is not a rule">
            Could not be placed
          </SectionTitle>
          <Card className="p-4">
            <ul className="space-y-2">
              {plan.slots
                .filter((slot) => slot.deferred)
                .map((slot) => (
                  <li key={slot.key} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <PlatformDot platform={slot.platform} />
                    <span className="text-ink">
                      {PLATFORM_LABELS[slot.platform as PlatformId] ?? slot.platform}
                    </span>
                    <span className="text-muted">{slot.reason}</span>
                  </li>
                ))}
            </ul>
          </Card>
        </>
      ) : null}
    </>
  );
}
