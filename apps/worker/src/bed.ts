/**
 * Music beds, from a library the operator owns.
 *
 * ## Why this exists instead of a generator
 *
 * ElevenLabs Music is off, because their terms carve advertising out of the
 * standard commercial grant and Halyard's entire output is product marketing.
 * There is no licence here, so that path stays shut.
 *
 * The obvious workaround is to synthesise a bed with FFmpeg — a drone is
 * trivially ours and needs no licence at all. It is also, plainly, a drone. A
 * cheap pad under a brand's marketing video is worse than silence: it reads as
 * corner-cutting to exactly the audience the video is for, and it would be
 * indistinguishable in the pipeline from a real bed, which means nobody would
 * ever notice it was the cheap one.
 *
 * So: beds come from the asset library. Drop licensed audio in, tag it, and
 * every video mix picks one up. Until then videos ship with narration alone,
 * normalised, which is a legitimate and common short-form style rather than a
 * degraded one.
 *
 * That keeps the licence claim where it belongs — with the file the operator
 * actually bought — and leaves nothing in the pipeline blocked on it.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MusicClient } from '@halyard/core';
import type { HandlerContext } from './poller.js';

/** The tag that marks an audio asset as usable as a bed. */
export const BED_TAG = 'music_bed';

export interface BedSelection {
  assetId: string;
  path: string;
  /** Where the licence for this file comes from, recorded with the post. */
  licence: string | null;
}

/**
 * Pick a bed for a product, if it has any.
 *
 * Deliberately rotates by least-recently-used rather than at random: sixty
 * posts a month over three beds is noticeable, and the same bed twice in a row
 * is the thing a viewer registers first.
 */
export async function selectBed(
  ctx: HandlerContext,
  productId: string,
): Promise<{ assetId: string; storagePath: string | null; publicUrl: string | null; licence: string | null } | null> {
  const { rows } = await ctx.pool.query<{
    id: string;
    storage_path: string | null;
    public_url: string | null;
    licence: string | null;
  }>(
    `select a.id, a.storage_path, a.public_url, a.caption as licence
       from assets a
      where a.product_id = $1
        and a.kind = 'audio'
        and $2 = any(a.tags)
      order by a.last_used_at nulls first, a.created_at
      limit 1`,
    [productId, BED_TAG],
  );

  const row = rows[0];
  if (!row) return null;
  return {
    assetId: row.id,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    licence: row.licence,
  };
}

/**
 * A `MusicClient` backed by the operator's own library.
 *
 * Satisfies the same interface the ElevenLabs client does, so the mix does not
 * care where the bed came from — but it never generates anything, and it
 * refuses rather than substituting when the library is empty.
 */
export class LibraryBedClient implements MusicClient {
  constructor(
    private readonly ctx: HandlerContext,
    private readonly productId: string,
    private readonly workDir: string,
    private readonly readBytes: (
      storagePath: string | null,
      publicUrl: string | null,
    ) => Promise<Buffer | null>,
  ) {}

  async compose(): Promise<Buffer> {
    const bed = await selectBed(this.ctx, this.productId);
    if (!bed) {
      throw new BedUnavailable(
        `No music bed is available for ${this.productId}. Add a licensed audio asset ` +
          `tagged '${BED_TAG}' and every video mix will pick one up. Until then videos ` +
          'ship with narration alone, normalised — which is a normal short-form style, ' +
          'not a broken one.',
      );
    }

    const bytes = await this.readBytes(bed.storagePath, bed.publicUrl);
    if (!bytes) {
      throw new BedUnavailable(
        `Bed asset ${bed.assetId} is recorded but its bytes could not be read back.`,
      );
    }

    // Touched so the rotation actually rotates. Without this the ordering is
    // stable and the first bed wins every time.
    await this.ctx.pool.query(`update assets set last_used_at = now() where id = $1`, [
      bed.assetId,
    ]);

    const file = path.join(this.workDir, 'bed-source.mp3');
    await writeFile(file, bytes);
    return bytes;
  }
}

export class BedUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BedUnavailable';
  }
}
