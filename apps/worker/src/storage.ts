/**
 * Asset storage.
 *
 * Uploads to a *public* Supabase Storage bucket, on purpose: Meta cURLs media at
 * publish time and signed URLs with a short expiry fail (v2 A.3). The bucket
 * holds rendered output only — never tokens, never source material.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
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
  altText?: string | null;
  contentItemId?: string | null;
  productId?: string | null;
  /** 'render' by default; 'capture' for footage of the live product. */
  source?: string;
  tags?: string[];
  /** §402. How a generated image was shot, for the recency read. */
  shot?: string | null;
  usableFor?: string[];
  flowId?: string | null;
  appVersion?: string | null;
  sourceUrl?: string | null;
  originalFilename?: string | null;
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
    // No Supabase Storage configured. Rather than record an unusable
    // `file://` URL, the bytes go into the web app's public directory so the
    // asset is at least visible in the library and renderable locally. A Meta
    // publish still needs a real public URL, and /settings/readiness says so.
    const publicDir = process.env.HALYARD_LOCAL_ASSET_DIR;
    if (publicDir) {
      const target = path.join(publicDir, storagePath.replace(/\//g, '-'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, new Uint8Array(input.bytes));
      publicUrl = `/dev-assets/${path.basename(target)}`;
      ctx.log('storage not configured, wrote asset locally', { publicUrl });
    } else {
      ctx.log('storage not configured, recording asset without upload', { storagePath });
    }
  }

  const { rows } = await ctx.pool.query<{ id: string }>(
    `insert into assets (product_id, kind, storage_path, mime_type, width, height,
                         duration_seconds, bytes, caption, alt_text, source, public_url,
                         tags, usable_for, flow_id, app_version, captured_at, source_url,
                         original_filename, checksum, shot)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
             case when $15::text is null then null else now() end, $17,$18,$19,$20)
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
      input.altText ?? null,
      input.source ?? 'render',
      publicUrl,
      input.tags ?? [],
      input.usableFor ?? [],
      input.flowId ?? null,
      input.appVersion ?? null,
      input.sourceUrl ?? null,
      input.originalFilename ?? null,
      digest,
      input.shot ?? null,
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
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/mp4': 'm4a',
  };
  return map[mimeType] ?? 'bin';
}

/**
 * Read an asset's bytes back, by whichever route `uploadAsset` used to store
 * them — the bucket in production, the web app's public directory locally.
 *
 * A `file://local/...` URL means storage was not configured *and* no local
 * directory was set, so the bytes were never written anywhere. That returns
 * null: there is genuinely nothing to read, and pretending otherwise would
 * produce a video muxed against a file that does not exist.
 */
export async function readAssetBytes(
  storagePath: string | null,
  publicUrl: string | null,
): Promise<Buffer | null> {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey && storagePath) {
    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/${ASSET_BUCKET}/${storagePath}`,
      { headers: { authorization: `Bearer ${serviceKey}` } },
    );
    if (!response.ok) {
      throw new Error(
        `Could not read the voiceover back from storage (${storagePath}): HTTP ${response.status}. ` +
          'Rendering would otherwise produce a silent video from an item that has audio.',
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  // The local fallback flattens the storage path into one filename, so the
  // basename of the URL is the filename on disk.
  const localDir = process.env.HALYARD_LOCAL_ASSET_DIR;
  if (localDir && publicUrl?.startsWith('/dev-assets/')) {
    return readFile(path.join(localDir, path.basename(publicUrl))).catch(() => null);
  }

  return null;
}
