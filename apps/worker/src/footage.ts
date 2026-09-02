/**
 * Getting captured footage into the render bundle. §246.
 *
 * ## The failure this fixes
 *
 * A beat that plays product footage references it as a path inside the
 * Remotion bundle's `public/` directory — `capture/adapt_and_reveal.mp4`. The
 * capture handler writes the cut file there and nowhere else.
 *
 * A deployed worker's container is ephemeral. Redeploy it and `public/` is
 * whatever shipped in the image, so every render that plans on product
 * footage fails with a 404 from the bundle's own dev server:
 *
 *   Received a status code of 404 while downloading file
 *   http://localhost:3000/public/capture/adapt_and_reveal.mp4
 *
 * Three retries, then `dead`. Nothing about the failure says "the file did not
 * survive the deploy", and the item is left failed for a reason that reads
 * like a render bug.
 *
 * ## The fix, in two halves
 *
 * The cut footage becomes a real asset in storage, and the render handler
 * stages whatever a beat references back into `public/` before rendering. The
 * second half is what makes renders survive a restart; the first is what gives
 * it something to stage from.
 */
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { invalidateBundle, PUBLIC_DIR } from './video.js';
import type { HandlerContext } from './poller.js';

/** Where a bundle-relative footage path lives on disk. */
export function footagePathOnDisk(file: string): string {
  return path.join(PUBLIC_DIR, file);
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export interface StageResult {
  staged: string[];
  /** Files a beat asked for that could not be produced, with the reason. */
  missing: Array<{ file: string; reason: string }>;
}

/**
 * Ensure every footage file these beats reference is on disk.
 *
 * Files already present are left alone — re-downloading on every render would
 * add a storage round trip to the common case for nothing, and the bundle
 * fingerprint would churn.
 */
export async function stageFootage(
  ctx: HandlerContext,
  beats: Array<Record<string, unknown>>,
  readBytes: (storagePath: string | null, publicUrl: string | null) => Promise<Buffer | null>,
): Promise<StageResult> {
  const wanted = new Set<string>();
  for (const beat of beats) {
    const media = beat.media as { file?: string } | undefined;
    if (media?.file) wanted.add(media.file);
  }
  if (wanted.size === 0) return { staged: [], missing: [] };

  const staged: string[] = [];
  const missing: StageResult['missing'] = [];

  for (const file of wanted) {
    const target = footagePathOnDisk(file);
    if (await exists(target)) continue;

    /*
     * Found by a tag carrying the bundle-relative path the beat references.
     *
     * `uploadAsset` chooses its own hashed storage path, so the tag is the
     * join — one string in one place, rather than a second identifier on the
     * beat that would eventually drift from the first.
     */
    const { rows } = await ctx.pool.query<{ storage_path: string | null; public_url: string | null }>(
      `select storage_path, public_url from assets
        where $1 = any(tags) and archived_at is null
        order by created_at desc limit 1`,
      [file],
    );
    const asset = rows[0];
    if (!asset) {
      missing.push({
        file,
        reason:
          'No asset is stored under this path, so a fresh container has no way to get it. ' +
          'The capture that produced it predates footage being persisted, and needs re-running.',
      });
      continue;
    }

    const bytes = await readBytes(asset.storage_path, asset.public_url);
    if (!bytes) {
      missing.push({ file, reason: 'The asset exists but its bytes could not be read back.' });
      continue;
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    staged.push(file);
  }

  if (staged.length > 0) {
    /*
     * §163. Remotion caches bundles keyed on the code and copies `publicDir`
     * in when it builds one, so a file written after a bundle exists is never
     * served. Invalidating is what makes the staged file visible.
     */
    invalidateBundle();
    ctx.log('staged captured footage into the render bundle', { files: staged });
  }

  return { staged, missing };
}

/**
 * §478. A stored stock clip, on disk where the bundle can serve it.
 *
 * Same contract as `stageFootage`: present means untouched, absent means
 * fetched from the asset store and the bundle invalidated so it is served.
 * Returns the bundle-relative path, or null when the bytes could not be read —
 * the caller lets the beat fall back to a still rather than failing the render.
 */
export async function stageClip(
  ctx: HandlerContext,
  asset: { id: string; storage_path: string | null; public_url: string | null },
  readBytes: (storagePath: string | null, publicUrl: string | null) => Promise<Buffer | null>,
): Promise<string | null> {
  const file = `stock/${asset.id}.mp4`;
  const target = footagePathOnDisk(file);
  if (await exists(target)) return file;

  const bytes = await readBytes(asset.storage_path, asset.public_url);
  if (!bytes) {
    ctx.log('stock clip could not be read back from storage', { assetId: asset.id });
    return null;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  invalidateBundle();
  ctx.log('staged stock footage into the render bundle', { file });
  return file;
}
