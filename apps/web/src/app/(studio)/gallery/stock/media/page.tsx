import { Badge, Card, EmptyState, PageHeader, SectionTitle } from '@halyard/ui';
import { ASSET_STALE_DAYS, allFlows, assetStaleness } from '@halyard/core';
import { getCurrentProduct } from '@/lib/queries';
import { query } from '@/lib/db';
import { formatInOperatorTz } from '@/lib/format';
import {
  archiveAssets,
  recaptureFlow,
  restoreAssets,
  retagAssets,
  uploadAssets,
} from './actions';

export const dynamic = 'force-dynamic';

interface AssetRow {
  id: string;
  kind: string;
  mime_type: string;
  public_url: string | null;
  caption: string | null;
  alt_text: string | null;
  tags: string[];
  width: number | null;
  height: number | null;
  bytes: string | null;
  flow_id: string | null;
  app_version: string | null;
  captured_at: string | null;
  created_at: string;
  archived_at: string | null;
  archived_reason: string | null;
  used_in: number;
}

interface RunRow {
  flow_id: string;
  mode: string;
  ok: boolean;
  started_at: string;
  summary: string;
}

/**
 * The asset library. Milestone 41 Part D.
 *
 * Everything the system can put in a post: captures of the live product,
 * uploaded photographs, rendered output. Searchable by tag, because a library
 * you cannot search is a folder.
 */
