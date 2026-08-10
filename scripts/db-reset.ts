/**
 * Apply every migration in supabase/migrations to DATABASE_URL, in order.
 *
 * Used by CI and the integration tests. `--fresh` drops and recreates the public
 * schema first, which is why this refuses to run against anything that looks
 * like a production URL.
 *
 *   DATABASE_URL=postgres://... pnpm db:reset -- --fresh --seed
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const SEED = path.join(ROOT, 'supabase/seed.sql');

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const fresh = process.argv.includes('--fresh');
  const seed = process.argv.includes('--seed');

  if (fresh && !/localhost|127\.0\.0\.1|\/tmp|host\.docker\.internal/.test(url)) {
    throw new Error(
      `Refusing to --fresh a non-local database. URL host looks remote: ${url.replace(/:[^:@]+@/, ':***@')}`,
    );
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  if (fresh) {
    await client.query('drop schema if exists public cascade; create schema public;');
    console.log('· dropped and recreated schema public');
  }

  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    try {
      await client.query(sql);
      console.log(`✓ ${file}`);
    } catch (err) {
      console.error(`✗ ${file}`);
      throw err;
    }
  }

  if (seed) {
    const sql = readFileSync(SEED, 'utf8');
    await client.query(sql);
    console.log('✓ seed.sql');
  }

  await client.end();
  console.log(`\n${files.length} migrations applied.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
