/**
 * Routing safety. Milestone 40.
 *
 * "Cross-product publish blocked structurally." Structurally means the database
 * refuses the row, not that a code path checks first — so these tests write SQL
 * directly, with no application code between them and the constraint.
 *
 * The invariant is a routing scope computed identically on both sides:
 *   brand   → the product id
 *   founder → the literal '*founder*'
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from './testDb.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
const ids = {
  alphaBrand: '',
  betaBrand: '',
  founder: '',
};

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('routing', 6);

  await pool.query(`insert into products (id, name, kind) values
    ('alpha', 'Alpha', 'product'),
    ('beta', 'Beta', 'product'),
    ('isaac', 'Isaac', 'personal')`);

  const rows = await pool.query<{ id: string; product_id: string; persona: string }>(
    `insert into social_accounts (product_id, platform, persona, handle, capability_state)
     values ('alpha','x','brand','@alpha','live'),
            ('beta','x','brand','@beta','live'),
            ('isaac','x','founder','@isaac','live')
     returning id, product_id, persona`,
  );

  ids.alphaBrand = rows.rows.find((r) => r.product_id === 'alpha')!.id;
  ids.betaBrand = rows.rows.find((r) => r.product_id === 'beta')!.id;
  ids.founder = rows.rows.find((r) => r.persona === 'founder')!.id;
}, 90_000);

afterAll(async () => {
  if (pool) await pool.end();
});

function insertItem(productId: string, persona: string, accountId: string) {
  return pool.query(
    `insert into content_items (product_id, account_id, platform, persona, format, category, body, status)
     values ($1, $2, 'x', $3, 'text', 'education', 'Vinegar firms the crumb.', 'draft')
     returning id`,
    [productId, accountId, persona],
  );
}

d('routing scope', () => {
  it('computes the scope from the product for brand accounts and a shared literal for the founder', async () => {
    const { rows } = await pool.query<{ persona: string; routing_scope: string }>(
      'select persona, routing_scope from social_accounts order by persona',
    );
    expect(rows.find((r) => r.persona === 'founder')!.routing_scope).toBe('*founder*');
    expect(rows.filter((r) => r.persona === 'brand').map((r) => r.routing_scope).sort()).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('rejects a product id that could collide with the founder literal', async () => {
    await expect(
      pool.query(`insert into products (id, name) values ('*founder*', 'Impostor')`),
    ).rejects.toThrow(/products_id_slug_check|check constraint/i);
  });
});

d('cross-product publish', () => {
  it('allows a brand item on its own product account', async () => {
    const result = await insertItem('alpha', 'brand', ids.alphaBrand);
    expect(result.rows).toHaveLength(1);
  });

  it('refuses a brand item pointed at another product account', async () => {
    await expect(insertItem('alpha', 'brand', ids.betaBrand)).rejects.toThrow(
      /content_items_account_routing_fk|foreign key/i,
    );
  });

  it('refuses a brand item pointed at the founder account', async () => {
    await expect(insertItem('alpha', 'brand', ids.founder)).rejects.toThrow(
      /content_items_account_routing_fk|foreign key/i,
    );
  });

  it('refuses a founder item pointed at a brand account', async () => {
    await expect(insertItem('alpha', 'founder', ids.alphaBrand)).rejects.toThrow(
      /content_items_account_routing_fk|foreign key/i,
    );
  });

  it('allows a founder item on any product, because the founder account is shared', async () => {
    await expect(insertItem('alpha', 'founder', ids.founder)).resolves.toBeTruthy();
    await expect(insertItem('beta', 'founder', ids.founder)).resolves.toBeTruthy();
  });

  it('refuses to re-point an existing item at another product account', async () => {
    const created = await insertItem('alpha', 'brand', ids.alphaBrand);
    await expect(
      pool.query('update content_items set account_id = $2 where id = $1', [
        created.rows[0]!.id,
        ids.betaBrand,
      ]),
    ).rejects.toThrow(/content_items_account_routing_fk|foreign key/i);
  });

  it('refuses to move an item to another product while it points at the first product account', async () => {
    const created = await insertItem('alpha', 'brand', ids.alphaBrand);
    await expect(
      pool.query('update content_items set product_id = $2 where id = $1', [
        created.rows[0]!.id,
        'beta',
      ]),
    ).rejects.toThrow(/content_items_account_routing_fk|foreign key/i);
  });
});

d('founder account placement', () => {
  it('refuses a founder account on a product rather than the personal profile', async () => {
    await expect(
      pool.query(
        `insert into social_accounts (product_id, platform, persona, handle)
         values ('alpha', 'bluesky', 'founder', '@isaac')`,
      ),
    ).rejects.toThrow(/social_accounts_founder_is_personal_fk|foreign key/i);
  });

  it('allows a brand account on a personal profile, which is only unusual rather than wrong', async () => {
    await expect(
      pool.query(
        `insert into social_accounts (product_id, platform, persona, handle)
         values ('isaac', 'bluesky', 'brand', '@isaacs-newsletter')`,
      ),
    ).resolves.toBeTruthy();
  });
});

d('platform coverage', () => {
  it('accepts every platform that has an adapter, including Bluesky', async () => {
    for (const platform of ['x', 'instagram', 'tiktok', 'pinterest', 'youtube', 'threads', 'bluesky']) {
      await expect(
        pool.query(
          `insert into social_accounts (product_id, platform, persona, handle)
           values ('beta', $1, 'brand', $2)
           on conflict (product_id, platform, persona) do nothing`,
          [platform, `@beta-${platform}`],
        ),
      ).resolves.toBeTruthy();
    }
  });
});

d('identity confirmation', () => {
  it('holds a pending connection until it is confirmed, and expires it', async () => {
    const pending = await pool.query<{ id: string; expires_at: Date }>(
      `insert into pending_connections
         (product_id, platform, persona, platform_user_id, handle, access_token_enc)
       values ('alpha','x','brand','999','@someone-else', '\\x00'::bytea)
       returning id, expires_at`,
    );
    expect(pending.rows[0]!.expires_at.getTime()).toBeGreaterThan(Date.now());

    // Nothing has been added to the accounts table by staging a connection.
    const { rows } = await pool.query(
      `select id from social_accounts where platform_user_id = '999'`,
    );
    expect(rows).toHaveLength(0);
  });

  it('refuses to connect one platform identity twice unless it is acknowledged', async () => {
    // The same X account connected as two different products' brand accounts.
    await pool.query(`update social_accounts set platform_user_id = 'shared-1' where id = $1`, [
      ids.alphaBrand,
    ]);
    await expect(
      pool.query(`update social_accounts set platform_user_id = 'shared-1' where id = $1`, [
        ids.betaBrand,
      ]),
    ).rejects.toThrow(/social_accounts_identity_uniq|duplicate key/i);

    // Unless the operator says one identity really does serve both.
    await expect(
      pool.query(
        `update social_accounts set platform_user_id = 'shared-1', duplicate_identity_ack = true
          where id = $1`,
        [ids.betaBrand],
      ),
    ).resolves.toBeTruthy();
  });
});
