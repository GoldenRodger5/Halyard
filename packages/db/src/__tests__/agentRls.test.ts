/**
 * The authorisation boundary on the P0 tables, against real Postgres.
 *
 * ## Why this file has to exist
 *
 * Migration 0025 originally shipped `for all to authenticated using (true) with
 * check (true)` on all four tables, and every test passed. It passed because a
 * plain Postgres has no `authenticated` role, so the guarded block that created
 * the policy never ran locally — the defect existed only on Supabase, where
 * nothing was testing it.
 *
 * A test that reads the migration text would not have caught it either: the
 * text was there, it was simply never executed. The only thing that catches
 * this is creating the roles and trying the queries.
 *
 * So this creates `anon` and `authenticated` for real, stubs `auth.uid()` the
 * way Supabase provides it, and asserts on what each role can actually do.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from './testDb.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;

/** The four tables P0 added, plus the one 0026 corrects. */
const P0_TABLES = ['agent_runs', 'capability_audit_state', 'auditor_runs', 'auditor_findings'];

/**
 * The two P1 added.
 *
 * Held to the same boundary, and for a sharper reason than the P0 tables: the
 * Product Brain holds an operator's understanding of their own product —
 * positioning, pricing, audience — which is commercially sensitive in a way an
 * execution log is not.
 */
const P1_TABLES = ['product_evidence', 'product_facts'];

const ALL_PROTECTED = [...P0_TABLES, ...P1_TABLES, 'feature_claims'];

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const OUTSIDER_ID = '22222222-2222-2222-2222-222222222222';

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('agentrls', 6);

  /**
   * The roles Supabase provides and a local Postgres does not.
   *
   * `nologin` because nothing connects as them directly — they are assumed with
   * `set role`, which is exactly how PostgREST reaches the database.
   */
  await pool.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
    end $$;
  `);

  /**
   * `auth.uid()`, as Supabase defines it: the subject of the request's JWT.
   *
   * `current_admin_id()` calls this inside an exception handler, so without it
   * `is_admin()` is unconditionally false and every policy denies everything —
   * which would make these tests pass for the wrong reason.
   */
  await pool.query(`
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid
      language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);

  await pool.query(
    `insert into admin_users (user_id, email) values ($1, 'operator@example.test')
     on conflict do nothing`,
    [ADMIN_ID],
  );

  // A row in each table, so "reads nothing" is a real denial rather than an
  // empty table indistinguishable from one.
  await pool.query(
    `insert into agent_runs (agent_id, agent_version, team, trigger, status)
     values ('copywriter','1.0','content','job','succeeded')`,
  );
  await pool.query(
    `insert into capability_audit_state (capability_id, kind, state, reason)
     values ('agent:copywriter','agent','implemented_partial','seeded for the RLS test')`,
  );
  const run = await pool.query<{ id: string }>(
    `insert into auditor_runs (triggered_by) values ('test') returning id`,
  );
  await pool.query(
    `insert into auditor_findings (auditor_run_id, rule, severity, subject, subject_kind, detail)
     values ($1,'test.rule','info','x','agent','seeded for the RLS test')`,
    [run.rows[0]!.id],
  );
  await pool.query(
    `insert into products (id, name, connector_type) values ('recipefix','RecipeFix','none')
     on conflict do nothing`,
  );
  await pool.query(
    `insert into feature_claims (product_id, name, summary, source, replay)
     values ('recipefix','Seeded','summary','crawl','{"steps":[]}'::jsonb)
     on conflict do nothing`,
  );
  const seededEvidence = await pool.query<{ id: string }>(
    `insert into product_evidence (product_id, kind, source_url, content_hash, body, collector)
     values ('recipefix','web_page','https://seed.test','seedhash','seeded for the RLS test','test')
     returning id`,
  );
  await pool.query(
    `insert into product_facts
       (product_id, category, key, value, evidence_ids, agent_id, agent_version)
     values ('recipefix','identity','seeded','Seeded for the RLS test', array[$1::uuid],
             'product-discovery','1.0')`,
    [seededEvidence.rows[0]!.id],
  );
}, 180_000);

