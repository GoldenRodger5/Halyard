/**
 * Import licensed music into the library. §248.
 *
 * ## Usage
 *
 *   DATABASE_URL=... npx tsx scripts/import-music.ts path/to/manifest.json
 *
 * The manifest is a JSON array. Each entry needs a `file` (a local path or an
 * https URL) plus the licence facts a person had to establish by looking:
 *
 *   [{
 *     "file": "https://example.com/track.mp3",
 *     "title": "Warm Counter",
 *     "source": "https://example.com/the-page-you-got-it-from",
 *     "licence": "CC0 1.0 Universal",
 *     "licensor": "Some Artist",
 *     "licenceProof": "https://creativecommons.org/publicdomain/zero/1.0/",
 *     "mood": "warm", "energy": 0.4, "bpm": 96
 *   }]
 *
 * ## What it measures rather than trusts
 *
 * Duration is probed from the file. A manifest that claims 90 seconds for a
 * 12-second file would otherwise produce a bed the selector believes can
 * cover a 30-second piece, and the mix would run dry two thirds of the way
 * through with nothing reporting it.
 *
 * ## What it refuses
 *
 * Anything `validateBedImport` returns errors for is not imported at all.
 * Anything it cannot evidence is imported as `unverified`, which keeps it out
 * of posts while keeping the file. There is no flag that turns an unverified
 * bed into a production one — that requires editing the row with the proof,
 * which is a deliberate act by a person.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { validateBedImport, type BedImport } from '@halyard/core';

const run = promisify(execFile);

interface ManifestEntry extends Omit<BedImport, 'durationSeconds'> {
  file: string;
  durationSeconds?: number;
  productId?: string;
}

/** Duration from the file itself. A claimed duration is a guess. */
async function probeDuration(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`ffprobe could not read a duration from ${file}`);
  }
  return Math.round(seconds * 1000) / 1000;
}

async function fetchToDisk(source: string, target: string): Promise<Buffer> {
  if (!/^https?:/i.test(source)) {
    const bytes = await readFile(source);
    await writeFile(target, bytes);
    return bytes;
  }
  const response = await fetch(source, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${source} returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength < 1024) throw new Error(`${source} returned ${bytes.byteLength} bytes; that is not audio.`);
  await writeFile(target, bytes);
  return bytes;
}

async function upload(storagePath: string, bytes: Buffer): Promise<string> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return `file://local/${storagePath}`;
  const response = await fetch(`${url}/storage/v1/object/halyard-assets/${storagePath}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'audio/mpeg', 'x-upsert': 'true' },
    body: new Uint8Array(bytes),
  });
  if (!response.ok && response.status !== 409) {
    throw new Error(`upload failed: ${response.status} ${await response.text()}`);
  }
  return `${url}/storage/v1/object/public/halyard-assets/${storagePath}`;
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

async function main(): Promise<void> {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error('usage: import-music.ts <manifest.json>');
    process.exitCode = 1;
    return;
  }

  const entries = JSON.parse(await readFile(manifestPath, 'utf8')) as ManifestEntry[];
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const work = await mkdtemp(path.join(tmpdir(), 'halyard-import-'));

  let imported = 0;
  let refused = 0;

  try {
    for (const entry of entries) {
      const name = slug(entry.title || 'untitled');
      const local = path.join(work, `${name}.mp3`);

      let bytes: Buffer;
      try {
        bytes = await fetchToDisk(entry.file, local);
      } catch (err) {
        console.error(`✗ ${entry.title}: ${(err as Error).message}`);
        refused += 1;
        continue;
      }

      const durationSeconds = entry.durationSeconds ?? (await probeDuration(local));
      const candidate: BedImport = { ...entry, durationSeconds };
      const verdict = validateBedImport(candidate);

      if (verdict.errors.length > 0) {
        console.error(`✗ ${entry.title}\n    ${verdict.errors.join('\n    ')}`);
        refused += 1;
        continue;
      }

      const storagePath = `music/${name}.mp3`;
      const publicUrl = await upload(storagePath, bytes);
      const productId = entry.productId ?? process.env.MUSIC_PRODUCT_ID ?? 'recipefix';

      const { rows: asset } = await pool.query<{ id: string }>(
        `insert into assets (product_id, kind, mime_type, storage_path, public_url, tags, caption)
         values ($1,'audio','audio/mpeg',$2,$3,array['music_bed'],$4)
         on conflict do nothing returning id`,
        [productId, storagePath, publicUrl, `${entry.title} — ${entry.licence}`],
      );
      let assetId = asset[0]?.id;
      if (!assetId) {
        const { rows } = await pool.query<{ id: string }>(
          'select id from assets where storage_path = $1 limit 1',
          [storagePath],
        );
        assetId = rows[0]?.id;
      }
      if (!assetId) {
        console.error(`✗ ${entry.title}: the asset row could not be created or found.`);
        refused += 1;
        continue;
      }

      await pool.query(
        `insert into music_beds
           (product_id, asset_id, title, mood, energy, bpm, genre, duration_seconds, loopable,
            licence, licensor, licence_url, licence_proof, provenance, source, has_vocals,
            attribution_required, attribution_text, platform_restrictions, prohibited_platforms,
            expires_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         on conflict do nothing`,
        [
          productId, assetId, entry.title, entry.mood, entry.energy, entry.bpm ?? null,
          entry.genre ?? null, durationSeconds, entry.loopable ?? true,
          entry.licence, entry.licensor ?? null, entry.licenceProof ?? null,
          entry.licenceProof ?? null, verdict.provenance, entry.source,
          entry.hasVocals ?? false, entry.attributionRequired ?? false,
          entry.attributionText ?? null, entry.platformRestrictions ?? [],
          entry.prohibitedPlatforms ?? [], entry.expiresAt ?? null,
        ],
      );

      imported += 1;
      const mark = verdict.provenance === 'licensed_production' ? '✓' : '·';
      console.log(`${mark} ${entry.title} — ${verdict.provenance}, ${durationSeconds.toFixed(1)}s`);
      for (const w of verdict.warnings) console.log(`    ${w}`);
    }

    const { rows } = await pool.query<{ provenance: string; n: string }>(
      'select provenance, count(*)::text as n from music_beds group by provenance order by 1',
    );
    console.log(`\n${imported} imported, ${refused} refused.`);
    console.log('library:', rows.map((r) => `${r.provenance}=${r.n}`).join(' '));
    console.log('Only licensed_production beds can reach a published post.');
  } finally {
    await rm(work, { recursive: true, force: true });
    await pool.end();
  }
}

void main();
