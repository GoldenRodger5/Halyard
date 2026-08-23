import { Badge, Card, EmptyState, MiniBar, PLATFORM_LABELS, PageHeader, SectionTitle } from '@halyard/ui';
import { HOOK_TYPES, HOOK_TYPE_GUIDE, type HookType } from '@halyard/core';
import { getCurrentProduct } from '@/lib/queries';
import { query } from '@/lib/db';
import { formatInOperatorTz } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Patterns used inside this window are on cooldown, per the hook system. */
const COOLDOWN_DAYS = 30;

interface TypeRow {
  hook_type: string;
  uses: string;
  avg_stop_rate: string | null;
  avg_score: string | null;
  recency_weighted: string | null;
  on_cooldown: string;
}

interface HookRow {
  id: string;
  pattern: string;
  hook_type: string;
  layer: string;
  platform: string | null;
  format: string | null;
  category: string | null;
  source: string;
  uses: number;
  avg_stop_rate: string | null;
  avg_score: string | null;
  recency_weighted_score: string | null;
  last_used_at: string | null;
  active: boolean;
}

/**
 * The hook system, made legible. Milestone 43, item 3.
 *
 * Of the four browsing screens this is the one that matters: hooks are where the
 * system is supposed to be learning, and until now that learning happened
 * entirely out of sight. Performance by type, by format and by category, plus
 * which patterns are resting — that is the whole point.
 */
