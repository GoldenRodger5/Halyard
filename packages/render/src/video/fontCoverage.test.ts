/**
 * §522. Every composition loads the faces, and every composition has a face.
 *
 * `fonts.tsx` opens by saying that without `<Fonts />` a composition renders in
 * the browser's default serif. Only `compositions.tsx` ever mounted it, so
 * Narrative, Quiz and Walkthrough — three of the seven roots, and the three
 * that carry the long-form pieces — rendered every video they ever made in
 * Times New Roman, for every product. Nothing caught it because it is not a
 * type error, not a crash, and not visible in any test that does not look at a
 * frame.
 *
 * The second half was independent and had the same effect: each of those roots
 * accepts an optional `typography` prop and threads it through every text
 * element, and `typeFor` — the only thing that builds one — is called in
 * exactly one place in the repo, the *image* renderer. So `face()` returned an
 * empty object and no `font-family` was set even where a face had loaded.
 *
 * This test reads the sources rather than rendering, because rendering a
 * Remotion composition needs a browser. It is a coverage check: the point is
 * that a *new* composition cannot quietly join the fontless three.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = path.resolve(__dirname);
const rootSource = readFileSync(path.join(DIR, 'root.tsx'), 'utf8');

/** The files holding a composition root, found from what root.tsx imports. */
const COMPOSITION_FILES = readdirSync(DIR)
  .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
  .filter((f) => f !== 'root.tsx' && f !== 'fonts.tsx' && f !== 'entry.tsx');

/** A file holds a root if root.tsx imports a component from it. */
function isCompositionRoot(file: string): boolean {
  const stem = file.replace(/\.tsx$/, '');
  return new RegExp(`from '\\./${stem}\\.js'`).test(rootSource);
}

const ROOTS = COMPOSITION_FILES.filter(isCompositionRoot);

describe('§522 every video composition has type', () => {
  /*
   * Gotcha 10, paid for again. The typography data first went into
   * `image/templates.ts`, which imports the `@halyard/core` barrel and through
   * it `node:crypto`. A type-only import of it was erased at compile; the
   * *value* import needed here pulled the whole graph into Remotion's webpack
   * bundle. It typechecked, it passed every test, and it failed at render with
   * `UnhandledSchemeError` — three video formats simply stopped rendering.
   */
  it.each(COMPOSITION_FILES)('%s does not import a value from the image templates', (file) => {
    const source = readFileSync(path.join(DIR, file), 'utf8');
    const templateImports = source.match(/^import (?!type ).*from '\.\.\/image\/templates\.js';$/gm) ?? [];
    expect(templateImports, 'a value import here webpacks node:crypto into the browser').toEqual([]);
  });

  it('finds the composition roots, so an empty list cannot pass this file', () => {
    expect(ROOTS.length).toBeGreaterThanOrEqual(3);
    expect(ROOTS).toContain('narrative.tsx');
    expect(ROOTS).toContain('quiz.tsx');
    expect(ROOTS).toContain('walkthrough.tsx');
  });

  it.each(ROOTS)('%s mounts <Fonts /> so the bundled faces are registered', (file) => {
    const source = readFileSync(path.join(DIR, file), 'utf8');
    expect(source, `${file} renders in the default serif without it`).toMatch(/<Fonts\s*\/>/);
  });

  it.each(ROOTS)('%s sets a font-family on its root element', (file) => {
    const source = readFileSync(path.join(DIR, file), 'utf8');
    expect(source, `${file} sets no family, so text inherits the serif`).toMatch(
      /fontFamily: brand\.(bodyFont|headingFont)/,
    );
  });

  it.each(ROOTS.filter((f) => readFileSync(path.join(DIR, f), 'utf8').includes('typography,')))(
    '%s defaults its typography to the brand rather than leaving it undefined',
    (file) => {
      const source = readFileSync(path.join(DIR, file), 'utf8');
      expect(source).toMatch(/typography \?\? brandTypography\(brand\)/);
      /* And nothing still passes the raw, usually-undefined prop downward. */
      expect(source).not.toMatch(/face\(typography,/);
      expect(source).not.toMatch(/type=\{typography\}/);
    },
  );
});
