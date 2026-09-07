/**
 * §525. The narrator was told it writes cooking videos, whatever the product.
 *
 * `You write voiceover scripts for short cooking videos.` — the system prompt
 * for every product Halyard has. Kinolog's first video, about choosing a film,
 * was narrated by a writer told it wrote about cooking. It produced a good
 * script anyway, because the body it was narrating was obviously about films,
 * and that is precisely why nothing caught it: the model corrected for a wrong
 * prompt and left no trace.
 *
 * The third global constant standing in for a product-level fact, after §518's
 * templates and §520's research domains.
 *
 * §524 rides along: the same prompt bounded sentence length from above and
 * never asked for variation, and produced seven sentences of exactly six words.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(path.join(__dirname, 'copywriter.ts'), 'utf8');

describe('§525 the voiceover prompt belongs to the product', () => {
  it('names no product or vertical of its own', () => {
    /* The one that shipped. Any hard-coded vertical here is the same bug. */
    expect(source).not.toMatch(/voiceover scripts for short cooking videos/);
  });

  it('takes its subject from the caller', () => {
    expect(source).toMatch(/short videos about \$\{input\.subject\.trim\(\)\}/);
  });

  it('falls back to a claim it can support, not to another product', () => {
    /* With no subject the prompt says "short videos" and asserts nothing. */
    expect(source).toMatch(/: 'short videos'/);
  });
});

describe('§524 the voiceover prompt asks for varied rhythm', () => {
  it('bounds length from above and demands variation, not just the bound', () => {
    expect(source).toMatch(/Under twelve words each/);
    expect(source).toMatch(/Vary those lengths hard/);
  });

  it('tells the writer the consequence, since the gate now refuses it', () => {
    expect(source).toMatch(/refused before it reaches a voice/);
  });
});
