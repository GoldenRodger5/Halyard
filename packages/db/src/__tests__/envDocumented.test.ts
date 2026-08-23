/**
 * Every environment variable the code reads must be documented.
 *
 * Twenty were not, including `META_WEBHOOK_VERIFY_TOKEN` — which is a step in
 * the activation runbook, refuses the Meta handshake when unset, and appeared
 * nowhere in `.env.example`. A fresh clone or a new deployment had no way to
 * learn it existed except by reading the route that reads it.
 *
 * The failure is quiet in exactly the way this codebase keeps finding: nothing
 * breaks at build time, nothing breaks in development where the variable is
 * irrelevant, and the gap only shows up as a feature that silently does
 * nothing in production.
 *
 * Commented-out entries in `.env.example` count as documented: `# FOO=` is a
 * deliberate statement that FOO exists and is optional.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');

/** Set by the platform or the toolchain, never by an operator. */
const NOT_OURS = new Set([
  'NODE_ENV',
  'NEXT_RUNTIME',
  'CI',
  'TZ',
  'PATH',
  'HOME',
]);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (['node_modules', '.next', 'dist', '.turbo'].includes(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

function documented(): Set<string> {
  const text = readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  const names = new Set<string>();
  // `FOO=` and `# FOO=` both count: a commented entry documents an optional
  // variable, which is the whole point of listing it.
  for (const m of text.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)) names.add(m[1]!);
  return names;
}

describe('.env.example documents what the code reads', () => {
  const known = documented();

  it('parses the example file at all', () => {
    // Without this, an unreadable or renamed file would make every check below
    // pass against an empty set.
    expect(known.size).toBeGreaterThan(15);
    expect(known).toContain('DATABASE_URL');
  });

  it('names every environment variable read by shipped code', () => {
    const undocumented = new Map<string, string>();

    for (const base of ['apps/web/src', 'apps/worker/src', 'packages', 'scripts']) {
      for (const file of sourceFiles(path.join(ROOT, base))) {
        const src = readFileSync(file, 'utf8');
        for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
          const name = m[1]!;
          if (NOT_OURS.has(name) || name.startsWith('VERCEL_') || name.startsWith('npm_')) continue;
          if (known.has(name)) continue;
          if (!undocumented.has(name)) undocumented.set(name, path.relative(ROOT, file));
        }
      }
    }

    expect(
      [...undocumented].map(([name, file]) => `${name} (${file})`).sort(),
      'read by code and absent from .env.example',
    ).toEqual([]);
  });
});
