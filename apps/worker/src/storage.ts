/**
 * Asset storage.
 *
 * Uploads to a *public* Supabase Storage bucket, on purpose: Meta cURLs media at
 * publish time and signed URLs with a short expiry fail (v2 A.3). The bucket
 * holds rendered output only — never tokens, never source material.
 */
import { createHash } from 'node:crypto';
import type { HandlerContext } from './poller.js';

export const ASSET_BUCKET = 'halyard-assets';

export interface UploadInput {
  bytes: Buffer;
  mimeType: string;
  kind: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  caption?: string | null;
  contentItemId?: string | null;
  productId?: string | null;
}

export interface UploadedAsset {
  id: string;
  storagePath: string;
  publicUrl: string;
}

export async function uploadAsset(
  ctx: HandlerContext,
  input: UploadInput,
): Promise<UploadedAsset> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const digest = createHash('sha256').update(input.bytes).digest('hex').slice(0, 16);
  const extension = extensionFor(input.mimeType);
  const storagePath = `${input.kind}/${digest}.${extension}`;

  let productId = input.productId ?? null;
  if (!productId && input.contentItemId) {
    const { rows } = await ctx.pool.query<{ product_id: string }>(
      'select product_id from content_items where id = $1',
      [input.contentItemId],
    );
    productId = rows[0]?.product_id ?? null;
  }

  let publicUrl = `file://local/${storagePath}`;

  if (supabaseUrl && serviceKey) {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${ASSET_BUCKET}/${storagePath}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${serviceKey}`,
          'content-type': input.mimeType,
          'x-upsert': 'true',
        },
        body: new Uint8Array(input.bytes),
      },
    );
    if (!response.ok && response.status !== 409) {
      throw new Error(`Storage upload failed: HTTP ${response.status} ${await response.text()}`);
    }
    publicUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${ASSET_BUCKET}/${storagePath}`;
  } else {
    ctx.log('storage not configured, recording asset without upload', { storagePath });
  }

  const { rows } = await ctx.pool.query<{ id: string }>(
    `insert into assets (product_id, kind, storage_path, mime_type, width, height,
                         duration_seconds, bytes, caption, source, public_url)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'render',$10)
     returning id`,
    [
      productId,
      input.kind,
      storagePath,
      input.mimeType,
      input.width ?? null,
      input.height ?? null,
      input.durationSeconds ?? null,
      input.bytes.byteLength,
      input.caption ?? null,
      publicUrl,
    ],
  );

  return { id: rows[0]!.id, storagePath, publicUrl };
}

function extensionFor(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/mp4': 'm4a',
  };
  return map[mimeType] ?? 'bin';
}
