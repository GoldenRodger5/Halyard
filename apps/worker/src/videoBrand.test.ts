/**
 * §521. Whose mark goes at the foot of the frame.
 *
 * Every Remotion composition declares `wordmark: 'recipefix'` in its
 * `defaultProps` — sample data for the Studio preview — and the video render
 * never supplied one, so the default won. Every video this system ever made
 * was signed RecipeFix, which was invisibly correct with one product and a
 * brand failure with two: Kinolog's first video, about choosing a film, went
 * out signed RECIPEFIX.
 *
 * A unit test cannot render Remotion, so this holds the two things that made
 * it possible: the defaults still exist (they are preview data, not a bug),
 * and the render handler passes both the product's wordmark and a *resolved*
 * brand rather than the raw column.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(__dirname, '../../..');
const renderSource = readFileSync(path.join(REPO, 'apps/worker/src/handlers/render.ts'), 'utf8');
const rootSource = readFileSync(path.join(REPO, 'packages/render/src/video/root.tsx'), 'utf8');

describe('§521 a video carries its own product', () => {
  it('the compositions still default to sample data, which is why a missing prop is silent', () => {
    expect(rootSource).toMatch(/wordmark: 'recipefix'/);
  });

  it('the video render is given the product name as its wordmark', () => {
    /* Both call sites — image and video — take it from the same product row. */
    const calls = renderSource.match(/product\.rows\[0\]\?\.name\?\.toLowerCase\(\)/g) ?? [];
    expect(calls.length, 'image and video must both be branded').toBeGreaterThanOrEqual(2);
  });

  it('passes a resolved brand rather than the raw column', () => {
    expect(renderSource).toMatch(/brand: resolveBrand\(brandTokens\)/);
    /* The raw pass-through is what let a snake_case or partial row fall back. */
    expect(renderSource).not.toMatch(/\{ brand: brandTokens \}/);
  });

  it('only sends a wordmark when there is one, so a null product does not print "undefined"', () => {
    expect(renderSource).toMatch(/\.\.\.\(wordmark \? \{ wordmark \} : \{\}\)/);
  });
});
