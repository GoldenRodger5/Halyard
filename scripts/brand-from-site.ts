/**
 * §323. Read a product's palette out of its own stylesheet.
 *
 *   pnpm exec tsx scripts/brand-from-site.ts https://kinolog.app [--write <productId>]
 *
 * Prints what it found and where each token came from. `--write` stores it on
 * the product, which is the only thing standing between a new product and every
 * one of its videos coming out in the previous product's colours.
 */
import pg from 'pg';
import { extractBrandFromSite } from '../packages/core/src/brain/brandFromSite.js';

async function main(): Promise<void> {
  const site = process.argv[2];
  if (!site) throw new Error('usage: brand-from-site.ts <url> [--write <productId>]');
  const writeAt = process.argv.indexOf('--write');
  const productId = writeAt === -1 ? null : process.argv[writeAt + 1];

  const html = await (await fetch(site, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();

  /* Every stylesheet the page links, concatenated: tokens may live in any. */
  const hrefs = [...html.matchAll(/href="([^"]+\.css[^"]*)"/gi)].map((m) => m[1]!);
  let css = '';
  for (const href of hrefs.slice(0, 5)) {
    const url = href.startsWith('http') ? href : new URL(href, site).toString();
    css += await (await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
  }

  const brand = extractBrandFromSite({ css, html });
  console.log(JSON.stringify(brand, null, 2));

  if (productId) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('update products set brand_tokens = $2, updated_at = now() where id = $1', [
      productId,
      JSON.stringify(brand.tokens),
    ]);
    await pool.end();
    console.log(`written to products.brand_tokens for ${productId}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
