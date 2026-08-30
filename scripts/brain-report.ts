/**
 * §325. Write out what the agents learned about a product, for a person to read.
 *
 *   DATABASE_URL=... pnpm exec tsx scripts/brain-report.ts kinolog > docs/brain-kinolog.md
 *
 * The Brain is a fact table and a fact table is not readable. An operator asking
 * "did they actually understand my product" should not have to write SQL to find
 * out, and the answer is the main evidence for whether any of this is
 * product-agnostic.
 *
 * Reports what was *not* learned as prominently as what was: an empty category
 * is the interesting part, and a report that lists only findings makes a brain
 * with a hole in it look complete.
 */
import pg from 'pg';

interface FactRow {
  category: string;
  key: string;
  value: string;
  detail: string | null;
  status: string;
  confidence: string;
  agent_id: string;
  evidence_ids: string[];
}

const ALL_CATEGORIES = [
  'identity',
  'mission',
  'users',
  'personas',
  'jobs_to_be_done',
  'workflows',
  'differentiators',
  'pricing',
  'monetization',
  'competitors',
  'brand_voice',
  'visual_identity',
  'claims',
  'ux_model',
  'conversion_funnel',
  'app_store_positioning',
];

async function main(): Promise<void> {
  const productId = process.argv[2];
  if (!productId) throw new Error('usage: brain-report.ts <productId>');

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: products } = await pool.query<{
    name: string;
    tagline: string | null;
    website_url: string | null;
    brand_tokens: Record<string, string> | null;
  }>('select name, tagline, website_url, brand_tokens from products where id = $1', [productId]);
  const product = products[0];
  if (!product) throw new Error(`no product ${productId}`);

  const { rows: facts } = await pool.query<FactRow>(
    `select category, key, value, detail, status, confidence, agent_id, evidence_ids
       from product_facts where product_id = $1 and superseded_by is null
      order by category, confidence desc, key`,
    [productId],
  );

  const { rows: evidence } = await pool.query<{ source_url: string; title: string; chars: number }>(
    `select source_url, coalesce(title,'') as title, length(body) as chars
       from product_evidence where product_id = $1 and superseded_by is null
      order by source_url`,
    [productId],
  );

  const out: string[] = [];
  out.push(`# What Halyard learned about ${product.name}`);
  out.push('');
  out.push(
    `Written by \`scripts/brain-report.ts\` from \`product_facts\`. Nothing here was ` +
      `typed by a person: every line is a fact an agent proposed and \`planFactWrites\` ` +
      `accepted, with the status that evidence supports.`,
  );
  out.push('');
  out.push(`- **Site:** ${product.website_url ?? '—'}`);
  out.push(`- **Tagline:** ${product.tagline ?? '—'}`);
  out.push(`- **Facts:** ${facts.length} across ${new Set(facts.map((f) => f.category)).size} categories`);
  out.push(`- **Evidence:** ${evidence.length} pages`);
  out.push('');

  if (product.brand_tokens && Object.keys(product.brand_tokens).length > 0) {
    out.push('## Brand, read from the product’s own stylesheet');
    out.push('');
    out.push('| Token | Value |');
    out.push('|---|---|');
    for (const [key, value] of Object.entries(product.brand_tokens)) {
      out.push(`| \`${key}\` | ${value} |`);
    }
    out.push('');
  }

  const byCategory = new Map<string, FactRow[]>();
  for (const fact of facts) {
    byCategory.set(fact.category, [...(byCategory.get(fact.category) ?? []), fact]);
  }

  for (const category of ALL_CATEGORIES) {
    const rows = byCategory.get(category);
    if (!rows || rows.length === 0) continue;
    out.push(`## ${category.replace(/_/g, ' ')}`);
    out.push('');
    for (const fact of rows) {
      const mark = fact.status === 'verified' ? '' : ` _(${fact.status})_`;
      out.push(`- **${fact.key}** — ${fact.value}${mark}`);
      if (fact.detail) out.push(`  - ${fact.detail}`);
    }
    out.push('');
  }

  const empty = ALL_CATEGORIES.filter((c) => !byCategory.has(c));
  if (empty.length > 0) {
    out.push('## Nothing learned about');
    out.push('');
    out.push(
      'Listed because an empty category is the interesting part. A report of only ' +
        'findings makes a brain with a hole in it look complete.',
    );
    out.push('');
    for (const category of empty) out.push(`- ${category.replace(/_/g, ' ')}`);
    out.push('');
  }

  out.push('## Evidence it read');
  out.push('');
  out.push('| Page | Characters |');
  out.push('|---|---|');
  for (const row of evidence) out.push(`| ${row.source_url} | ${row.chars.toLocaleString()} |`);
  out.push('');

  const unverified = facts.filter((f) => f.status !== 'verified');
  if (unverified.length > 0) {
    out.push('## Claims it refused to verify');
    out.push('');
    out.push(
      'A company saying something on its own site is evidence that it *says* it, not ' +
        'that it is true. These are recorded and marked, so nothing downstream can ' +
        'publish one as a fact.',
    );
    out.push('');
    for (const fact of unverified) out.push(`- ${fact.value} — \`${fact.status}\``);
    out.push('');
  }

  await pool.end();
  process.stdout.write(out.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
