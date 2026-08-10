/**
 * Load a product brief from a source document on disk.
 *
 *   pnpm exec tsx scripts/load-brief.ts \
 *     --product recipefix \
 *     --from ../recipe-fix/RecipeFix_OVERVIEW.md
 *
 * The brief is the single most load-bearing input in the system — every idea,
 * every draft and every claim check is downstream of it — so it is loaded from
 * the source of truth rather than retyped, and re-running this is how it stays
 * current when that document changes.
 *
 * What it writes is *not* the whole overview. A thousand-line technical audit is
 * the wrong shape for a copywriter prompt: it would bury the four things that
 * decide a post's voice under fifty that do not. This extracts the sections that
 * change what gets written, and derives the content rules from the document's
 * own honesty about where the product is thin.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

interface Section {
  title: string;
  body: string;
}

/** Split a markdown document into its `## ` sections. */
export function sections(markdown: string): Section[] {
  const out: Section[] = [];
  const parts = markdown.split(/\n(?=## )/);
  for (const part of parts) {
    const match = /^##\s+(.+)$/m.exec(part);
    if (!match) continue;
    out.push({ title: match[1]!.trim(), body: part.slice(match.index + match[0].length).trim() });
  }
  return out;
}

/** The sections that change what gets written, in the order a brief wants them. */
const WANTED = [
  /executive summary/i,
  /product truth/i,
  /extraction for growth/i,
  /feature inventory/i,
];

export function buildBrief(overview: string, productName: string): string {
  const found = sections(overview);
  const pick = (pattern: RegExp): Section | undefined =>
    found.find((section) => pattern.test(section.title));

  const lines: string[] = [
    `# ${productName}`,
    '',
    '> Loaded from the product repository by `scripts/load-brief.ts`. Re-run it when the',
    '> source document changes rather than editing this by hand.',
    '',
  ];

  for (const pattern of WANTED) {
    const section = pick(pattern);
    if (!section) continue;
    lines.push(`## ${section.title}`, '', section.body, '');
  }

  return lines.join('\n').trim();
}

/**
 * A summary the queue card and the copywriter prompt can carry.
 *
 * Taken from the executive summary's own opening rather than generated: the
 * document already says the thing in one paragraph, and paraphrasing it would
 * only introduce drift.
 */
export function buildSummary(overview: string): string {
  const summary = sections(overview).find((s) => /executive summary/i.test(s.title));
  if (!summary) return '';
  const paragraphs = summary.body.split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim());
  return paragraphs.slice(0, 2).join(' ').slice(0, 1200);
}

/**
 * Forbidden claims, derived from the document rather than invented.
 *
 * The overview has a "thin" assessment that names exactly what the product
 * cannot honestly claim — most importantly that nutrition is a model's memory
 * rather than a database lookup. Those become hard blocks in the claim verifier,
 * which is a better place for them than a human's memory.
 */
export function forbiddenClaims(overview: string): string[] {
  const claims = new Set<string>();

  if (/nutrition estimation is a single prompt|not a lookup|do not market this as accurate nutrition/i.test(overview)) {
    claims.add('nutrition accuracy');
    claims.add('nutrition data sourced from a database');
  }
  if (/anti-overpromise|1:1|perfect substitution/i.test(overview)) {
    claims.add('perfect 1:1 substitution');
  }
  if (/allerg/i.test(overview)) {
    claims.add('medical or allergy-safety guarantee');
  }
  if (/UNVERIFIED — competitive claim/i.test(overview)) {
    // The document flags its own competitive claims as unverified. Repeating
    // them in marketing copy would launder a caveat into an assertion.
    claims.add('nobody else does this');
    claims.add('the only app that');
  }

  return [...claims];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const at = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const productId = at('--product') ?? 'recipefix';
  const from = at('--from');
  if (!from) {
    console.error('Pass --from <path to the overview document>.');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Run ./scripts/halyard first.');
    process.exit(1);
  }

  const resolved = path.resolve(from);
  let overview: string;
  try {
    overview = readFileSync(resolved, 'utf8');
  } catch {
    console.error(
      `Could not read ${resolved}.\n` +
        'Point --from at the overview document in the product repository.',
    );
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString, max: 2 });
  const { rows } = await pool.query<{ name: string; content_rules: Record<string, unknown> }>(
    'select name, content_rules from products where id = $1',
    [productId],
  );
  const product = rows[0];
  if (!product) {
    console.error(`No product '${productId}'. Add it on /products/new first.`);
    await pool.end();
    process.exit(1);
  }

  const brief = buildBrief(overview, product.name);
  const summary = buildSummary(overview);
  const derived = forbiddenClaims(overview);

  const existing = (product.content_rules?.forbidden_claims as string[] | undefined) ?? [];
  const merged = [...new Set([...existing, ...derived])];

  await pool.query(
    `update products
        set brief_markdown = $2,
            brief_summary = $3,
            brief_updated_at = now(),
            content_rules = jsonb_set(content_rules, '{forbidden_claims}', $4::jsonb)
      where id = $1`,
    [productId, brief, summary, JSON.stringify(merged)],
  );

  // The brief is the gate the first-run wizard checks; loading one satisfies it.
  await pool.query(
    `update onboarding_state set step_ingest_done = true where product_id = $1`,
    [productId],
  );

  await pool.query(
    `insert into audit_log (actor, action, entity_type, entity_id, detail)
     values ('human', 'brief_loaded', 'product', null, $1)`,
    [{ productId, source: resolved, characters: brief.length }],
  );

  console.log(`✓ ${productId}`);
  console.log(`  brief    ${brief.length.toLocaleString()} characters from ${path.basename(resolved)}`);
  console.log(`  summary  ${summary.length} characters`);
  console.log(`  claims   ${merged.length} forbidden: ${merged.join(', ')}`);

  await pool.end();
}

if (process.argv[1]?.endsWith('load-brief.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
