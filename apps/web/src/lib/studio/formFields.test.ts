/**
 * §391. A form field nobody reads is silently dropped.
 *
 * The Brief sent `<input name="format">` and `makePiece` reads `postFormat`.
 * `FormData` has no schema and no compiler behind it, so the mismatch produced
 * no error anywhere: every shape an operator chose on that panel — quiz,
 * history, tips — was discarded on the way to the job, and the run picked its
 * own. It was found by driving the room and reading the payload out of the
 * database, which is the only way it *could* be found.
 *
 * This is `payloadCoverage.test.ts` for server actions: the same defect shape
 * (decision 71) at the other end of the same pipe. A `name=` that no action
 * reads is a control that does nothing.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.join(__dirname, '..', '..');

function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/**
 * Names that are not form fields.
 *
 * `name` on a `<button>` inside a form *is* submitted, so buttons are scanned
 * too. These are the attributes that share the word without sharing the
 * meaning — a route segment, an SVG gradient, a chart series.
 */
const NOT_A_FIELD = new Set(['csrf', 'utf8']);

describe('every form field is read by something', () => {
  it('has a reader for each name a form submits', () => {
    const files = sources(SRC);

    /*
     * What counts as read.
     *
     * `formData.get('x')` is the direct form. `TikTokPanel`'s four checkboxes
     * go through a helper — `const on = (name) => formData.get(name) === 'on'`,
     * then `on('brandOrganic')` — so the literal is there but not next to
     * `formData`. Any string literal inside a file that handles `FormData`
     * counts, which catches both without admitting the whole codebase.
     */
    const read = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      /*
       * Files that actually *read* a FormData, not merely mention the type.
       * `BriefPanel` types its `action` prop as `(f: FormData) => void`, so a
       * looser gate let it admit its own field names — the file declaring the
       * bug vouching for it.
       */
      if (!/formData\.(?:get|getAll)\(/.test(source)) continue;
      for (const m of source.matchAll(/['"]([a-zA-Z][a-zA-Z0-9_]*)['"]/g)) read.add(m[1]!);
    }

    /*
     * A GET form has no action and posts its fields as a query string, read
     * through `searchParams` — the media library's search box is one. Those are
     * read, just by a different mechanism, so the mechanism is checked too.
     */
    const fromSearchParams = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/(?:sp|params|searchParams)\.([a-zA-Z][a-zA-Z0-9_]*)/g)) {
        fromSearchParams.add(m[1]!);
      }
      for (const m of source.matchAll(/searchParams\.get\(\s*['"]([^'"]+)['"]/g)) {
        fromSearchParams.add(m[1]!);
      }
      /* `searchParams: Promise<{ status?: string; view?: string }>` */
      for (const m of source.matchAll(/searchParams:\s*Promise<\{([^}]*)\}/g)) {
        for (const k of m[1]!.matchAll(/([a-zA-Z][a-zA-Z0-9_]*)\s*\??:/g)) {
          fromSearchParams.add(k[1]!);
        }
      }
    }

    const orphans: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      /*
       * A form handled entirely in the browser submits nothing. `SignInForm`
       * reads its email and password from React state and calls Supabase — the
       * `name` attributes are there for password managers, which is a real
       * reason to have them and not a promise to a server action.
       */
      if (/onSubmit=/.test(source)) continue;
      for (const m of source.matchAll(
        /<(?:input|button|select|textarea)\s[^>]*name="([^"]+)"/g,
      )) {
        const name = m[1]!;
        if (NOT_A_FIELD.has(name) || read.has(name) || fromSearchParams.has(name)) continue;
        orphans.push(`${path.relative(SRC, file)}: name="${name}"`);
      }
    }

    expect([...new Set(orphans)], 'form fields no server action reads').toEqual([]);
  });
});
