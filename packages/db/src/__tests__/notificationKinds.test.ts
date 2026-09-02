/**
 * §507. The notification kinds the code writes, against the ones the column
 * allows.
 *
 * The third table with this shape, after `jobs_kind_check` (gotcha 1) and
 * `assets_kind_check` (§502): a list in SQL and a free string in TypeScript,
 * agreeing right up until the first insert. A notification is the surface an
 * operator is *told* things on, so one silently refused by a constraint is a
 * message nobody receives about a failure nobody sees.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(__dirname, '../../../..');
const MIGRATIONS = path.join(REPO, 'supabase/migrations');

function allowedKinds(): string[] {
  let allowed: string[] = [];
  for (const file of readdirSync(MIGRATIONS).sort()) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    for (const table of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?notifications\s*\(([\s\S]*?)\n\s*\);/gi,
    )) {
      const kind = /kind\s+text[^,]*?check\s*\(\s*kind\s+in\s*\(([^)]*)\)/i.exec(table[1]!);
      if (kind) allowed = [...kind[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
    }
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:public\.)?notifications[\s\S]{0,300}?notifications_kind_check[^(]*check\s*\(\s*kind\s+in\s*\(([^)]*)\)/gi,
    )) {
      allowed = [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
    }
  }
  return allowed;
}

/** Every kind literal handed to an `insert into notifications`. */
function kindsWritten(): Array<{ kind: string; file: string }> {
  const out: Array<{ kind: string; file: string }> = [];
  const scan = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') scan(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        const source = readFileSync(full, 'utf8');
        /*
         * The *first* literal after `values (`, which is the kind column.
         * A looser sweep of every literal in the tuple reported `comment` and
         * `social_account` — `entity_type` values three columns along — as
         * kinds Postgres would refuse, which is a confident wrong answer and
         * the same mistake §502's first version made one table over.
         */
        for (const call of source.matchAll(
          /insert into notifications[\s\S]{0,400}?values\s*\(\s*'([a-z_]+)'/gi,
        )) {
          out.push({ kind: call[1]!, file: path.relative(REPO, full) });
        }
      }
    }
  };
  scan(path.join(REPO, 'apps/worker/src'));
  scan(path.join(REPO, 'apps/web/src'));
  return out;
}

describe('§507 notification kinds', () => {
  it('the constraint is found, and is the notifications one', () => {
    const allowed = allowedKinds();
    expect(allowed.length).toBeGreaterThan(3);
    expect(allowed).toContain('digest');
    expect(allowed).toContain('generation_refused');
  });

  it('reads the kind column, not whatever literal comes to hand', () => {
    /* `entity_type` values live in the same tuple and are not kinds. */
    const written = kindsWritten().map((w) => w.kind);
    expect(written).not.toContain('comment');
    expect(written).not.toContain('social_account');
    expect(written).toContain('generation_refused');
  });

  it('every kind the code writes is one the column accepts', () => {
    const allowed = new Set(allowedKinds());
    const written = kindsWritten();
    expect(written.length, 'insert sites found').toBeGreaterThan(0);
    const refused = written.filter((w) => !allowed.has(w.kind));
    expect(
      refused.map((r) => `${r.kind} (${r.file})`),
      `kinds Postgres would refuse; allowed: ${[...allowed].join(', ')}`,
    ).toEqual([]);
  });
});
