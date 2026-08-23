/**
 * Every SQL statement Halyard writes as a plain string literal, with where it
 * came from.
 *
 * Read off disk rather than imported, so this has no dependency on the packages
 * it scans and cannot drag their runtime into the test.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const ROOTS = ['apps/worker/src', 'apps/web/src', 'packages/core/src', 'scripts'];

export interface SqlStatement { file: string; line: number; sql: string }

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { walk(full, out); continue; }
    if (full.endsWith('.ts') && !full.includes('.test.')) out.push(full);
  }
}

/**
 * Only complete statements. A fragment — a bare `where` clause, a column list —
 * cannot be planned on its own, and trying would report a parse error that says
 * nothing about whether the schema matches.
 */
const STARTS = /^\s*(with|select|insert\s+into|update|delete\s+from)\b/i;


/**
 * Blank out comments, preserving line positions.
 *
 * A doc comment that quotes SQL in backticks — "a plain `select … where x is
 * null` lets both read the same rows" — is indistinguishable from a template
 * literal to a regex, and this scanner reported one as a broken statement
 * referencing a column named `…`. A false positive in a safety net is worse
 * than a gap: it trains the next person to disbelieve the net.
 *
 * Replaced with spaces rather than removed so `line` still points at the real
 * line in the file.
 */
function stripComments(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) => lead + blank(m.slice(lead.length)));
}

export function collectSqlStatements(): SqlStatement[] {
  const files: string[] = [];
  for (const r of ROOTS) {
    const abs = path.join(ROOT, r);
    try { walk(abs, files); } catch { /* absent root */ }
  }
  const out: SqlStatement[] = [];
  for (const file of files) {
    const src = stripComments(readFileSync(file, 'utf8'));
    const re = /`([^`]*)`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const body = m[1]!;
      // Interpolated SQL cannot be planned without inventing the missing text,
      // and inventing it would validate a statement nothing runs. Twelve of
      // roughly four hundred and fifty; reported by the test rather than hidden.
      if (body.includes('${')) continue;
      if (!STARTS.test(body)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      out.push({ file: path.relative(ROOT, file), line, sql: body.trim() });
    }
  }
  return out;
}
