/**
 * What a freshly seeded database must contain.
 *
 * Migrations run before `seed.sql`, so a product-scoped
 * `insert ... select from products` inside a migration matches nothing on a
 * fresh database and fails silently. That has now happened three times — format
 * cadence in round 2 (DECISIONS §12), destinations in milestone 42, review
 * submissions in milestone 43 — and each time the symptom was an empty screen
 * rather than an error.
 *
 * The rule is: migrations backfill existing rows, `seed.sql` is the source of
 * truth for a new database. These tests are what make the next violation fail
 * here instead of in the UI.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySeed, createIsolatedPool, databaseAvailable } from './testDb.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('seed', 4);
  await applySeed(pool);
}, 90_000);

afterAll(async () => {
  if (pool) await pool.end();
});

d('seed.sql', () => {
  it('creates the product and its personal profile', async () => {
    const { rows } = await pool.query<{ id: string; kind: string }>(
      'select id, kind from products order by kind',
    );
    expect(rows.map((r) => r.kind).sort()).toContain('product');
  });

  it('sets destinations, which the link router cannot work without', async () => {
    const { rows } = await pool.query<{ destinations: Record<string, string> }>(
      `select destinations from products where id = 'recipefix'`,
    );
    expect(rows[0]?.destinations?.web).toBe('https://recipefix.app');
    // The share template is what lets a post about one recipe link to that recipe.
    expect(rows[0]?.destinations?.share_url_template).toContain('{shareToken}');
  });

  it('seeds the platform review submissions that /submissions lists', async () => {
    const { rows } = await pool.query<{ platform: string }>(
      `select platform from review_submissions where product_id = 'recipefix' order by platform`,
    );
    // Every platform that gates public posting behind a manual review.
    expect(rows.map((r) => r.platform)).toEqual([
      'instagram',
      'pinterest',
      'threads',
      'tiktok',
      'youtube',
    ]);
  });

  it('seeds a format cadence, which the scheduler reads', async () => {
    const { rows } = await pool.query<{ n: string }>(
      `select count(*) as n from format_cadence where product_id = 'recipefix'`,
    );
    expect(Number(rows[0]!.n)).toBeGreaterThan(0);
  });

  it('seeds a brand voice with mix targets, without which nothing generates', async () => {
    const { rows } = await pool.query<{ mix_targets: Record<string, number> }>(
      `select mix_targets from brand_voices where product_id = 'recipefix' and persona = 'brand'`,
    );
    expect(Object.keys(rows[0]?.mix_targets ?? {}).length).toBeGreaterThan(0);
  });

  it('seeds enough hooks per type that rotation has something to rotate', async () => {
    // Hook selection applies a 30-day cooldown per pattern. With one entry per
    // type, every type is on cooldown after a single use and selection falls
    // back to whatever is least stale rather than what fits the post.
    const { rows } = await pool.query<{ hook_type: string; n: string }>(
      `select hook_type, count(*) as n from hooks
        where product_id = 'recipefix' group by hook_type`,
    );
    expect(rows.length).toBe(8);
    for (const row of rows) {
      expect(Number(row.n), `only ${row.n} ${row.hook_type} hook(s)`).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives every seeded hook the columns the schema demands', async () => {
    const { rows } = await pool.query<{ n: string }>(
      `select count(*) as n from hooks
        where product_id = 'recipefix'
          and (hook_type is null or pattern_template is null or layer is null)`,
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('leaves no product-scoped table stranded by the migration ordering', async () => {
    // A migration that inserts per-product rows inserts zero on a fresh
    // database, because the product does not exist yet. Any table that is meant
    // to carry per-product configuration and is empty here is that bug.
    for (const table of ['review_submissions', 'format_cadence', 'brand_voices', 'slots']) {
      const { rows } = await pool.query<{ n: string }>(
        `select count(*) as n from ${table} where product_id = 'recipefix'`,
      );
      expect(
        Number(rows[0]!.n),
        `${table} has no rows for recipefix after seed.sql — a migration probably owns them`,
      ).toBeGreaterThan(0);
    }
  });
});
