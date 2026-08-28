/**
 * Run the §214 copy budget over every caption already in the database.
 *
 * Not a test — a measurement. The budgets are judgements, and the honest way to
 * check a judgement is to see what it says about work that already exists
 * rather than about a fixture written to satisfy it.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { budgetFor, checkCopyBudget, splitForBudget } from '@halyard/core';

const env = JSON.parse(readFileSync(process.env.RV!, 'utf8')) as Record<string, string>;
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });

const { rows } = await pool.query<{ platform: string; body: string; hashtags: string[] }>(
  `select platform, body, hashtags from content_items where body <> '' order by created_at desc`,
);

let over = 0;
const byPlatform = new Map<string, { n: number; over: number; avg: number }>();

for (const row of rows) {
  const budget = budgetFor(row.platform);
  const findings = checkCopyBudget(row.body, row.hashtags ?? [], budget);
  const tooLong = findings.some((f) => f.rule === 'budget.caption_too_long');
  if (tooLong) over += 1;

  const seen = byPlatform.get(row.platform) ?? { n: 0, over: 0, avg: 0 };
  seen.n += 1;
  seen.over += tooLong ? 1 : 0;
  seen.avg += row.body.length;
  byPlatform.set(row.platform, seen);
}

console.log('\nCopy budget, over every caption already written\n');
for (const [platform, s] of [...byPlatform].sort((a, b) => b[1].n - a[1].n)) {
  const budget = budgetFor(platform);
  console.log(
    `  ${platform.padEnd(10)} ${String(s.n).padStart(3)} posts  ` +
      `avg ${String(Math.round(s.avg / s.n)).padStart(4)} chars  ` +
      `budget ${String(budget.target).padStart(4)}  ` +
      `over: ${s.over}/${s.n}`,
  );
}
console.log(`\n  ${over} of ${rows.length} captions carry an essay where a caption belongs.\n`);

/* One worked example, so the recommendation is legible rather than statistical. */
const worst = rows
  .filter((r) => r.platform === 'tiktok')
  .sort((a, b) => b.body.length - a.body.length)[0];
if (worst) {
  const split = splitForBudget(worst.body, budgetFor('tiktok'));
  console.log('  ── the longest TikTok caption, split ──\n');
  console.log(`  CAPTION (${split.caption.length} chars):`);
  console.log(`    ${split.caption.replace(/\n/g, '\n    ')}\n`);
  console.log(`  ${split.overflowHome.toUpperCase().replace('_', ' ')} (${split.overflow.length} chars):`);
  console.log(`    ${split.overflow.slice(0, 220).replace(/\n/g, '\n    ')}…\n`);
}

await pool.end();
