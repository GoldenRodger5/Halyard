/**
 * §510. The paid kinds, pinned by name.
 *
 * `PAID_JOB_KINDS` types its members as plain strings, because `@halyard/core`
 * cannot import `JobKind` from `@halyard/db` without breaking
 * `@halyard/render`'s typecheck. A string list can drift from the real kinds
 * silently — a renamed job would simply stop being counted as paid, and the
 * budget would stop bounding the thing it exists to bound. So the names are
 * asserted against the migration that defines them.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAID_JOB_KINDS } from './budget.js';

const DB_INDEX = path.resolve(__dirname, '../../../db/src/index.ts');

/**
 * Every kind in `JOB_KINDS`, read from the db package's source.
 *
 * The source rather than an import, because `@halyard/core` cannot depend on
 * `@halyard/db` without breaking `@halyard/render`'s typecheck (§510) — and
 * the migration's own `jobs_kind_check` has been rewritten three times, so
 * scraping SQL finds whichever definition a regex happens to land on. The
 * TypeScript list is the one `PAID_JOB_KINDS` has to agree with, and it is
 * the one `handlerCoverage.test.ts` already holds to the database.
 */
function jobKinds(): string[] {
  const source = readFileSync(DB_INDEX, 'utf8');
  const block = /export const JOB_KINDS = \[([\s\S]*?)\] as const;/.exec(source);
  if (!block) return [];
  return [...block[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
}

describe('§510 the paid kinds are real kinds', () => {
  it('finds the job kinds, so this cannot pass by reading nothing', () => {
    const kinds = jobKinds();
    expect(kinds.length).toBeGreaterThan(20);
    expect(kinds).toContain('generate');
    expect(kinds).toContain('publish');
  });

  it('every kind the budget charges for is a kind that exists', () => {
    const kinds = new Set(jobKinds());
    const unknown = PAID_JOB_KINDS.filter((k) => !kinds.has(k));
    expect(unknown, 'paid kinds with no matching job kind').toEqual([]);
  });

  it('never charges for publishing or collection, whatever else changes', () => {
    for (const free of ['publish', 'collect_metrics', 'refresh_tokens', 'reconcile_schedule']) {
      expect(PAID_JOB_KINDS).not.toContain(free);
    }
  });
});
