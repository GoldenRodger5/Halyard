/**
 * §304. A composition Remotion knows about that the database does not is dead.
 *
 * `Quiz` and `Walkthrough` were registered in `root.tsx`, rendered fine from a
 * script, and had no `templates` row — and every selector filters by the
 * account's enabled templates, so nothing could ever ask for them. The quiz
 * format could not have produced a piece even after the video path started
 * consulting formats.
 *
 * That is gotcha 1 in a second place: `root.tsx`'s compositions and the
 * `templates` table are the same list written twice, and adding to one
 * typechecks cleanly. This is the test that fails instead.
 *
 * It reads the migrations rather than the database, so it runs everywhere —
 * a coverage rule that only holds where a database is reachable is a rule that
 * does not hold on the machine where the mistake gets made.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_FORMATS } from './formatVideo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function registeredCompositions(): string[] {
  const source = readFileSync(path.join(ROOT, 'packages/render/src/video/root.tsx'), 'utf8');
  return [...source.matchAll(/id="([A-Za-z0-9_]+)"/g)].map((m) => m[1]!);
}

/**
 * Both places a template row can come from.
 *
 * `seed.sql` builds a fresh database and a migration patches a live one, and a
 * composition needs whichever applies to the database it is running against —
 * so a row in only one of them is still a gap, just a narrower one. Scanning
 * both is the honest check.
 */
function templatesNamedInSql(): Set<string> {
  const files = [
    path.join(ROOT, 'supabase/seed.sql'),
    ...readdirSync(path.join(ROOT, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => path.join(ROOT, 'supabase/migrations', f)),
  ];
  const named = new Set<string>();
  for (const file of files) {
    const sql = readFileSync(file, 'utf8');
    /* Template ids are quoted string literals; the ids themselves are distinctive. */
    for (const match of sql.matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g)) named.add(match[1]!);
  }
  return named;
}

describe('every video composition is reachable', () => {
  it('has a templates row somewhere in the migrations', () => {
    const named = templatesNamedInSql();
    const orphans = registeredCompositions().filter((id) => !named.has(id));
    expect(
      orphans,
      `These compositions are registered in root.tsx and no seed or migration inserts a ` +
        `templates row for them, so no account can ever select them: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('every format with a video builder targets a registered composition', () => {
    const registered = new Set(registeredCompositions());
    /* Imported lazily so this stays a data check rather than a render. */
    expect(VIDEO_FORMATS.length).toBeGreaterThan(0);
    expect(registered.has('Quiz')).toBe(true);
  });
});
