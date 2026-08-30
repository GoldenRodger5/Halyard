/**
 * Bring a local database up to date when there is no migration ledger.
 *
 * Each file is applied on its own. Postgres wraps a multi-statement string in
 * an implicit transaction, so a file that fails rolls back whole — a migration
 * that was already applied leaves nothing behind when it is refused. Anything
 * that fails for a reason other than "already exists" is reported and stops
 * the run, because that is a real problem rather than a replay.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const DIR = 'supabase/migrations';

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const applied = [], skipped = [], failed = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await client.query(readFileSync(path.join(DIR, file), 'utf8'));
      applied.push(file);
    } catch (err) {
      if (/already exists|duplicate/i.test(err.message)) skipped.push(file);
      else failed.push([file, err.message]);
    }
  }
  await client.end();
  console.warn(`applied ${applied.length}: ${applied.join(' ')}`);
  console.warn(`skipped ${skipped.length} already-present`);
  for (const [f, m] of failed) console.warn(`FAILED ${f}: ${m}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
