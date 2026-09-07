/**
 * The type system a render draws with, as plain data.
 *
 * §522. This lives in its own leaf module for one reason: gotcha 10. The video
 * compositions are webpacked for the browser by Remotion, and `templates.ts` —
 * where this used to sit — imports the `@halyard/core` barrel, which reaches
 * `node:crypto`. A *type-only* import of `RenderTypography` was erased at
 * compile and cost nothing; importing the `brandTypography` *value* from the
 * same file pulled the whole graph in and failed at render time with
 * `UnhandledSchemeError`, having typechecked and passed every test first.
 *
 * So: no imports here but a type. Anything added to this file must keep that
 * true, or three video formats stop rendering.
 */
import type { BrandTokens } from './brand.js';

/** One role's type spec. Mirrors `TypeRole` in `@halyard/core`, as plain data. */
export interface TypeRoleSpec {
  family: string;
  weight: number;
  tracking: number;
  scale: number;
  case: 'none' | 'upper';
}

/** The shape `renderTypography()` produces. */
export interface RenderTypography {
  id: string;
  display: TypeRoleSpec;
  heading: TypeRoleSpec;
  body: TypeRoleSpec;
  label: TypeRoleSpec;
}

/**
 * §522. The brand's own faces as a type system.
 *
 * The fallback for any renderer that has not been handed a designed system.
 * Split out of `typeFor` because the video side has no `TemplateBase` to hand
 * and so could not reach it at all: `typeFor` is called in exactly one place in
 * the repo, the image renderer. Narrative, Quiz and Walkthrough each accept an
 * optional `typography` prop, thread it through every text element, and were
 * given one by nothing — so no `font-family` was ever set and every video in
 * those formats rendered in the browser's default serif.
 */
export function brandTypography(brand: BrandTokens): RenderTypography {
  return {
    id: 'brand_default',
    display: { family: brand.headingFont, weight: 400, tracking: -0.005, scale: 1, case: 'none' },
    heading: { family: brand.headingFont, weight: 400, tracking: -0.005, scale: 0.72, case: 'none' },
    body: { family: brand.bodyFont, weight: 400, tracking: 0, scale: 0.34, case: 'none' },
    label: { family: brand.bodyFont, weight: 600, tracking: 0.12, scale: 0.2, case: 'upper' },
  };
}