export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; tag?: string; archived?: string }>;
}) {
  const sp = await searchParams;
  const product = await getCurrentProduct();
  const showArchived = sp.archived === '1';

  const [assets, runs, tagRows] = await Promise.all([
    query<AssetRow>(
      `select a.id, a.kind, a.mime_type, a.public_url, a.caption, a.alt_text, a.tags,
              a.width, a.height, a.bytes, a.flow_id, a.app_version, a.captured_at,
              a.created_at, a.archived_at, a.archived_reason,
              (select count(*) from content_items ci where a.id = any(ci.render_ids)) as used_in
         from assets a
        where ($1::text is null or a.product_id = $1)
          and (case when $5::boolean then a.archived_at is not null else a.archived_at is null end)
          and ($2::text is null or a.kind = $2)
          and ($3::text is null or $3 = any(a.tags))
          and ($4::text is null
               or a.caption ilike '%' || $4 || '%'
               or a.original_filename ilike '%' || $4 || '%'
               or exists (select 1 from unnest(a.tags) t where t ilike '%' || $4 || '%'))
        order by coalesce(a.captured_at, a.created_at) desc
        limit 200`,
      [product?.id ?? null, sp.kind ?? null, sp.tag ?? null, sp.q ?? null, showArchived],
    ),
    query<RunRow>(
      `select distinct on (flow_id) flow_id, mode, ok, started_at, summary
         from capture_runs
        where product_id = $1
        order by flow_id, started_at desc`,
      [product?.id ?? 'recipefix'],
    ),
    query<{ tag: string; n: string }>(
      `select t as tag, count(*) as n
         from assets a, unnest(a.tags) t
        where a.archived_at is null and ($1::text is null or a.product_id = $1)
        group by t order by count(*) desc limit 24`,
      [product?.id ?? null],
    ),
  ]);

  const timeZone = product?.operator_timezone ?? 'UTC';
  const currentVersion = (product as { observed_app_version?: string | null } | null)
    ?.observed_app_version ?? null;

  return (
    <>
      <PageHeader
        title="Assets"
        subtitle={`Captures of the live product, photographs, and rendered output. Anything captured more than ${ASSET_STALE_DAYS} days ago, or before the app last shipped, is marked stale — a screenshot of a screen that no longer exists is worse than no screenshot.`}
      />

      {/* ── Flows and their last verification ─────────────────────────────── */}
      <SectionTitle hint="verified against the live site before anything is recorded">
        Capture flows
      </SectionTitle>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {allFlows().map((flow) => {
          const run = runs.find((r) => r.flow_id === flow.id);
          const captured = assets.filter((a) => a.flow_id === flow.id).length;
          return (
            <Card key={flow.id} className="flex flex-col p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{flow.title}</span>
                {run ? (
                  <Badge tone={run.ok ? 'good' : 'bad'}>
                    {run.ok ? 'verified' : 'broken'}
                  </Badge>
                ) : (
                  <Badge tone="neutral">never run</Badge>
                )}
                {flow.consumesCredit ? <Badge tone="warn">spends a credit</Badge> : null}
              </div>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{flow.why}</p>
              <p className="mt-2 text-xs text-muted">
                {run
                  ? `${run.summary} · ${formatInOperatorTz(run.started_at, timeZone, 'd MMM HH:mm')}`
                  : `${flow.steps.length} steps, expected ${flow.expectedSeconds[0]}–${flow.expectedSeconds[1]}s.`}
              </p>
              <p className="mt-1 text-xs text-muted">
                {captured} asset{captured === 1 ? '' : 's'} from this flow
              </p>
              <form action={recaptureFlow} className="mt-3">
                <input type="hidden" name="flowId" value={flow.id} />
                <input type="hidden" name="product" value={product?.id ?? 'recipefix'} />
                <button className="w-full rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
                  {flow.dependsOn ? `Re-capture with ${flow.dependsOn}` : 'Re-capture'}
                </button>
              </form>
            </Card>
          );
        })}
      </div>

      {/* ── Upload ────────────────────────────────────────────────────────── */}
      <SectionTitle hint="photographs and anything else the system cannot capture itself">
        Upload
      </SectionTitle>
      <Card className="mb-8 p-4">
        <form action={uploadAssets} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="product" value={product?.id ?? 'recipefix'} />
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">
              Files
            </span>
            <input
              type="file"
              name="files"
              multiple
              accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,audio/mpeg,audio/wav"
              required
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-sunk file:px-3 file:py-1.5 file:text-sm file:text-ink"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">
              Tags, comma separated
            </span>
            <input
              name="tags"
              placeholder="kitchen, hands, overhead"
              className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted"
            />
          </label>
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            Upload
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          PNG, JPEG, WebP, MP4, MOV, MP3 and WAV, up to 64 MB each. Anything else is ignored
          rather than half-stored.
        </p>
      </Card>

      {/* ── Search and filters ────────────────────────────────────────────── */}
      <SectionTitle
        hint={`${assets.length} shown${showArchived ? ', archived' : ''}`}
      >
        Library
      </SectionTitle>

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">
              Search
            </span>
            <input
              name="q"
              defaultValue={sp.q ?? ''}
              placeholder="caption, filename or tag"
              className="w-64 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">Kind</span>
            <select
              name="kind"
              defaultValue={sp.kind ?? ''}
              className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink"
            >
              <option value="">any</option>
              {['screenshot', 'capture', 'photo', 'video', 'generated', 'audio', 'logo'].map(
                (k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} />
            Archived only
          </label>
          <button className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink">
            Apply
          </button>
        </form>

        {tagRows.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tagRows.map((t) => (
              <a
                key={t.tag}
                href={`/assets?tag=${encodeURIComponent(t.tag)}`}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  sp.tag === t.tag
                    ? 'border-primary bg-primary/10 text-ink'
                    : 'border-line text-muted hover:bg-sunk hover:text-ink'
                }`}
              >
                {t.tag} <span className="text-muted">{t.n}</span>
              </a>
            ))}
          </div>
        ) : null}
      </Card>

      {assets.length === 0 ? (
        <EmptyState
          title={showArchived ? 'Nothing archived' : 'No assets yet'}
          body={
            showArchived
              ? 'Archived assets are kept rather than deleted, because one may already be inside a published post.'
              : 'Capture a flow above to fill this with real screenshots of the product, or upload photographs. Templates and compositions pick from here by tag.'
          }
        />
      ) : (
        <form className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {assets.map((asset) => {
              const staleness = asset.captured_at
                ? assetStaleness(
                    new Date(asset.captured_at),
                    asset.app_version,
                    currentVersion,
                  )
                : null;

              return (
                <Card key={asset.id} className="overflow-hidden p-0">
                  <label className="block cursor-pointer">
                    <div className="relative flex h-40 items-center justify-center overflow-hidden bg-sunk">
                      {asset.public_url && asset.mime_type.startsWith('image/') ? (
                        // Asset URLs point at Supabase Storage or the local
                        // uploads directory, neither of which is worth
                        // allow-listing in next/image config.
                        <img
                          src={asset.public_url}
                          alt={asset.alt_text ?? ''}
                          className="h-full w-full object-cover"
                        />
                      ) : asset.public_url && asset.mime_type.startsWith('video/') ? (
                        <video src={asset.public_url} className="h-full w-full object-cover" muted />
                      ) : (
                        <span className="text-xs text-muted">{asset.mime_type}</span>
                      )}
                      <input
                        type="checkbox"
                        name="selected"
                        value={asset.id}
                        className="absolute left-2 top-2 h-4 w-4"
                      />
                    </div>

                    <div className="p-3">
                      <p className="truncate text-sm text-ink">
                        {asset.caption ?? asset.tags[0] ?? asset.kind}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <Badge tone="neutral">{asset.kind}</Badge>
                        {staleness?.stale ? <Badge tone="warn">stale</Badge> : null}
                        {asset.used_in > 0 ? (
                          <Badge tone="good">used in {asset.used_in}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-xs text-muted">
                        {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ''}
                        {asset.bytes ? `${Math.round(Number(asset.bytes) / 1024)} KB · ` : ''}
                        {formatInOperatorTz(
                          asset.captured_at ?? asset.created_at,
                          timeZone,
                          'd MMM',
                        )}
                      </p>
                      {staleness?.reason ? (
                        <p className="mt-1.5 rounded bg-warn/10 px-2 py-1 text-xs text-ink">
                          {staleness.reason}
                        </p>
                      ) : null}
                      {asset.archived_reason ? (
                        <p className="mt-1.5 text-xs text-muted">{asset.archived_reason}</p>
                      ) : null}
                      {asset.tags.length > 0 ? (
                        <p className="mt-1.5 truncate font-mono text-[11px] text-muted">
                          {asset.tags.join(' ')}
                        </p>
                      ) : null}
                    </div>
                  </label>
                </Card>
              );
            })}
          </div>

          {/* ── Bulk actions ────────────────────────────────────────────── */}
          <Card className="flex flex-wrap items-end gap-3 p-4">
            <p className="w-full text-sm text-muted">
              Tick assets above, then act on all of them at once.
            </p>
            <label className="text-sm">
              <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">
                Add tags
              </span>
              <input
                name="addTags"
                placeholder="hero, before-after"
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs uppercase tracking-[0.08em] text-muted">
                Remove tags
              </span>
              <input
                name="removeTags"
                placeholder="draft"
                className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink placeholder:text-muted"
              />
            </label>
            <button
              formAction={retagAssets}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink"
            >
              Apply tags
            </button>
            {showArchived ? (
              <button
                formAction={restoreAssets}
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink"
              >
                Restore
              </button>
            ) : (
              <button
                formAction={archiveAssets}
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink"
              >
                Archive
              </button>
            )}
          </Card>
        </form>
      )}
    </>
  );
}
