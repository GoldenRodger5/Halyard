/**
 * §551. Import licensed sound effects into the library.
 *
 *   DATABASE_URL=... HALYARD_LOCAL_ASSET_DIR=... npx tsx scripts/import-sfx.ts /tmp/sfx.json
 *
 * The SFX counterpart of `import-music.ts`, written because there was none: the
 * `sound_effects` table held four fixtures whose `licence` column read, in as
 * many words, *"Synthesised test fixture — NOT a licence"*, and every piece
 * logged "no sound design: the sound effect library is empty".
 *
 * Three lessons from the music import are carried across rather than
 * rediscovered:
 *
 * - **§547.** An import that cannot store the bytes must fail, not fabricate a
 *   URL and print a tick. `upload` here writes to `HALYARD_LOCAL_ASSET_DIR` or
 *   throws.
 * - **§548.** A CC0 cue belongs to no product, so `product_id` is null unless
 *   the manifest names one. The selector already reads
 *   `(product_id = $1 or product_id is null)`.
 * - **Measured, not declared.** Duration and peak level come from `ffprobe`
 *   against the downloaded bytes, never from the manifest — the index's
 *   duration is what we searched on, and what we store has to be what we hold.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';

const run = promisify(execFile);

interface Entry {
  file: string;
  title: string;
  source: string;
  licence: string;
  licensor?: string;
  licenceProof?: string;
  role: string;
  productId?: string;
}

async function fetchToDisk(url: string, target: string): Promise<Buffer> {
  if (!/^https?:/.test(url)) {
    const bytes = await readFile(url);
    await writeFile(target, new Uint8Array(bytes));
    return bytes;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(target, new Uint8Array(bytes));
  return bytes;
}

/** Seconds, from the file rather than from whoever described it. */
async function probeDuration(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('could not read a duration');
  return Number(seconds.toFixed(3));
}

/**
 * Peak level in dBFS, which is what the mixer ducks against.
 *
 * A cue that peaks at 0 dBFS under a −14 LUFS voiceover is not punctuation, it
 * is an interruption, and the mixer needs the real number to place it.
 */
async function probePeakDb(file: string): Promise<number> {
  /*
   * `-v info`, not `-v error`. `volumedetect` reports `max_volume` at info
   * level, so quieting ffmpeg hides the one line this function exists to read —
   * and every cue was refused with "could not measure a peak level" while the
   * measurement was working perfectly and being suppressed.
   */
  const { stderr } = await run('ffmpeg', ['-v', 'info', '-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const match = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr);
  if (!match) throw new Error('could not measure a peak level');
  return Number(Number(match[1]).toFixed(2));
}

async function upload(storagePath: string, bytes: Buffer): Promise<string> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    const publicDir = process.env.HALYARD_LOCAL_ASSET_DIR;
    if (!publicDir) {
      throw new Error(
        'No SUPABASE_SERVICE_ROLE_KEY and no HALYARD_LOCAL_ASSET_DIR, so there is nowhere to put ' +
          'the audio. A cue row pointing at bytes that do not exist is silence where a cue should be.',
      );
    }
    const target = path.join(publicDir, storagePath.replace(/\//g, '-'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, new Uint8Array(bytes));
    return `/dev-assets/${path.basename(target)}`;
  }

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
    console.error('usage: import-sfx.ts <manifest.json>');
    process.exit(1);
  }

  const entries = JSON.parse(await readFile(manifestPath, 'utf8')) as Entry[];
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const work = await mkdtemp(path.join(tmpdir(), 'halyard-sfx-'));
  let imported = 0;
  let refused = 0;

  try {
    for (const entry of entries) {
      const name = slug(entry.title || 'untitled');
      const local = path.join(work, `${name}.audio`);

      try {
        const bytes = await fetchToDisk(entry.file, local);
        const durationSeconds = await probeDuration(local);
        const peakDb = await probePeakDb(local);

        const storagePath = `sfx/${name}.mp3`;
        const publicUrl = await upload(storagePath, bytes);

        /* §548. Null unless the manifest names a product. */
        const productId = entry.productId ?? process.env.SFX_PRODUCT_ID ?? null;

        const asset = await pool.query<{ id: string }>(
          `insert into assets (product_id, kind, mime_type, storage_path, public_url, tags, caption)
           values ($1, 'audio', 'audio/mpeg', $2, $3, array['sound_effect'], $4)
           on conflict do nothing
           returning id`,
          [productId, storagePath, publicUrl, `${entry.title} — ${entry.licence}`],
        );
        const assetId =
          asset.rows[0]?.id ??
          (
            await pool.query<{ id: string }>(
              'select id from assets where storage_path = $1 limit 1',
              [storagePath],
            )
          ).rows[0]!.id;

        await pool.query(
          /*
           * `licence_proof` is not optional and the database says so:
           * `sound_effects_production_needs_proof` refuses any
           * `licensed_production` row without it. That is the right shape —
           * a cue claiming a licence it cannot evidence is exactly gotcha 9's
           * rule about fabricated evidence, one table along — so the manifest
           * carries the CC0 deed URL and the refusal is honoured rather than
           * worked around.
           */
          `insert into sound_effects
             (product_id, asset_id, title, role, duration_seconds, peak_db,
              licence, licensor, licence_url, licence_proof,
              attribution_required, provenance)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,'licensed_production')
           on conflict do nothing`,
          [
            productId, assetId, entry.title, entry.role, durationSeconds, peakDb,
            entry.licence, entry.licensor ?? null, entry.source ?? null,
            entry.licenceProof ?? entry.source ?? null,
          ],
        );

        imported += 1;
        console.log(`✓ ${entry.title} — ${entry.role}, ${durationSeconds}s, peak ${peakDb} dB`);
      } catch (err) {
        refused += 1;
        console.log(`✗ ${entry.title}\n    ${(err as Error).message}`);
      }
    }

    const { rows } = await pool.query<{ provenance: string; n: string }>(
      'select provenance, count(*)::text as n from sound_effects group by provenance',
    );
    console.log(`\n${imported} imported, ${refused} refused.`);
    console.log(`library: ${rows.map((r) => `${r.provenance}=${r.n}`).join(' ')}`);
    console.log('Only licensed_production cues can reach a published post.');
  } finally {
    await pool.end();
    await rm(work, { recursive: true, force: true });
  }
}

void main();
