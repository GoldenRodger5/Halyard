/**
 * Resolving sound-effect cues to files. §242.
 *
 * ## Why this file exists
 *
 * §233 built `planSfx` (where effects belong) and `selectEffect` (which file
 * fills a cue) and wired neither. There was no handler that called them and no
 * input on `mixAudio` that could take the result, so the entire subsystem was
 * unreachable from production — the exact shape this codebase keeps finding,
 * and the fourth time it has appeared.
 *
 * This is the join: the beat plan and the library on one side, downloaded
 * files with times and levels on the other.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  planSfx,
  selectEffect,
  type SfxCue,
  type SoundEffect,
} from '@halyard/core';
import type { HandlerContext } from './poller.js';

export interface ResolvedCue {
  path: string;
  atSeconds: number;
  gainDb: number;
  /** What this marks, kept for the record and for QC. */
  because: string;
  effectId: string;
  title: string;
}

export interface SfxResult {
  cues: ResolvedCue[];
  /** Why there are none, when there are none. Never silently empty. */
  skippedReason: string | null;
  /** Every cue that was planned but could not be filled. */
  unfilled: Array<{ role: string; because: string; reason: string }>;
}

/**
 * Plan effects for a piece and fetch the files that fill them.
 *
 * `forPublication` decides whether test fixtures are eligible, exactly as it
 * does for music: a preview may use them and a post may not.
 */
export async function resolveSfx(
  ctx: HandlerContext,
  input: {
    productId: string;
    platform: string;
    workDir: string;
    beats: Array<{
      startSeconds: number;
      role: string;
      transitionOut?: string;
      entrance?: string;
      isProductFootage?: boolean;
    }>;
    totalSeconds: number;
    visualLanguage?: string | null;
    hasVoiceover: boolean;
    forPublication: boolean;
  },
  readBytes: (storagePath: string | null, publicUrl: string | null) => Promise<Buffer | null>,
): Promise<SfxResult> {
  const plan = planSfx({
    beats: input.beats,
    totalSeconds: input.totalSeconds,
    visualLanguage: input.visualLanguage ?? null,
    hasVoiceover: input.hasVoiceover,
  });

  if (plan.cues.length === 0) {
    return { cues: [], skippedReason: plan.refusedReason ?? 'No cue in this edit wanted one.', unfilled: [] };
  }

  const { rows } = await ctx.pool.query<{
    id: string;
    asset_id: string;
    title: string;
    role: string;
    duration_seconds: string;
    peak_db: string;
    licence: string;
    provenance: string;
    licence_proof: string | null;
    attribution_required: boolean;
    attribution_text: string | null;
    platform_restrictions: string[];
    prohibited_platforms: string[];
    active: boolean;
    expires_at: string | null;
    last_used_at: string | null;
    storage_path: string | null;
    public_url: string | null;
  }>(
    `select s.id, s.asset_id, s.title, s.role, s.duration_seconds, s.peak_db,
            s.licence, s.provenance, s.licence_proof, s.attribution_required,
            s.attribution_text, s.platform_restrictions, s.prohibited_platforms,
            s.active, s.expires_at, s.last_used_at,
            a.storage_path, a.public_url
       from sound_effects s
       join assets a on a.id = s.asset_id
      where (s.product_id = $1 or s.product_id is null)
        and a.archived_at is null
        and s.active = true`,
    [input.productId],
  );

  /*
   * The provenance gate, identical in shape to music's. A fixture effect is
   * usable in a preview and refused in a post, and the refusal names the
   * class rather than pretending the library is empty.
   */
  const eligible = rows.filter((r) => {
    if (input.forPublication && r.provenance !== 'licensed_production') return false;
    if (r.provenance === 'licensed_production' && !r.licence_proof?.trim()) return false;
    if ((r.prohibited_platforms ?? []).includes(input.platform)) return false;
    return true;
  });

  const library: SoundEffect[] = eligible.map((r) => ({
    id: r.id,
    assetId: r.asset_id,
    title: r.title,
    role: r.role as SoundEffect['role'],
    durationSeconds: Number(r.duration_seconds),
    peakDb: Number(r.peak_db),
    licence: r.licence,
    attributionRequired: r.attribution_required,
    attributionText: r.attribution_text,
    platformRestrictions: r.platform_restrictions ?? [],
    expiresAt: r.expires_at ? new Date(r.expires_at) : null,
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : null,
  }));

  const cues: ResolvedCue[] = [];
  const unfilled: SfxResult['unfilled'] = [];
  /* Within one piece, an effect is used once. The same whoosh on every
     transition is the soundboard the brief warns about. */
  const usedInThisPiece = new Set<string>();

  for (const cue of plan.cues) {
    const available = library.filter((e) => !usedInThisPiece.has(e.id));
    const selection = selectEffect(available, cue as SfxCue, input.platform);
    if (!selection.effect) {
      unfilled.push({ role: cue.role, because: cue.because, reason: selection.silenceReason ?? 'unknown' });
      continue;
    }

    const row = eligible.find((r) => r.id === selection.effect!.id)!;
    const bytes = await readBytes(row.storage_path, row.public_url);
    if (!bytes) {
      unfilled.push({ role: cue.role, because: cue.because, reason: 'file could not be read back' });
      continue;
    }

    const file = path.join(input.workDir, `sfx-${cues.length}-${row.id.slice(0, 8)}.mp3`);
    await writeFile(file, bytes);
    usedInThisPiece.add(row.id);
    cues.push({
      path: file,
      atSeconds: cue.atSeconds,
      gainDb: cue.gainDb,
      because: cue.because,
      effectId: row.id,
      title: row.title,
    });
  }

  for (const cue of cues) {
    await ctx.pool.query(
      `update sound_effects set last_used_at = now(), usage_count = usage_count + 1 where id = $1`,
      [cue.effectId],
    );
  }

  return {
    cues,
    skippedReason:
      cues.length === 0
        ? rows.length === 0
          ? 'The sound effect library is empty.'
          : `${plan.cues.length} cues planned and none could be filled: ${unfilled[0]?.reason ?? 'unknown'}`
        : null,
    unfilled,
  };
}
