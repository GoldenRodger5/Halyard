import { Badge } from '@halyard/ui';
import { assetStaleness } from '@halyard/core';
import { query } from '@/lib/db';
import { attachAsset, detachAsset } from '@/app/(dashboard)/queue/assetActions';

interface PickerAsset {
  id: string;
  kind: string;
  mime_type: string;
  public_url: string | null;
  caption: string | null;
  tags: string[];
  captured_at: string | null;
  app_version: string | null;
  archived_reason: string | null;
}

/**
 * Attach a real asset to a draft. Milestone 41 Part D.
 *
 * The generated media a draft arrives with is rendered typography. This is how a
 * screenshot of the actual product, or a photograph, gets into the post instead
 * — from the queue and from the co-pilot, without leaving either.
 *
 * A stale asset is shown, not hidden, with the reason. Hiding it would mean a
 * silent gap where a picture should be; showing it with the warning lets the
 * operator decide.
 */
export async function AssetPicker({
  contentItemId,
  productId,
  attachedIds,
  usableFor,
}: {
  contentItemId: string;
  productId: string;
  attachedIds: string[];
  /** 'carousel', 'image' or 'video' — filters to what this format can take. */
  usableFor?: string;
}) {
  const [assets, product] = await Promise.all([
    query<PickerAsset>(
      `select id, kind, mime_type, public_url, caption, tags, captured_at, app_version,
              archived_reason
         from assets
        where product_id = $1
          and archived_at is null
          and ($2::text is null or $2 = any(usable_for) or usable_for = '{}')
        order by (source = 'capture') desc, coalesce(captured_at, created_at) desc
        limit 40`,
      [productId, usableFor ?? null],
    ),
    query<{ observed_app_version: string | null }>(
      'select observed_app_version from products where id = $1',
      [productId],
    ),
  ]);

  if (assets.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        No assets for this product yet. Capture a flow or upload photographs on{' '}
        <a href="/assets" className="text-primary underline">
          Assets
        </a>
        , and they become pickable here.
      </p>
    );
  }

  const currentVersion = product[0]?.observed_app_version ?? null;

  return (
    // Capped height: a library of two hundred assets should not push the copy
    // editor off the screen.
    <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
      {assets.map((asset) => {
        const attached = attachedIds.includes(asset.id);
        const staleness = asset.captured_at
          ? assetStaleness(new Date(asset.captured_at), asset.app_version, currentVersion)
          : null;

        return (
          <form key={asset.id} action={attached ? detachAsset : attachAsset}>
            <input type="hidden" name="contentItemId" value={contentItemId} />
            <input type="hidden" name="assetId" value={asset.id} />
            <button
              className={`block w-full overflow-hidden rounded-lg border text-left ${
                attached ? 'border-primary ring-2 ring-primary/30' : 'border-line hover:bg-sunk'
              }`}
              title={
                staleness?.reason
                  ? `${asset.caption ?? asset.kind} — ${staleness.reason}`
                  : (asset.caption ?? asset.kind)
              }
            >
              <span className="flex h-20 items-center justify-center bg-sunk">
                {asset.public_url && asset.mime_type.startsWith('image/') ? (
                  // Local uploads and Storage URLs both; neither is worth
                  // allow-listing in next/image config.
                  <img
                    src={asset.public_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] text-muted">{asset.kind}</span>
                )}
              </span>
              <span className="block truncate px-2 py-1 text-[11px] text-muted">
                {asset.caption ?? asset.tags[1] ?? asset.kind}
              </span>
              {staleness?.stale ? (
                <span className="block px-2 pb-1.5">
                  <Badge tone="warn">stale</Badge>
                </span>
              ) : null}
            </button>
          </form>
        );
      })}
    </div>
  );
}
