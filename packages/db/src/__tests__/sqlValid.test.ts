/**
 * Every SQL statement in the codebase, planned against the real schema.
 *
 * ## Why this exists
 *
 * `loadHookHistory` queried `post_metrics.stop_rate`, joined on
 * `post_metrics.content_item_id`, and **neither column has ever existed**. The
 * query could not plan, let alone run; a `.catch()` turned the failure into an
 * empty array; the comment above it explained the emptiness as "nothing has
 * published yet"; and the test asserted the empty array and passed. It was
 * wrong from the day it was written and nothing could see it.
 *
 * A unit test cannot catch that, because the broken path is never exercised
 * without a database. A schema test cannot catch it, because the schema is
 * fine. The only thing that can is asking Postgres, which is what this does:
 * `PREPARE` parses, resolves every identifier and plans the statement **without
 * executing it**, so a nonexistent column is a hard error and a `delete` is
 * still harmless.
 *
 * It is deliberately cheap and blunt. It proves the statements *can* run, not
 * that they return the right thing — the same distinction the capability model
 * draws between declared and verified.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIsolatedPool, databaseAvailable } from './testDb.js';
import { collectSqlStatements } from './sqlSources.js';

const available = await databaseAvailable();
const d = available ? describe : describe.skip;

let pool: pg.Pool;
let client: pg.PoolClient;

beforeAll(async () => {
  if (!available) return;
  pool = await createIsolatedPool('sqlvalid', 2);
  client = await pool.connect();
}, 180_000);

afterAll(async () => {
  if (!available) return;
  await client.query('deallocate all').catch(() => undefined);
  client.release();
  await pool.end();
});

/** Plan one statement. Returns the Postgres error, or null when it planned. */
async function plan(sql: string, name: string): Promise<{ code: string; message: string } | null> {
  try {
    await client.query(`prepare ${name} as ${sql}`);
    return null;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return { code: e.code ?? 'unknown', message: e.message ?? String(err) };
  }
}

d('every SQL statement plans against the real schema', () => {
  it('finds the statements to check at all', () => {
    /**
     * Counted before anything is asserted about them. This test's whole failure
     * mode is a regex that stops matching — an extractor returning nothing
     * would report a clean sweep of zero statements, which is exactly the
     * "examining nothing is not a pass" trap `DECISIONS.md` §76 was about.
     */
    const statements = collectSqlStatements();
    expect(statements.length).toBeGreaterThan(300);
    // And they come from across the system, not one lucky file.
    const roots = new Set(statements.map((s) => s.file.split('/').slice(0, 2).join('/')));
    expect(roots.size).toBeGreaterThanOrEqual(3);
  });

  it('plans all of them', async () => {
    const statements = collectSqlStatements();
    const broken: string[] = [];

    for (const [index, statement] of statements.entries()) {
      const failure = await plan(statement.sql, `_sqlcheck_${index}`);
      if (failure) {
        broken.push(
          `${statement.file}:${statement.line} [${failure.code}] ${failure.message}\n    ${statement.sql
            .replace(/\s+/g, ' ')
            .slice(0, 160)}`,
        );
      }
    }

    // Named, not counted. "Three statements are broken" sends you hunting; the
    // file, the line and Postgres's own reason do not.
    expect(broken.join('\n\n')).toBe('');
  }, 300_000);

  it('would have caught the defect it was written for', async () => {
    /**
     * The exact query `loadHookHistory` shipped with, verbatim. Both columns it
     * names are absent from `post_metrics`, which is keyed by `publication_id`.
     * If this ever plans cleanly, the check has stopped checking.
     */
    const historicalBug = `select h.hook_type, ci.format,
              avg(m.stop_rate) as stop_rate,
              count(*) as samples
         from hooks h
         join content_items ci on ci.product_id = h.product_id
         join post_metrics m on m.content_item_id = ci.id
        where h.product_id = $1 and m.stop_rate is not null
        group by 1, 2`;

    const failure = await plan(historicalBug, '_sqlcheck_historical');
    expect(failure).not.toBeNull();
    // 42703 is undefined_column. Pinned so a different error — a typo in this
    // fixture, say — cannot masquerade as the check working.
    expect(failure!.code).toBe('42703');
    expect(failure!.message).toMatch(/content_item_id|stop_rate/);
  });
});