export default async function HooksPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const product = await getCurrentProduct();
  const timeZone = product?.operator_timezone ?? 'UTC';

  const [byType, byFormat, byCategory, hooks] = await Promise.all([
    query<TypeRow>(
      `select hook_type,
              coalesce(sum(uses), 0) as uses,
              avg(avg_stop_rate) as avg_stop_rate,
              avg(avg_score) as avg_score,
              avg(recency_weighted_score) as recency_weighted,
              count(*) filter (
                where last_used_at > now() - make_interval(days => $2)) as on_cooldown
         from hooks
        where product_id = $1 or product_id is null
        group by hook_type`,
      [product?.id ?? 'recipefix', COOLDOWN_DAYS],
    ),
    query<{ format: string; uses: string; avg_stop_rate: string | null }>(
      `select coalesce(format, 'any') as format, coalesce(sum(uses), 0) as uses,
              avg(avg_stop_rate) as avg_stop_rate
         from hooks where (product_id = $1 or product_id is null)
        group by coalesce(format, 'any') order by sum(uses) desc nulls last`,
      [product?.id ?? 'recipefix'],
    ),
    query<{ category: string; uses: string; avg_stop_rate: string | null }>(
      `select coalesce(category, 'any') as category, coalesce(sum(uses), 0) as uses,
              avg(avg_stop_rate) as avg_stop_rate
         from hooks where (product_id = $1 or product_id is null)
        group by coalesce(category, 'any') order by sum(uses) desc nulls last`,
      [product?.id ?? 'recipefix'],
    ),
    query<HookRow>(
      `select * from hooks
        where (product_id = $1 or product_id is null)
          and ($2::text is null or hook_type = $2)
        order by ${sp.sort === 'uses' ? 'uses desc' : 'coalesce(recency_weighted_score, avg_score, 0) desc'},
                 uses desc
        limit 120`,
      [product?.id ?? 'recipefix', sp.type ?? null],
    ),
  ]);

  const totalUses = byType.reduce((sum, row) => sum + Number(row.uses), 0);
  const bestStopRate = Math.max(
    0.0001,
    ...byType.map((row) => Number(row.avg_stop_rate ?? 0)),
  );

  return (
    <>
      <PageHeader
        title="Hooks"
        subtitle="Where the system is supposed to be learning. A hook that keeps earning gets used more; one used recently rests for thirty days, so the feed does not become one sentence with different nouns."
      />

      {totalUses === 0 ? (
        <Card className="mb-8 border-warn/40 bg-warn/5 p-4">
          <p className="text-sm text-ink">
            No hook has been used yet, so every number below is a starting position rather than a
            measurement. Performance only becomes real after posts publish and metrics come back.
          </p>
        </Card>
      ) : null}

      {/* ── By type ───────────────────────────────────────────────────────── */}
      <SectionTitle hint="eight named types, generate eight and surface five">
        Performance by hook type
      </SectionTitle>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {HOOK_TYPES.map((type) => {
          const row = byType.find((r) => r.hook_type === type);
          const guide = HOOK_TYPE_GUIDE[type as HookType];
          const stopRate = Number(row?.avg_stop_rate ?? 0);
          const resting = Number(row?.on_cooldown ?? 0);

          return (
            <Card key={type} className="flex flex-col p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">{type.replace(/_/g, ' ')}</span>
                {resting > 0 ? <Badge tone="neutral">{resting} resting</Badge> : null}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">{guide.shape}</p>

              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-[0.08em] text-muted">stop rate</span>
                  <span className="tabular-nums text-ink">
                    {row?.avg_stop_rate ? `${(stopRate * 100).toFixed(1)}%` : '—'}
                  </span>
                </div>
                <MiniBar value={stopRate} max={bestStopRate} />
              </div>

              <p className="mt-2 text-xs text-muted">
                {Number(row?.uses ?? 0)} use{Number(row?.uses ?? 0) === 1 ? '' : 's'}
                {row?.recency_weighted
                  ? ` · recency-weighted ${Number(row.recency_weighted).toFixed(2)}`
                  : ''}
              </p>
              <p className="mt-2 border-t border-line pt-2 text-xs italic text-muted">
                “{guide.example}”
              </p>
            </Card>
          );
        })}
      </div>

      {/* ── By format and category ────────────────────────────────────────── */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionTitle hint="a hook that works on video may die in a carousel">
            By format
          </SectionTitle>
          <Card className="overflow-x-auto" scrollLabel="Hook performance by format">
            <Breakdown rows={byFormat} labelKey="format" />
          </Card>
        </section>

        <section className="min-w-0">
          <SectionTitle hint="education tolerates a different opening than product">
            By category
          </SectionTitle>
          <Card className="overflow-x-auto" scrollLabel="Hook performance by category">
            <Breakdown rows={byCategory} labelKey="category" />
          </Card>
        </section>
      </div>

      {/* ── The library ───────────────────────────────────────────────────── */}
      <SectionTitle
        hint={`${hooks.length} shown${sp.type ? `, ${sp.type.replace(/_/g, ' ')} only` : ''}`}
      >
        Hook library
      </SectionTitle>

      <Card className="mb-4 p-3">
        <form className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">Type</span>
            <select
              name="type"
              defaultValue={sp.type ?? ''}
              className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink"
            >
              <option value="">every type</option>
              {HOOK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">Sort</span>
            <select
              name="sort"
              defaultValue={sp.sort ?? 'score'}
              className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink"
            >
              <option value="score">by recency-weighted score</option>
              <option value="uses">by uses</option>
            </select>
          </label>
          <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
            Apply
          </button>
        </form>
      </Card>

      {hooks.length === 0 ? (
        <EmptyState
          title="No hooks yet"
          body="Hooks are seeded on install and learned from what you approve. If this is empty, the seed did not run — check that seed.sql was applied."
        />
      ) : (
        <Card className="overflow-x-auto" scrollLabel="Hooks">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-muted">
                <th className="px-4 py-2.5 font-medium">Pattern</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Where</th>
                <th className="px-4 py-2.5 text-right font-medium">Uses</th>
                <th className="px-4 py-2.5 text-right font-medium">Stop rate</th>
                <th className="px-4 py-2.5 font-medium">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {hooks.map((hook) => {
                const restingUntil = hook.last_used_at
                  ? new Date(
                      new Date(hook.last_used_at).getTime() + COOLDOWN_DAYS * 86_400_000,
                    )
                  : null;
                const resting = restingUntil !== null && restingUntil > new Date();

                return (
                  <tr key={hook.id} className="align-top">
                    <td className="max-w-md px-4 py-2.5">
                      <p className="leading-snug text-ink">{hook.pattern}</p>
                      <p className="mt-0.5 text-xs text-muted">{hook.layer} layer · {hook.source}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                      {hook.hook_type.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {[
                        hook.platform ? (PLATFORM_LABELS[hook.platform] ?? hook.platform) : null,
                        hook.format,
                        hook.category,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'anywhere'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">{hook.uses}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                      {hook.avg_stop_rate
                        ? `${(Number(hook.avg_stop_rate) * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {!hook.active ? (
                        <Badge tone="neutral">retired</Badge>
                      ) : resting ? (
                        <span className="text-xs text-muted">
                          resting until{' '}
                          {formatInOperatorTz(restingUntil!.toISOString(), timeZone, 'd MMM')}
                        </span>
                      ) : (
                        <Badge tone="good">available</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function Breakdown({
  rows,
  labelKey,
}: {
  rows: Array<Record<string, string | null>>;
  labelKey: string;
}) {
  const best = Math.max(0.0001, ...rows.map((r) => Number(r.avg_stop_rate ?? 0)));
  if (rows.length === 0) {
    return <p className="p-4 text-sm text-muted">Nothing recorded yet.</p>;
  }
  return (
    <table className="w-full min-w-[20rem] text-sm">
      <tbody className="divide-y divide-line">
        {rows.map((row) => (
          <tr key={String(row[labelKey])}>
            <td className="px-4 py-2.5 text-ink">{row[labelKey]}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-muted">{row.uses} uses</td>
            <td className="w-32 px-4 py-2.5">
              <MiniBar value={Number(row.avg_stop_rate ?? 0)} max={best} />
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-ink">
              {row.avg_stop_rate ? `${(Number(row.avg_stop_rate) * 100).toFixed(1)}%` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
