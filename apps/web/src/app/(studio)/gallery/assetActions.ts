'use server';

import { revalidatePath } from 'next/cache';
import { assetStaleness } from '@halyard/core';
import { one, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

/**
 * Attach a library asset to a draft. Milestone 41 Part D.
 *
 * A stale asset can be attached deliberately — it may still be the right
 * picture — but the choice is recorded on the item's QC results so the queue
 * card can say so before approval rather than after publication.
 */

/**
 * Changing the attached media invalidates the media verdict.
 *
 * `qc_results.visual` describes the assets that were examined. Attaching or
 * detaching one changes what will actually be published — `publish` sends
 * `render_ids` **and** `attached_asset_ids` — so the stored verdict is now
 * about a different set of files. This is the media analogue of §90: the gate
 * was never bypassed, it was answered about something else.
 *
 * Re-running `review_media` is the right repair rather than a demotion. The
 * gate is cheap for stills — it reads dimensions off the `assets` rows and
 * downloads nothing — and re-examining is strictly better than marking the
 * verdict stale and leaving it there.
 *
 * The dedupe key is only unique while a job is `queued` or `running`, so a
 * second attachment after the first review completes enqueues a fresh one.
 */
async function reexamineMedia(contentItemId: string): Promise<void> {
  await query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ('review_media', $1, 40, $2) on conflict do nothing`,
    [JSON.stringify({ contentItemId }), `review_media:${contentItemId}`],
  );
}

export async function attachAsset(formData: FormData): Promise<void> {
  await requireOperator();
  const contentItemId = String(formData.get('contentItemId'));
  const assetId = String(formData.get('assetId'));

  const asset = await one<{
    id: string;
    captured_at: string | null;
    app_version: string | null;
    caption: string | null;
    product_id: string;
    archived_at: string | null;
  }>(
    `select id, captured_at, app_version, caption, product_id, archived_at
       from assets where id = $1`,
    [assetId],
  );
  if (!asset || asset.archived_at) return;

  const product = await one<{ observed_app_version: string | null }>(
    'select observed_app_version from products where id = $1',
    [asset.product_id],
  );

  const staleness = asset.captured_at
    ? assetStaleness(new Date(asset.captured_at), asset.app_version, product?.observed_app_version ?? null)
    : null;

  await query(
    `update content_items
        set attached_asset_ids = (
              select coalesce(array_agg(distinct a), '{}')
                from unnest(attached_asset_ids || $2::uuid[]) as a
            ),
            qc_results = case
              when $3::text is null then qc_results
              else jsonb_set(
                     coalesce(qc_results, '{}'::jsonb),
                     '{staleAssets}',
                     coalesce(qc_results -> 'staleAssets', '[]'::jsonb) || $4::jsonb)
            end
      where id = $1`,
    [
      contentItemId,
      [assetId],
      staleness?.stale ? staleness.reason : null,
      JSON.stringify([{ assetId, caption: asset.caption, reason: staleness?.reason ?? null }]),
    ],
  );

  await reexamineMedia(contentItemId);

  revalidatePath(`/gallery/${contentItemId}`);
  revalidatePath('/gallery');
}

export async function detachAsset(formData: FormData): Promise<void> {
  await requireOperator();
  const contentItemId = String(formData.get('contentItemId'));
  const assetId = String(formData.get('assetId'));

  await query(
    `update content_items
        set attached_asset_ids = (
              select coalesce(array_agg(a), '{}')
                from unnest(attached_asset_ids) as a
               where a <> $2::uuid
            ),
            qc_results = jsonb_set(
              coalesce(qc_results, '{}'::jsonb),
              '{staleAssets}',
              coalesce(
                (select jsonb_agg(e)
                   from jsonb_array_elements(coalesce(qc_results -> 'staleAssets', '[]'::jsonb)) e
                  where e ->> 'assetId' <> $2::text),
                '[]'::jsonb))
      where id = $1`,
    [contentItemId, assetId],
  );

  await reexamineMedia(contentItemId);

  revalidatePath(`/gallery/${contentItemId}`);
  revalidatePath('/gallery');
}
