/**
 * Promote real collected stories into signals, in production. §217.
 *
 * Read-mostly and reversible: it writes `signals` rows and stamps the
 * `rss_items` it used as `surfaced`. It publishes nothing, spends no model
 * credits, and touches no account. The point is to unblock the pipeline whose
 * only defect was that nothing joined two tables.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { promoteProductFacts, promoteToSignals } from '../src/handlers/signals.js';

const env = JSON.parse(readFileSync(process.env.RV!, 'utf8')) as Record<string, string>;
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3, connectionTimeoutMillis: 20_000 });

const ctx = {
  pool,
  log: (msg: string, meta?: unknown) => console.log(`  ${msg}`, meta ?? ''),
  enqueue: async () => undefined,
} as never;

const { rows: products } = await pool.query<{ id: string }>('select id from products order by id');

console.log('\nPromoting collected stories into signals.\n');
for (const product of products) {
  const before = await pool.query<{ n: string }>(
    `select count(*)::text as n from signals where product_id = $1 and consumed_at is null`,
    [product.id],
  );
  const available = await pool.query<{ n: string }>(
    `select count(*)::text as n from rss_items
      where product_id = $1 and status = 'new' and expires_at > now()`,
    [product.id],
  );

  const promoted = await promoteToSignals(ctx, product.id);
  const fromFacts = await promoteProductFacts(ctx, product.id);

  const after = await pool.query<{ n: string }>(
    `select count(*)::text as n from signals where product_id = $1 and consumed_at is null`,
    [product.id],
  );

  console.log(
    `  ${product.id.padEnd(12)} fresh stories ${String(available.rows[0]!.n).padStart(4)}  ` +
      `signals ${before.rows[0]!.n} → ${after.rows[0]!.n}  (+${promoted} rss, +${fromFacts} facts)`,
  );
}

const { rows: sample } = await pool.query<{ summary: string; relevance: string | null }>(
  `select summary, relevance from signals where consumed_at is null
    order by relevance desc nulls last limit 3`,
);
if (sample.length > 0) {
  console.log('\n  What the idea proposer will now see:\n');
  for (const s of sample) {
    console.log(`    [${s.relevance ?? '—'}] ${s.summary.slice(0, 110)}`);
  }
}
console.log();
await pool.end();
