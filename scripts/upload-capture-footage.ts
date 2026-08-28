/**
 * Put existing cut footage into storage. §246.
 *
 * A one-off for footage that was cut before §246 made the capture handler
 * persist it. The files exist in this checkout's `packages/render/public/`
 * because a capture ran here; a deployed container has never had them, which
 * is why every product-footage render failed after a redeploy.
 *
 * Tagged with the bundle-relative path the beats reference, which is what
 * `stageFootage` joins on.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const DIR = path.resolve('packages/render/public/capture');

async function upload(storagePath: string, bytes: Buffer): Promise<string> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  const response = await fetch(`${url}/storage/v1/object/halyard-assets/${storagePath}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'video/mp4', 'x-upsert': 'true' },
    body: new Uint8Array(bytes),
  });
  if (!response.ok && response.status !== 409) {
    throw new Error(`upload failed: ${response.status} ${await response.text()}`);
  }
  return `${url}/storage/v1/object/public/halyard-assets/${storagePath}`;
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    for (const name of await readdir(DIR)) {
      if (!name.endsWith('.mp4')) continue;
      const bundlePath = `capture/${name}`;
      const bytes = await readFile(path.join(DIR, name));
      const storagePath = `capture/${name}`;
      const publicUrl = await upload(storagePath, bytes);

      await pool.query(
        `insert into assets (product_id, kind, mime_type, storage_path, public_url, tags, caption, source)
         values ('recipefix','video','video/mp4',$1,$2,array['capture_cut',$3],$4,'capture')
         on conflict do nothing`,
        [storagePath, publicUrl, bundlePath, `Captured product footage: ${name.replace('.mp4', '')}`],
      );
      console.log(`${bundlePath} → ${bytes.byteLength} bytes`);
    }
  } finally {
    await pool.end();
  }
}

void main();
