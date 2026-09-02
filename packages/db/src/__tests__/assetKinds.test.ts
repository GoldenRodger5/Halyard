/**
 * §502. The asset kinds the code writes, against the ones the column allows.
 *
 * `assets_kind_check` is a list of permitted values in SQL, and the kind a
 * caller passes to `uploadAsset` is a free string in TypeScript — the same
 * two-lists-one-truth shape as `JOB_KINDS` and `jobs_kind_check` (gotcha 1),
 * with the same failure mode: it typechecks, it lints, every test passes, and
 * the first insert is refused. The first live stock-footage run lost eight
 * downloaded clips to exactly this, writing `footage` where the schema has
 * always said `broll`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(__dirname, '../../../..');
const MIGRATIONS = path.join(REPO, 'supabase/migrations');

/**
 * The kinds the newest definition of the constraint allows.
 *
 * Anchored to the `assets` table specifically. A bare search for
 * `kind text check (kind in (...))` finds whichever table defined one last —
 * the first version of this test read `references_swipe`'s kinds and reported
 * that Postgres would refuse `audio`, which is nonsense and would have been
 * believed.
 */
function allowedKinds(): string[] {
  const files = readdirSync(MIGRATIONS).sort();
  let allowed: string[] = [];
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');

    /* The column, inside `create table … assets ( … );`. */
    for (const table of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?assets\s*\(([\s\S]*?)\n\s*\);/gi)) {
      const kind = /kind\s+text[^,]*?check\s*\(\s*kind\s+in\s*\(([^)]*)\)/i.exec(table[1]!);
      if (kind) allowed = [...kind[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
    }

    /* And any later `alter table assets` that replaces the named check. */
    for (const m of sql.matchAll(/alter\s+table\s+(?:public\.)?assets[\s\S]{0,200}?assets_kind_check[^(]*check\s*\(\s*kind\s+in\s*\(([^)]*)\)/gi)) {
      allowed = [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
    }
  }
  return allowed;
}

/** Every `kind:` handed to `uploadAsset`, read from the call sites. */
function kindsWritten(): Array<{ kind: string; file: string }> {
  const out: Array<{ kind: string; file: string }> = [];
  const scan = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') scan(full);
      } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
        const source = readFileSync(full, 'utf8');
        /* Only where an upload is being built: `uploadAsset(` … `kind: '…'`. */
        for (const call of source.matchAll(/uploadAsset\([\s\S]{0,900}?\}\)/g)) {
          const kind = /\bkind:\s*'([a-z_]+)'/.exec(call[0]);
          if (kind) out.push({ kind: kind[1]!, file: path.relative(REPO, full) });
        }
      }
    }
  };
  scan(path.join(REPO, 'apps/worker/src'));
  return out;
}

describe('§502 asset kinds', () => {
  it('the constraint is found, so this test cannot pass by reading nothing', () => {
    const allowed = allowedKinds();
    expect(allowed.length).toBeGreaterThan(3);
    /* Read from the right table: these are asset kinds, not swipe-file verbs. */
    expect(allowed).toContain('generated');
    expect(allowed).toContain('broll');
  });

  it('every kind the worker writes is one the column accepts', () => {
    const allowed = new Set(allowedKinds());
    const written = kindsWritten();
    expect(written.length, 'uploadAsset call sites found').toBeGreaterThan(0);

    const refused = written.filter((w) => !allowed.has(w.kind));
    expect(
      refused.map((r) => `${r.kind} (${r.file})`),
      `kinds Postgres would refuse; allowed: ${[...allowed].join(', ')}`,
    ).toEqual([]);
  });
});
