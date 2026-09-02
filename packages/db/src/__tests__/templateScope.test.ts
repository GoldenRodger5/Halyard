/**
 * §518. A format template scoped to one product is how the second product
 * silently loses a channel.
 *
 * `enabledTemplates` reads `product_id = $1 or product_id is null`. Every
 * template except two pins belonged to `recipefix`, so Kinolog — a real
 * product with facts and evidence — could render neither a video nor a
 * carousel, and every quality judgement this system has made was made against
 * one product.
 *
 * The classification is not taste: a template built by `formatVideo.ts` or
 * `formatSlides.ts` draws **written slots** and is neutral by construction,
 * while one built by `artifactProps.ts` draws a **recipe adaptation** and is
 * not. This reads the builders and holds the migration to them.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(__dirname, '../../../..');
const MIGRATIONS = path.join(REPO, 'supabase/migrations');

/** Composition ids that `formatVideo.ts` returns — built from written slots. */
function slotDrivenCompositions(): string[] {
  const source = readFileSync(path.join(REPO, 'packages/render/src/video/formatVideo.ts'), 'utf8');
  return [...source.matchAll(/compositionId: '([A-Za-z_0-9]+)'/g)].map((m) => m[1]!);
}

/** Composition ids that `artifactProps.ts` owns — built from a product artifact. */
function artifactDrivenCompositions(): string[] {
  const source = readFileSync(path.join(REPO, 'packages/render/src/video/artifactProps.ts'), 'utf8');
  const union = /export type [A-Za-z]*Composition[A-Za-z]* =([\s\S]*?);/.exec(source);
  const body = union ? union[1]! : source;
  return [...body.matchAll(/'([A-Za-z_0-9]+)'/g)].map((m) => m[1]!);
}

/** Ids the newest migration makes available to every product. */
function neutralised(): string[] {
  let ids: string[] = [];
  for (const file of readdirSync(MIGRATIONS).sort()) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    for (const m of sql.matchAll(
      /update\s+templates\s+set\s+product_id\s*=\s*null\s+where\s+id\s+in\s*\(([^)]*)\)/gi,
    )) {
      ids = [...m[1]!.matchAll(/'([A-Za-z_0-9]+)'/g)].map((x) => x[1]!);
    }
  }
  return ids;
}

describe('§518 template scope', () => {
  it('reads the builders, so this cannot pass by finding nothing', () => {
    expect(slotDrivenCompositions()).toContain('Narrative');
    expect(artifactDrivenCompositions()).toContain('TransformationDiff');
    expect(neutralised().length).toBeGreaterThan(3);
  });

  it('every composition built from written slots is available to any product', () => {
    const neutral = new Set(neutralised());
    const stranded = [...new Set(slotDrivenCompositions())].filter((id) => !neutral.has(id));
    expect(
      stranded,
      'slot-driven templates still owned by one product — a second product cannot use these',
    ).toEqual([]);
  });

  it('never hands a product-specific template to every product', () => {
    const neutral = new Set(neutralised());
    const artifactOnly = [...new Set(artifactDrivenCompositions())].filter(
      (id) => !new Set(slotDrivenCompositions()).has(id),
    );
    const leaked = artifactOnly.filter((id) => neutral.has(id));
    expect(
      leaked,
      'these draw a recipe adaptation and would render nothing for another product',
    ).toEqual([]);
  });
});
