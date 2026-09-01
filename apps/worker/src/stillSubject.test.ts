/**
 * §435. A card about the artifact belongs only on a piece about the artifact.
 *
 * Found by opening a finished piece in the Gallery and reading it. A TikTok
 * quiz about baking soda — "Same compound appears in MedlinePlus medicine info
 * and Britannica fire-extinguisher entries" — carried a `chef_note_quote` card
 * reading *"Dairy-free ricotta and mozzarella keep the classic creamy, melty
 * feel of baked ziti."* The alt text underneath described the quiz correctly.
 * The card was built from that run's artifact, which was a ziti recipe.
 *
 * The same line §291 draws for claim verification, §405 for the caption prompt
 * and §413 for the footage gate.
 */
import { describe, expect, it } from 'vitest';
import { POST_FORMAT_CATALOG, POST_FORMATS } from '@halyard/core';

/** The rule §435 applies, stated where it can be asserted. */
const stillIsAboutThisPiece = (formatId: (typeof POST_FORMATS)[number]) =>
  POST_FORMAT_CATALOG[formatId].factuality === 'product';

describe('which pieces get an artifact-drawn still', () => {
  it('gives one to a piece that is about the artifact', () => {
    expect(stillIsAboutThisPiece('transformation')).toBe(true);
    expect(stillIsAboutThisPiece('recipe')).toBe(true);
  });

  it('refuses one to a piece grounded in its own sources', () => {
    /* The card would be about a recipe the piece never mentions. */
    for (const id of ['quiz', 'history', 'myth_fact', 'origin'] as const) {
      expect(stillIsAboutThisPiece(id), `${id} should get no artifact still`).toBe(false);
    }
  });

  it('refuses one to a craft piece too', () => {
    for (const id of ['tips', 'comparison', 'poll', 'behind'] as const) {
      expect(stillIsAboutThisPiece(id), `${id} should get no artifact still`).toBe(false);
    }
  });

  it('leaves at least one format able to draw a still, or the templates are dead', () => {
    /*
     * A rule that refused every format would make five still templates
     * unreachable — which is the defect §395 fixed, arriving from the other
     * side.
     */
    expect(POST_FORMATS.filter(stillIsAboutThisPiece).length).toBeGreaterThan(0);
  });
});
