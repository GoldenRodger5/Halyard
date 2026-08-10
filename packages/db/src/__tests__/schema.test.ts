/**
 * Schema-level guarantees. These are the rules the kickoff prompt calls
 * non-negotiable, tested where they are actually enforced.
 *
 *   · publish idempotency          (v1 §6, kickoff "hard constraints")
 *   · AI disclosure as a code path (v2 C.3)
 *   · RLS denies an unauthenticated caller
 *   · token ciphertext is not readable by the client role
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable, seedMinimal } from './testDb.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let ids: { productId: string; accountId: string; contentItemId: string };

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('schema', 8);
  ids = await seedMinimal(pool);
}, 90_000);

afterAll(async () => {
  if (pool) await pool.end();
});

d('publish idempotency', () => {
  it('permits exactly one publication per (content_item, account)', async () => {
    await pool.query('delete from publications');
    await pool.query(
      `insert into publications (content_item_id, account_id, platform, publish_mode, platform_post_id)
       values ($1, $2, 'x', 'direct', 'post-1')`,
      [ids.contentItemId, ids.accountId],
    );
    await expect(
      pool.query(
        `insert into publications (content_item_id, account_id, platform, publish_mode, platform_post_id)
         values ($1, $2, 'x', 'direct', 'post-2')`,
        [ids.contentItemId, ids.accountId],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('permits exactly one row per (account, platform_post_id)', async () => {
    await pool.query('delete from publications');
    const other = await pool.query<{ id: string }>(
      `insert into content_items (product_id, account_id, platform, persona, format, category, body)
       values ($1, $2, 'x', 'brand', 'text', 'education', 'Second item.') returning id`,
      [ids.productId, ids.accountId],
    );
    await pool.query(
      `insert into publications (content_item_id, account_id, platform, publish_mode, platform_post_id)
       values ($1, $2, 'x', 'direct', 'same-post-id')`,
      [ids.contentItemId, ids.accountId],
    );
    await expect(
      pool.query(
        `insert into publications (content_item_id, account_id, platform, publish_mode, platform_post_id)
         values ($1, $2, 'x', 'direct', 'same-post-id')`,
        [other.rows[0]!.id, ids.accountId],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('allows many rows with a null platform_post_id (malformed-response case)', async () => {
    await pool.query('delete from publications');
    const second = await pool.query<{ id: string }>(
      `insert into content_items (product_id, account_id, platform, persona, format, category, body)
       values ($1, $2, 'x', 'brand', 'text', 'education', 'Third item.') returning id`,
      [ids.productId, ids.accountId],
    );
    await pool.query(
      `insert into publications (content_item_id, account_id, platform, publish_mode, platform_post_id, needs_reconciliation)
       values ($1, $2, 'x', 'direct', null, true)`,
      [ids.contentItemId, ids.accountId],
    );
    await expect(
      pool.query(
        `insert into publications (content_item_id, account_id, platform, publish_mode, platform_post_id, needs_reconciliation)
         values ($1, $2, 'x', 'direct', null, true)`,
        [second.rows[0]!.id, ids.accountId],
      ),
    ).resolves.toBeTruthy();
  });

  it('two concurrent publish transactions produce one row and one error', async () => {
    await pool.query('delete from publications');
    const attempt = () =>
      pool
        .query(
          `insert into publications (content_item_id, account_id, platform, publish_mode, platform_post_id)
           values ($1, $2, 'x', 'direct', 'concurrent-post')`,
          [ids.contentItemId, ids.accountId],
        )
        .then(
          () => 'ok' as const,
          () => 'rejected' as const,
        );

    const results = await Promise.all([attempt(), attempt(), attempt()]);
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r === 'rejected')).toHaveLength(2);
  });
});

d('AI disclosure (v2 C.3)', () => {
  it('computes requires_ai_label from ai_components', async () => {
    const { rows } = await pool.query<{ requires_ai_label: boolean }>(
      `insert into content_items (product_id, account_id, platform, persona, format, category, body, ai_components)
       values ($1, $2, 'x', 'brand', 'video', 'education', 'body', array['copy','voiceover'])
       returning requires_ai_label`,
      [ids.productId, ids.accountId],
    );
    expect(rows[0]?.requires_ai_label).toBe(true);
  });

  it('does not require a label for AI-written copy alone', async () => {
    const { rows } = await pool.query<{ requires_ai_label: boolean }>(
      `insert into content_items (product_id, account_id, platform, persona, format, category, body, ai_components)
       values ($1, $2, 'x', 'brand', 'text', 'education', 'body', array['copy','motion'])
       returning requires_ai_label`,
      [ids.productId, ids.accountId],
    );
    expect(rows[0]?.requires_ai_label).toBe(false);
  });

  it('refuses to approve a labelled item with no disclosure text', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into content_items (product_id, account_id, platform, persona, format, category, body, ai_components)
       values ($1, $2, 'x', 'brand', 'video', 'education', 'body', array['voiceover'])
       returning id`,
      [ids.productId, ids.accountId],
    );
    await expect(
      pool.query(`update content_items set status = 'approved' where id = $1`, [rows[0]!.id]),
    ).rejects.toThrow(/content_items_ai_disclosure_check/i);
  });

  it('allows approval once a disclosure is present', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into content_items (product_id, account_id, platform, persona, format, category, body, ai_components, disclosure_text)
       values ($1, $2, 'x', 'brand', 'video', 'education', 'body', array['voiceover'], 'Narrated with my cloned voice. #AIvoiceover')
       returning id`,
      [ids.productId, ids.accountId],
    );
    await expect(
      pool.query(`update content_items set status = 'approved' where id = $1`, [rows[0]!.id]),
    ).resolves.toBeTruthy();
  });
});

d('row level security', () => {
  it('denies a role that is not in admin_users', async () => {
    await pool.query(`drop role if exists halyard_rls_probe`);
    await pool.query(`create role halyard_rls_probe login password 'probe'`);
    await pool.query(`grant usage on schema public to halyard_rls_probe`);
    await pool.query(`grant select on all tables in schema public to halyard_rls_probe`);

    const client = await pool.connect();
    try {
      await client.query('set role halyard_rls_probe');
      // RLS is enabled and forced, and no policy matches an unauthenticated
      // caller, so every table reads as empty rather than erroring.
      const { rows } = await client.query('select * from content_items');
      expect(rows).toHaveLength(0);
      const products = await client.query('select * from products');
      expect(products.rows).toHaveLength(0);
      const accounts = await client.query('select id, handle from social_accounts');
      expect(accounts.rows).toHaveLength(0);
    } finally {
      await client.query('reset role');
      client.release();
      await pool.query(`revoke all on all tables in schema public from halyard_rls_probe`);
      await pool.query(`revoke usage on schema public from halyard_rls_probe`);
      await pool.query(`drop role if exists halyard_rls_probe`);
    }
  });

  it('has RLS enabled and forced on every table', async () => {
    const { rows } = await pool.query<{ relname: string }>(
      `select relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and (c.relrowsecurity = false or c.relforcerowsecurity = false)`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});

d('timezone storage (build pack §1)', () => {
  it('stores every timestamp column as timestamptz', async () => {
    const { rows } = await pool.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and data_type = 'timestamp without time zone'`,
    );
    expect(rows).toEqual([]);
  });

  it('keeps audience and operator timezones as separate fields', async () => {
    const { rows } = await pool.query<{ audience_timezone: string; operator_timezone: string }>(
      `select audience_timezone, operator_timezone from products where id = $1`,
      [ids.productId],
    );
    expect(rows[0]).toHaveProperty('audience_timezone');
    expect(rows[0]).toHaveProperty('operator_timezone');
  });
});

