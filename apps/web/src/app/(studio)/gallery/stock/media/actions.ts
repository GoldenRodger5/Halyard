'use server';

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { FLOWS, type FlowId } from '@halyard/core';
import { query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

/**
 * Local asset storage, for uploads made from this machine.
 *
 * Supabase Storage is where captures and renders live, because Meta cURLs media
 * at publish time and needs a public URL. An upload made here before Storage is
 * configured lands in the app's own public directory instead, which works for
 * everything except a Meta publish — and the asset row says so.
 */
const LOCAL_DIR = path.resolve(process.cwd(), 'public/uploads');
const MAX_BYTES = 64 * 1024 * 1024;

const ACCEPTED: Record<string, { kind: string; extension: string }> = {
  'image/png': { kind: 'photo', extension: 'png' },
  'image/jpeg': { kind: 'photo', extension: 'jpg' },
  'image/webp': { kind: 'photo', extension: 'webp' },
  'video/mp4': { kind: 'video', extension: 'mp4' },
  'video/quicktime': { kind: 'video', extension: 'mov' },
  'audio/mpeg': { kind: 'audio', extension: 'mp3' },
  'audio/wav': { kind: 'audio', extension: 'wav' },
};

export async function uploadAssets(formData: FormData): Promise<void> {
  await requireOperator();
  const productId = String(formData.get('product') ?? 'recipefix');
  const tags = String(formData.get('tags') ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return;

  await mkdir(LOCAL_DIR, { recursive: true });

  for (const file of files) {
    const accepted = ACCEPTED[file.type];
    if (!accepted) continue;
    if (file.size > MAX_BYTES) continue;

    const bytes = Buffer.from(await file.arrayBuffer());
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const name = `${checksum.slice(0, 16)}.${accepted.extension}`;
    await writeFile(path.join(LOCAL_DIR, name), bytes);

    const dimensions = accepted.kind === 'photo' ? readPngSize(bytes) : null;

    await query(
      `insert into assets (product_id, kind, storage_path, mime_type, bytes, tags,
                           source, public_url, original_filename, checksum,
                           width, height, usable_for)
       values ($1,$2,$3,$4,$5,$6,'upload',$7,$8,$9,$10,$11,$12)
       on conflict do nothing`,
      [
        productId,
        accepted.kind,
        `uploads/${name}`,
        file.type,
        bytes.byteLength,
        ['upload', ...tags],
        `/uploads/${name}`,
        file.name,
        checksum,
        dimensions?.width ?? null,
        dimensions?.height ?? null,
        accepted.kind === 'video' ? ['video'] : ['image', 'carousel', 'video'],
      ],
    );
  }

  revalidatePath('/gallery/stock/media');
}

/** PNG dimensions live in the IHDR chunk, at a fixed offset. */
function readPngSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export async function retagAssets(formData: FormData): Promise<void> {
  await requireOperator();
  const ids = formData.getAll('selected').map(String);
  const add = String(formData.get('addTags') ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const remove = String(formData.get('removeTags') ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  if (ids.length === 0 || (add.length === 0 && remove.length === 0)) return;

  await query(
    `update assets
        set tags = (
          select coalesce(array_agg(distinct t), '{}')
            from unnest(tags || $2::text[]) as t
           where t <> all ($3::text[])
        )
      where id = any($1::uuid[])`,
    [ids, add, remove],
  );

  revalidatePath('/gallery/stock/media');
}

/**
 * Archive rather than delete.
 *
 * An asset may already be inside a published post, and removing the row would
 * leave that post pointing at nothing while telling nobody.
 */
export async function archiveAssets(formData: FormData): Promise<void> {
  await requireOperator();
  const ids = formData.getAll('selected').map(String);
  if (ids.length === 0) return;

  await query(
    `update assets
        set archived_at = now(),
            archived_reason = coalesce(archived_reason, 'Archived by the operator.')
      where id = any($1::uuid[]) and archived_at is null`,
    [ids],
  );
  revalidatePath('/gallery/stock/media');
}

export async function restoreAssets(formData: FormData): Promise<void> {
  await requireOperator();
  const ids = formData.getAll('selected').map(String);
  if (ids.length === 0) return;
  await query(
    `update assets set archived_at = null, archived_reason = null where id = any($1::uuid[])`,
    [ids],
  );
  revalidatePath('/gallery/stock/media');
}

/** Queue a fresh capture of a flow. The worker verifies before it records. */
export async function recaptureFlow(formData: FormData): Promise<void> {
  await requireOperator();
  const flowId = String(formData.get('flowId')) as FlowId;
  const productId = String(formData.get('product') ?? 'recipefix');
  const flow = FLOWS[flowId];
  if (!flow) return;

  // Dependent flows are captured inside their root's chain, so queuing one
  // directly would be a job that can only fail.
  const rootId = flow.dependsOn ?? flow.id;

  await query(
    `insert into jobs (kind, payload, priority, dedupe_key)
     values ('capture', $1, 40, $2)
     on conflict do nothing`,
    [
      { flowId: rootId, productId },
      `capture:${rootId}:${productId}:${new Date().toISOString().slice(0, 13)}`,
    ],
  );

  await query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'capture_requested', 'product', null, $1)`,
    [{ flow: rootId, productId }],
  );

  revalidatePath('/gallery/stock/media');
}
