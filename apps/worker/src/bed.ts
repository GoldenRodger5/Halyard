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
import { selectBed as directBed, type AudioBrief, type MusicBed, type MusicClient } from '@halyard/core';
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
  /**
   * What the piece needs. §221.
   *
   * Optional so every existing caller keeps working: without a brief this
   * falls back to the least-recently-used rotation it always had. With one,
   * the Music Director matches mood, energy and tempo against the creative
   * direction and refuses a bed whose licence does not cover the platform.
   */
  brief?: AudioBrief,
): Promise<{ assetId: string; storagePath: string | null; publicUrl: string | null; licence: string | null } | null> {
  if (brief) {
    const { rows: bedRows } = await ctx.pool.query<{
      id: string;
      asset_id: string;
      title: string;
      mood: string;
      energy: string;
      bpm: number | null;
      duration_seconds: string;
      loopable: boolean;
      intro_seconds: string | null;
      licence: string;
      attribution_required: boolean;
      attribution_text: string | null;
      platform_restrictions: string[];
      expires_at: string | null;
      last_used_at: string | null;
      storage_path: string | null;
      public_url: string | null;
    }>(
      `select m.id, m.asset_id, m.title, m.mood, m.energy, m.bpm, m.duration_seconds,
              m.loopable, m.intro_seconds, m.licence, m.attribution_required,
              m.attribution_text, m.platform_restrictions, m.expires_at, m.last_used_at,
              a.storage_path, a.public_url
         from music_beds m
         join assets a on a.id = m.asset_id
        where (m.product_id = $1 or m.product_id is null)
          and a.archived_at is null`,
      [productId],
    );

    const selection = directBed(
      bedRows.map((r) => ({
        id: r.id,
        assetId: r.asset_id,
        title: r.title,
        mood: r.mood as MusicBed['mood'],
        energy: Number(r.energy),
        bpm: r.bpm,
        durationSeconds: Number(r.duration_seconds),
        loopable: r.loopable,
        introSeconds: r.intro_seconds === null ? null : Number(r.intro_seconds),
        licence: r.licence,
        attributionRequired: r.attribution_required,
        attributionText: r.attribution_text,
        platformRestrictions: r.platform_restrictions ?? [],
        expiresAt: r.expires_at ? new Date(r.expires_at) : null,
        lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : null,
      })),
      brief,
    );

    if (!selection.chosen) {
      /*
       * Reported rather than swallowed. "No bed fits" and "the library is
       * empty" are different facts, and a video shipping silent for the second
       * reason is an accident nobody would otherwise see.
       */
      ctx.log('no music bed selected', {
        productId,
        considered: selection.considered,
        reason: selection.silenceReason,
        rejected: selection.rejected.map((r) => `${r.bed.title}: ${r.reason}`),
      });
      return null;
    }

    const row = bedRows.find((r) => r.id === selection.chosen!.bed.id)!;
    ctx.log('music bed selected', {
      title: selection.chosen.bed.title,
      score: selection.chosen.score,
      because: selection.chosen.reasons,
      requiresAttribution: selection.chosen.requiresAttribution,
    });
    await ctx.pool.query('update music_beds set last_used_at = now() where id = $1', [row.id]);
    return {
      assetId: row.asset_id,
      storagePath: row.storage_path,
      publicUrl: row.public_url,
      licence: row.licence,
    };
  }

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
    /** What the piece needs, when the caller knows. §221. */
    private readonly brief?: AudioBrief,
  ) {}

  async compose(): Promise<Buffer> {
    const bed = await selectBed(this.ctx, this.productId, this.brief);
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