afterAll(async () => {
  if (available) await pool.end();
});

/**
 * Run a query as a given role and identity, in a transaction that is always
 * rolled back.
 *
 * `set local role` and the JWT claim together are how PostgREST presents a
 * request, so this is the real path rather than an approximation of it.
 */
async function asRole<T = unknown>(
  role: 'anon' | 'authenticated',
  sub: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<{ ok: true; rows: T[] } | { ok: false; error: string }> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    if (sub) {
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
    }
    await client.query(`set local role to ${role}`);
    const result = await client.query(sql, params);
    await client.query('rollback');
    return { ok: true, rows: result.rows as T[] };
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    return { ok: false, error: (err as Error).message };
  } finally {
    client.release();
  }
}

d('the P0 tables are RLS-protected', () => {
  it('has RLS enabled and forced on every one', async () => {
    /**
     * Forced matters as much as enabled. Without FORCE the owning role bypasses
     * every policy — and that is the role a misconfigured connection string is
     * most likely to be using.
     */
    const { rows } = await pool.query<{ relname: string; rls: boolean; forced: boolean }>(
      `select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1)`,
      [ALL_PROTECTED],
    );

    expect(rows).toHaveLength(ALL_PROTECTED.length);
    for (const row of rows) {
      expect(row.rls, `${row.relname} RLS`).toBe(true);
      expect(row.forced, `${row.relname} FORCE`).toBe(true);
    }
  });

  it('gates every policy on is_admin() rather than on true', async () => {
    /**
     * The exact defect this file exists for. `using (true)` is not a policy, it
     * is the absence of one wearing a policy's clothes.
     */
    const { rows } = await pool.query<{ tablename: string; qual: string; withcheck: string }>(
      `select tablename, qual, with_check as withcheck
         from pg_policies where schemaname = 'public' and tablename = any($1)`,
      [ALL_PROTECTED],
    );

    expect(rows.length).toBeGreaterThanOrEqual(ALL_PROTECTED.length);
    for (const row of rows) {
      expect(row.qual, `${row.tablename} USING`).toContain('is_admin()');
      expect(row.qual, `${row.tablename} USING must not be true`).not.toBe('true');
      if (row.withcheck) {
        expect(row.withcheck, `${row.tablename} WITH CHECK`).toContain('is_admin()');
        expect(row.withcheck, `${row.tablename} WITH CHECK must not be true`).not.toBe('true');
      }
    }
  });

  it('leaves no policy scoped to authenticated with a permissive predicate', async () => {
    const { rows } = await pool.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies
        where schemaname = 'public'
          and 'authenticated' = any(roles)
          and (qual = 'true' or with_check = 'true')`,
    );
    expect(rows).toEqual([]);
  });
});

d('anon is denied', () => {
  it.each(ALL_PROTECTED)('cannot read %s', async (table) => {
    const result = await asRole('anon', null, `select count(*) from ${table}`);
    // Either a permission error, or zero rows through the policy. Both are a
    // denial; a leak is a non-zero count.
    if (result.ok) {
      expect(Number((result.rows[0] as { count: string }).count)).toBe(0);
    } else {
      expect(result.error).toMatch(/permission denied/i);
    }
  });

  it.each([...P0_TABLES, ...P1_TABLES])('cannot write to %s', async (table) => {
    const result = await asRole('anon', null, `delete from ${table}`);
    if (result.ok) {
      const { rows } = await pool.query<{ n: string }>(`select count(*) as n from ${table}`);
      // The delete was permitted by grants but matched nothing through RLS.
      expect(Number(rows[0]!.n)).toBeGreaterThan(0);
    } else {
      expect(result.error).toMatch(/permission denied/i);
    }
  });
});

d('a non-admin authenticated user is denied', () => {
  it.each(ALL_PROTECTED)('cannot read %s', async (table) => {
    /**
     * The case the original policy got wrong. This user has a valid session —
     * they are simply not in `admin_users`.
     */
    const result = await asRole('authenticated', OUTSIDER_ID, `select count(*) from ${table}`);
    if (result.ok) {
      expect(Number((result.rows[0] as { count: string }).count)).toBe(0);
    } else {
      expect(result.error).toMatch(/permission denied/i);
    }
  });

  it.each([...P0_TABLES, ...P1_TABLES])('cannot insert into %s', async (table) => {
    const sql: Record<string, string> = {
      product_evidence: `insert into product_evidence
                           (product_id, kind, content_hash, body, collector)
                         values ('recipefix','web_page','injected','injected','injected')`,
      product_facts: `insert into product_facts
                        (product_id, category, key, value, evidence_ids, agent_id, agent_version)
                      values ('recipefix','identity','injected','injected',
                              array[gen_random_uuid()], 'injected','1.0')`,
      agent_runs: `insert into agent_runs (agent_id, agent_version, team, trigger, status)
                   values ('x','1','content','job','succeeded')`,
      capability_audit_state: `insert into capability_audit_state (capability_id, kind, state, reason)
                               values ('agent:x','agent','planned','injected')`,
      auditor_runs: `insert into auditor_runs (triggered_by) values ('injected')`,
      auditor_findings: `insert into auditor_findings
                           (auditor_run_id, rule, severity, subject, subject_kind, detail)
                         values (gen_random_uuid(),'x','info','x','agent','injected')`,
    };

    const result = await asRole('authenticated', OUTSIDER_ID, sql[table]!);
    // Narrowed with an early assertion rather than `expect(...).toBe(false)`,
    // which does not narrow the union for the compiler.
    if (result.ok) {
      throw new Error(`${table} accepted an insert from a non-admin`);
    }
    expect(result.error).toMatch(/permission denied|violates row-level security|foreign key/i);
  });

  /** The column each table is probed through, so the vandalism is detectable. */
  const HACK_COLUMN: Record<string, string> = {
    agent_runs: 'agent_id',
    capability_audit_state: 'reason',
    auditor_runs: 'triggered_by',
    auditor_findings: 'detail',
    product_evidence: 'collector',
    product_facts: 'value',
  };

  it.each([...P0_TABLES, ...P1_TABLES])('cannot update or delete %s', async (table) => {
    const column = HACK_COLUMN[table]!;
    const update = await asRole(
      'authenticated',
      OUTSIDER_ID,
      `update ${table} set ${column} = 'hacked'`,
    );
    if (update.ok) {
      const { rows } = await pool.query<{ n: string }>(
        `select count(*) as n from ${table} where ${column} = 'hacked'`,
      );
      expect(Number(rows[0]!.n), `${table} was modified by a non-admin`).toBe(0);
    } else {
      expect(update.error).toMatch(/permission denied/i);
    }

    const del = await asRole('authenticated', OUTSIDER_ID, `delete from ${table}`);
    if (del.ok) {
      const { rows } = await pool.query<{ n: string }>(`select count(*) as n from ${table}`);
      expect(Number(rows[0]!.n), `${table} was emptied by a non-admin`).toBeGreaterThan(0);
    } else {
      expect(del.error).toMatch(/permission denied/i);
    }
  });
});

d('the admin gate discriminates', () => {
  /**
   * ## Why this does not test "an admin authenticated user reads the table"
   *
   * It cannot, and that is by design rather than a gap.
   *
   * `is_admin()` answers by selecting from `admin_users`, and `admin_users`
   * itself carries `admin_all using (is_admin())` from migration 0010. So when
   * the `authenticated` role asks, the policy on `admin_users` returns nothing,
   * `is_admin()` is false, and the boundary denies — for every identity,
   * including a real operator. The model fails closed.
   *
   * That is correct here because **Halyard's operator does not use the
   * `authenticated` role.** `apps/web/src/lib/db.ts` connects with a direct
   * Postgres pool; `anon` and `authenticated` exist only as the PostgREST
   * surface a leaked key would reach, and both are shut at the grant layer and
   * the policy layer.
   *
   * Making admin-over-PostgREST work would mean making `is_admin()` SECURITY
   * DEFINER — changing the authorisation primitive that thirty other tables
   * depend on. This slice does not touch it.
   *
   * What is testable, and what actually matters, is that the gate
   * *discriminates*: true for an operator identity, false for anyone else. A
   * policy of `using (false)` would deny just as thoroughly and be just as
   * broken, so proving the predicate is not constant is the real assertion.
   */
  it('returns true for an identity in admin_users', async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ADMIN_ID]);
      const { rows } = await client.query<{ admin: boolean }>('select public.is_admin() as admin');
      expect(rows[0]!.admin).toBe(true);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('returns false for an identity that is not', async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [OUTSIDER_ID]);
      const { rows } = await client.query<{ admin: boolean }>('select public.is_admin() as admin');
      expect(rows[0]!.admin).toBe(false);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('returns false when there is no identity at all', async () => {
    const { rows } = await pool.query<{ admin: boolean }>('select public.is_admin() as admin');
    expect(rows[0]!.admin).toBe(false);
  });

  it('is the predicate the P0 policies actually use', async () => {
    // Ties the two halves together: the gate discriminates, and it is this gate
    // the tables are behind.
    const { rows } = await pool.query<{ tablename: string; qual: string }>(
      `select tablename, qual from pg_policies
        where schemaname = 'public' and tablename = any($1) and policyname = 'admin_all'`,
      [ALL_PROTECTED],
    );
    expect(rows).toHaveLength(ALL_PROTECTED.length);
    for (const row of rows) expect(row.qual).toBe('is_admin()');
  });
});

d('the grant layer is locked down as well', () => {
  it('gives anon and authenticated no privileges on the P0 tables', async () => {
    /**
     * Defence in depth, and the production posture: Halyard reaches its data
     * over a direct server-side connection, not PostgREST, so neither role
     * needs any privilege at all.
     */
    const { rows } = await pool.query<{ grantee: string; table_name: string; privilege_type: string }>(
      `select grantee, table_name, privilege_type
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = any($1)
          and grantee in ('anon', 'authenticated')`,
      [ALL_PROTECTED],
    );
    expect(rows).toEqual([]);
  });
});

d('the worker is unaffected', () => {
  it('reads and writes every P0 table through the pooled connection', async () => {
    /**
     * The worker connects as a role with `rolbypassrls`, which bypasses RLS
     * regardless of FORCE. Verified rather than assumed, because a policy that
     * locked out the worker would break every job while looking like a
     * successful security change.
     */
    for (const table of ALL_PROTECTED) {
      const { rows } = await pool.query<{ n: string }>(`select count(*) as n from ${table}`);
      expect(Number(rows[0]!.n), `${table} unreadable by the worker role`).toBeGreaterThan(0);
    }

    const inserted = await pool.query<{ run_id: string }>(
      `insert into agent_runs (agent_id, agent_version, team, trigger, status)
       values ('worker-check','1.0','system','test','succeeded') returning run_id`,
    );
    expect(inserted.rows[0]!.run_id).toBeTruthy();

    await pool.query('delete from agent_runs where agent_id = $1', ['worker-check']);
  });

  it('confirms the connecting role actually bypasses RLS', async () => {
    // If this is ever false, FORCE would apply to the worker and every job
    // would silently see an empty database.
    const { rows } = await pool.query<{ bypass: boolean; su: boolean }>(
      'select rolbypassrls as bypass, rolsuper as su from pg_roles where rolname = current_user',
    );
    expect(rows[0]!.bypass || rows[0]!.su).toBe(true);
  });
});
