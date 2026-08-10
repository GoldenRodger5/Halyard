/**
 * E2E fixtures. Milestone 29.
 *
 * Each spec owns its data: it inserts what it needs, asserts, and cleans up.
 * Sharing seeded rows between specs makes failures depend on execution order,
 * which is how an E2E suite becomes something people disable.
 */
import { test as base } from '@playwright/test';
import pg from 'pg';

const CONNECTION =
  process.env.DATABASE_URL ?? `postgres://${process.env.USER}@localhost:5432/halyard`;

let pool: pg.Pool | null = null;

export function db(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: CONNECTION, max: 4 });
  return pool;
}

export interface SeededItem {
  id: string;
  accountId: string;
}

/** A content item in a known state, tagged so cleanup can find it. */
export async function seedItem(
  overrides: {
    status?: string;
    body?: string;
    platform?: string;
    scheduledAt?: Date | null;
    qc?: unknown;
  } = {},
): Promise<SeededItem> {
  const platform = overrides.platform ?? 'x';

  const account = await db().query<{ id: string }>(
    `select id from social_accounts where platform = $1 and persona = 'brand' limit 1`,
    [platform],
  );
  const accountId = account.rows[0]!.id;

  const qc = overrides.qc ?? {
    passed: true,
    gates: [
      { gate: 'copy', status: 'passed', summary: 'passed (0 flags)' },
      { gate: 'claims', status: 'passed', summary: '1/1 verified against artifact' },
      { gate: 'visual', status: 'skipped', summary: 'no media' },
      { gate: 'audio', status: 'skipped', summary: 'no voiceover' },
    ],
  };

  const { rows } = await db().query<{ id: string }>(
    `insert into content_items (product_id, account_id, platform, persona, format, category,
                                body, status, scheduled_at, qc_results, generation_meta)
     values ('recipefix', $1, $2, 'brand', 'text', 'education', $3, $4, $5, $6,
             '{"e2e":true}'::jsonb)
     returning id`,
    [
      accountId,
      platform,
      overrides.body ?? `E2E draft ${Date.now()}. Vinegar firms a gluten-free crumb.`,
      overrides.status ?? 'pending_approval',
      overrides.scheduledAt === undefined ? new Date(Date.now() + 3_600_000) : overrides.scheduledAt,
      JSON.stringify(qc),
    ],
  );

  return { id: rows[0]!.id, accountId };
}

/** Everything this suite created, identified by the marker in generation_meta. */
export async function cleanup(): Promise<void> {
  await db().query(`delete from content_items where generation_meta ->> 'e2e' = 'true'`);
  await db().query(`delete from takes where raw_input like 'E2E %'`);
}

export const test = base.extend<{ seeded: void }>({
  seeded: [
    async ({}, use) => {
      await use();
      await cleanup();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
